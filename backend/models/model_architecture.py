import tensorflow as tf
from tensorflow.keras import layers, Model
from tensorflow.keras import mixed_precision
from tensorflow.keras.mixed_precision import Policy

# Set global policy
policy = Policy('mixed_float16')
mixed_precision.set_global_policy(policy)

@tf.keras.saving.register_keras_serializable(package="CustomModels")
class SignLanguageModel(Model):
    def __init__(self, num_words=None, embedding_dim=256, num_frames=30, frame_dims=225, trainable=True, dtype=None):
        if dtype is None:
            dtype = policy
        elif isinstance(dtype, dict):
            # Extract policy name from config
            if 'config' in dtype and 'name' in dtype['config']:
                dtype = Policy(dtype['config']['name'])
            else:
                dtype = policy  # Fallback to default policy
        elif isinstance(dtype, str):
            dtype = Policy(dtype)
            
        super(SignLanguageModel, self).__init__(trainable=trainable, dtype=dtype)
        
        # Save init parameters
        self.num_words = num_words
        self.embedding_dim = embedding_dim
        self.num_frames = num_frames
        self.frame_dims = frame_dims

        # Word embedding projection
        self.word_projection = layers.Dense(embedding_dim, activation='relu', dtype=dtype)

        # Create multi-head attention layers and feed-forward networks
        self.attention_layers = []
        self.ffn_layers = []
        self.layer_norms1 = []
        self.layer_norms2 = []

        for _ in range(2):  # NUM_TRANSFORMER_LAYERS = 2
            # Create attention layer with explicit query/key/value dimensions
            attention = layers.MultiHeadAttention(
                num_heads=4,  # NUM_ATTENTION_HEADS = 4
                key_dim=embedding_dim // 4,
                value_dim=embedding_dim // 4,
                output_shape=embedding_dim,  # Match embedding dimension
                use_bias=True,
                dtype=dtype
            )
            # Build the layer with input shape
            attention.build(input_shape=[(None, None, embedding_dim)] * 3)  # For query, key, value
            self.attention_layers.append(attention)

            # Feed-forward network
            self.ffn_layers.append([
                layers.Dense(256, activation='relu', dtype=dtype),  # INTERMEDIATE_DIM = 256
                layers.Dense(embedding_dim, dtype=dtype)
            ])

            # Layer normalization
            self.layer_norms1.append(layers.LayerNormalization(dtype=dtype))
            self.layer_norms2.append(layers.LayerNormalization(dtype=dtype))

        # Frame position embeddings
        self.frame_position_embedding = layers.Embedding(
            input_dim=num_frames,
            output_dim=embedding_dim,
            dtype=dtype
        )

        # Output projection to keypoints
        self.output_projection = layers.Dense(frame_dims, dtype=dtype)

        # Dropout
        self.dropout = layers.Dropout(0.1)

    def call(self, inputs, training=False):
        # Cast inputs to compute dtype
        inputs = tf.cast(inputs, self.compute_dtype)
        
        # Input is BERT embeddings [batch_size, 768]
        word_embedding = self.word_projection(inputs)  # [batch_size, embedding_dim]

        # Expand to match sequence length for transformer input
        word_embedding = tf.expand_dims(word_embedding, axis=1)  # [batch_size, 1, embedding_dim]
        word_embedding = tf.tile(word_embedding, [1, self.num_frames, 1])  # [batch_size, num_frames, embedding_dim]

        # Add positional information
        positions = tf.range(self.num_frames)
        pos_embedding = self.frame_position_embedding(positions)  # [num_frames, embedding_dim]
        pos_embedding = tf.expand_dims(pos_embedding, axis=0)  # [1, num_frames, embedding_dim]
        x = word_embedding + pos_embedding  # [batch_size, num_frames, embedding_dim]

        # Apply transformer layers
        for i in range(len(self.attention_layers)):
            # Multi-head attention
            attention_output = self.attention_layers[i](
                query=x,
                value=x,
                key=x,
                training=training
            )
            attention_output = self.dropout(attention_output, training=training)
            x1 = self.layer_norms1[i](x + attention_output)

            # Feed-forward network
            ffn_output = x1
            for layer in self.ffn_layers[i]:
                ffn_output = layer(ffn_output)
            ffn_output = self.dropout(ffn_output, training=training)
            x = self.layer_norms2[i](x1 + ffn_output)

        # Project to keypoint dimensions
        keypoints = self.output_projection(x)  # [batch_size, num_frames, frame_dims]
        
        # Cast output to float32 for stability
        return tf.cast(keypoints, tf.float32)

    def get_config(self):
        config = super(SignLanguageModel, self).get_config()
        config.update({
            'num_words': self.num_words,
            'embedding_dim': self.embedding_dim,
            'num_frames': self.num_frames,
            'frame_dims': self.frame_dims,
        })
        return config

    @classmethod
    def from_config(cls, config):
        return cls(**config) 