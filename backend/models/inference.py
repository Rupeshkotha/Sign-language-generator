import torch
import torch.nn as nn
import numpy as np
import pickle
import json
from pathlib import Path
from transformers import DistilBertTokenizer, DistilBertModel

# Constants (matching training)
NUM_FRAMES = 30
EMBEDDING_DIM = 256
NUM_TRANSFORMER_LAYERS = 2
NUM_ATTENTION_HEADS = 4
INTERMEDIATE_DIM = 256
NUM_HAND_LANDMARKS = 21
NUM_POSE_LANDMARKS = 33
FRAME_DIMS = (NUM_HAND_LANDMARKS * 3 * 2) + (NUM_POSE_LANDMARKS * 3)

class SignLanguageModel(nn.Module):
    def __init__(self, num_words, embedding_dim, num_frames, frame_dims):
        super(SignLanguageModel, self).__init__()
        
        # Word embedding projection
        self.word_projection = nn.Linear(768, embedding_dim)  # 768 is DistilBERT's dimension
        self.activation = nn.ReLU()
        
        # Frame position embeddings
        self.frame_position_embedding = nn.Embedding(num_frames, embedding_dim)
        
        # Transformer layers
        self.transformer_layers = nn.ModuleList([
            nn.TransformerEncoderLayer(
                d_model=embedding_dim,
                nhead=NUM_ATTENTION_HEADS,
                dim_feedforward=INTERMEDIATE_DIM,
                dropout=0.1,
                batch_first=True
            ) for _ in range(NUM_TRANSFORMER_LAYERS)
        ])
        
        # Output projection to keypoints
        self.output_projection = nn.Linear(embedding_dim, frame_dims)
        
        # Dropout
        self.dropout = nn.Dropout(0.1)
        
    def forward(self, x):
        # x is BERT embeddings [batch_size, 768]
        word_embedding = self.activation(self.word_projection(x))  # [batch_size, embedding_dim]
        
        # Expand to match sequence length for transformer input
        word_embedding = word_embedding.unsqueeze(1)  # [batch_size, 1, embedding_dim]
        word_embedding = word_embedding.repeat(1, NUM_FRAMES, 1)  # [batch_size, num_frames, embedding_dim]
        
        # Add positional information
        positions = torch.arange(NUM_FRAMES, device=x.device)
        pos_embedding = self.frame_position_embedding(positions)  # [num_frames, embedding_dim]
        pos_embedding = pos_embedding.unsqueeze(0)  # [1, num_frames, embedding_dim]
        x = word_embedding + pos_embedding  # [batch_size, num_frames, embedding_dim]
        
        # Apply transformer layers
        for layer in self.transformer_layers:
            x = layer(x)
        
        # Project to keypoint dimensions
        keypoints = self.output_projection(x)  # [batch_size, num_frames, frame_dims]
        
        return keypoints

class SignLanguageInference:
    def __init__(self, model_path: str, word_to_id_path: str, word_embeddings_path: str):
        """
        Initialize the sign language inference model
        
        Args:
            model_path: Path to the trained model file
            word_to_id_path: Path to word_to_id.json
            word_embeddings_path: Path to word_embeddings.pkl
        """
        # Set device
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {self.device}")
        
        # Load model
        print(f"Loading model from {model_path}...")
        checkpoint = torch.load(model_path, map_location=self.device)
        model_config = checkpoint['model_config']
        
        self.model = SignLanguageModel(
            num_words=model_config['num_words'],
            embedding_dim=model_config['embedding_dim'],
            num_frames=model_config['num_frames'],
            frame_dims=model_config['frame_dims']
        )
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.to(self.device)
        self.model.eval()
        print("Model loaded successfully!")
        
        # Load word mappings
        with open(word_to_id_path, 'r') as f:
            self.word_to_id = json.load(f)
        self.id_to_word = {v: k for k, v in self.word_to_id.items()}
        
        # Load word embeddings
        with open(word_embeddings_path, 'rb') as f:
            self.word_embeddings = pickle.load(f)
            
        # Initialize BERT tokenizer for new words
        self.tokenizer = DistilBertTokenizer.from_pretrained('distilbert-base-uncased')
        self.bert_model = DistilBertModel.from_pretrained('distilbert-base-uncased')
        self.bert_model.to(self.device)
        self.bert_model.eval()
            
    def normalize_embedding(self, embedding: np.ndarray) -> np.ndarray:
        """Normalize embedding vector to a consistent range while preserving relative magnitudes"""
        # Calculate current magnitude
        magnitude = np.linalg.norm(embedding)
        
        if magnitude > 0:
            # Instead of normalizing to 1, let's scale to a target range
            # Most pre-computed embeddings are around 6-8 in magnitude
            # So let's scale new embeddings to have similar magnitudes
            target_magnitude = 7.0  # Target magnitude based on pre-computed embeddings
            scale_factor = target_magnitude / magnitude
            return embedding * scale_factor
            
        return embedding

    def get_word_embedding(self, word: str) -> np.ndarray:
        """Get embedding for a word, either from cache or generate new"""
        # Clean the word - remove punctuation and special characters
        word = ''.join(c for c in word.lower() if c.isalnum() or c.isspace())
        
        if not word:  # If word is empty after cleaning
            print(f"Warning: Empty word after cleaning, using neutral embedding")
            # Return a neutral embedding (zeros)
            return np.zeros(768)
            
        if word in self.word_to_id:
            # Get pre-computed embedding - no need to normalize these
            # as they're already in the correct range
            word_id = self.word_to_id[word]
            embedding = self.word_embeddings[word_id]
            print(f"Using pre-computed embedding for word: '{word}' (magnitude: {np.linalg.norm(embedding):.3f})")
            return embedding
        else:
            # Generate new embedding using BERT
            print(f"Generating new BERT embedding for unknown word: '{word}'")
            inputs = self.tokenizer(word, return_tensors='pt', padding=True, truncation=True)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            with torch.no_grad():
                outputs = self.bert_model(**inputs)
            embedding = torch.mean(outputs.last_hidden_state, dim=1).cpu().numpy()[0]
            
            # Normalize only the BERT-generated embeddings
            original_magnitude = np.linalg.norm(embedding)
            normalized_embedding = self.normalize_embedding(embedding)
            final_magnitude = np.linalg.norm(normalized_embedding)
            
            print(f"BERT embedding magnitude: {original_magnitude:.3f} -> normalized to: {final_magnitude:.3f}")
            
            return normalized_embedding

    def validate_keypoints(self, keypoints: np.ndarray) -> bool:
        """Validate keypoint values are within expected ranges"""
        # Check if any values are NaN or infinite
        if np.any(np.isnan(keypoints)) or np.any(np.isinf(keypoints)):
            print("Warning: Found NaN or infinite values in keypoints")
            return False
            
        # Check if values are within expected range (-0.3 to 0.3 with some margin)
        if np.any(np.abs(keypoints) > 0.3):
            print(f"Warning: Found keypoint values outside expected range: {np.min(keypoints):.3f} to {np.max(keypoints):.3f}")
            return False
            
        return True

    def scale_keypoints(self, keypoints: np.ndarray) -> np.ndarray:
        """Scale keypoints to fit within the expected range (-0.3 to 0.3)"""
        # Find the maximum absolute value across all dimensions
        max_abs = np.max(np.abs(keypoints))
        
        if max_abs > 0:
            # Scale all values to fit within [-0.3, 0.3]
            scale_factor = 0.3 / max_abs
            keypoints = keypoints * scale_factor
            
        return keypoints

    def generate_keypoints(self, word: str) -> dict:
        """Generate sign language keypoints for a word"""
        try:
            # Clean and validate the word
            word = word.strip().lower()
            if not word or not word.isalpha():
                raise ValueError(f"Invalid word format: '{word}'. Words must contain only letters.")
            
            if len(word) < 2:
                raise ValueError(f"Word '{word}' is too short. Minimum length is 2 characters.")
            
            # Check if word exists in vocabulary
            if word not in self.vocabulary:
                print(f"Generating new BERT embedding for unknown word: '{word}'")
                embedding = self.get_word_embedding(word)
                embedding_magnitude = float(np.linalg.norm(embedding))
                print(f"BERT embedding magnitude: {embedding_magnitude:.3f} -> normalized to: {7.0:.3f}")
            else:
                print(f"Using pre-computed embedding for word: '{word}'")
                embedding = self.word_embeddings[self.word_to_id[word]]
            
            # Generate keypoints using the model
            with torch.no_grad():
                embedding_tensor = torch.tensor(embedding).float().unsqueeze(0)
                keypoints = self.model(embedding_tensor)
                keypoints = keypoints.squeeze().numpy()
            
            # Scale keypoints to fit within expected range
            keypoints = self.scale_keypoints(keypoints)
            
            # Only log the shape and range, not the raw array
            print(f"Generated keypoints for word '{word}' with shape {keypoints.shape}")
            print(f"Value range: min={np.min(keypoints):.3f}, max={np.max(keypoints):.3f}")

            # Validate keypoints
            if not self.validate_keypoints(keypoints):
                print(f"Warning: Generated invalid keypoints for word '{word}'")
                keypoints = np.clip(keypoints, -0.3, 0.3)

            # Convert to the expected format
            frames = []
                
            for i in range(NUM_FRAMES):
                frame_data = keypoints[i]
                
                # Split into left hand, right hand, and pose
                left_hand = frame_data[:NUM_HAND_LANDMARKS*3].reshape(-1, 3)
                right_hand = frame_data[NUM_HAND_LANDMARKS*3:NUM_HAND_LANDMARKS*6].reshape(-1, 3)
                pose = frame_data[NUM_HAND_LANDMARKS*6:].reshape(-1, 3)
                
                # Scale and normalize coordinates to match frontend expectations
                def normalize_coordinates(points):
                    # Convert to list of [x, y, z] coordinates and ensure proper scaling
                    return [[float(x), float(y), float(z)] for x, y, z in points]
                
                frame = {
                    'timestamp': float(i / 30.0),  # Ensure timestamp is float
                    'left_hand': normalize_coordinates(left_hand),
                    'right_hand': normalize_coordinates(right_hand),
                    'pose': normalize_coordinates(pose)
                }
                frames.append(frame)
            
            # Ensure all numeric values are proper floats
            result = {
                'word': str(word),  # Ensure word is string
                'keyframes': frames,
                'fps': 30.0,  # Ensure fps is float
                'duration': float(NUM_FRAMES / 30.0),  # Ensure duration is float
                'source': 'generated'  # Add source information
            }
            
            # Log a sample of the formatted keypoints
            if frames:
                print(f"Keypoint structure for word '{word}':")
                print(f"- Total frames: {len(frames)}")
                print(f"- Frame points: {len(frames[0]['left_hand'])} left hand, {len(frames[0]['right_hand'])} right hand, {len(frames[0]['pose'])} pose")
                print(f"- Duration: {result['duration']:.2f}s at {result['fps']} fps")
            
            # Validate the output format
            try:
                # Verify all keyframes have correct structure
                for frame in result['keyframes']:
                    assert len(frame['left_hand']) == NUM_HAND_LANDMARKS, f"Left hand has {len(frame['left_hand'])} points, expected {NUM_HAND_LANDMARKS}"
                    assert len(frame['right_hand']) == NUM_HAND_LANDMARKS, f"Right hand has {len(frame['right_hand'])} points, expected {NUM_HAND_LANDMARKS}"
                    assert len(frame['pose']) == NUM_POSE_LANDMARKS, f"Pose has {len(frame['pose'])} points, expected {NUM_POSE_LANDMARKS}"
                    
                    # Verify coordinate format
                    for points in [frame['left_hand'], frame['right_hand'], frame['pose']]:
                        for point in points:
                            assert len(point) == 3, f"Point should have 3 coordinates, got {len(point)}"
                            assert all(isinstance(x, float) for x in point), "All coordinates must be floats"
                
                print(f"Successfully validated keypoint format for word '{word}'")
                return result
                
            except AssertionError as e:
                print(f"Error in keypoint format: {str(e)}")
                raise ValueError(f"Invalid keypoint format: {str(e)}")
        except Exception as e:
            print(f"Error generating keypoints for word '{word}': {str(e)}")
            raise
    
    def generate_sequence(self, text: str) -> list:
        """Generate sign language keypoints for a sequence of words"""
        words = text.lower().split()
        results = []
        
        for word in words:
            try:
                keypoints = self.generate_keypoints(word)
                results.append(keypoints)
            except Exception as e:
                print(f"Error generating keypoints for word '{word}': {str(e)}")
                continue
        
        return results
    
    @property
    def vocabulary(self) -> list:
        """Get list of all known words"""
        return list(self.word_to_id.keys()) 