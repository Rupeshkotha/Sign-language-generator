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
            
    def get_word_embedding(self, word: str) -> np.ndarray:
        """Get embedding for a word, either from cache or generate new"""
        word = word.lower()
        if word in self.word_to_id:
            # Get pre-computed embedding
            word_id = self.word_to_id[word]
            return self.word_embeddings[word_id]
        else:
            # Generate new embedding using BERT
            inputs = self.tokenizer(word, return_tensors='pt', padding=True, truncation=True)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            with torch.no_grad():
                outputs = self.bert_model(**inputs)
            # Use mean pooling to get word embedding
            return torch.mean(outputs.last_hidden_state, dim=1).cpu().numpy()[0]
    
    def generate_keypoints(self, word: str) -> dict:
        """Generate sign language keypoints for a word"""
        # Get word embedding
        embedding = self.get_word_embedding(word)
        embedding = torch.tensor(embedding, dtype=torch.float32).unsqueeze(0).to(self.device)  # Add batch dimension
        
        # Generate keypoints
        with torch.no_grad():
            keypoints = self.model(embedding)[0].cpu().numpy()  # Remove batch dimension
        
        # Convert to the expected format
        frames = []
        
        for i in range(NUM_FRAMES):
            frame_data = keypoints[i]
            
            # Split into left hand, right hand, and pose
            left_hand = frame_data[:NUM_HAND_LANDMARKS*3].reshape(-1, 3)
            right_hand = frame_data[NUM_HAND_LANDMARKS*3:NUM_HAND_LANDMARKS*6].reshape(-1, 3)
            pose = frame_data[NUM_HAND_LANDMARKS*6:].reshape(-1, 3)
            
            frame = {
                'timestamp': i / 30.0,  # Assuming 30 fps
                'left_hand': left_hand.tolist(),
                'right_hand': right_hand.tolist(),
                'pose': pose.tolist(),
                'confidence': 1.0  # This is a generated frame
            }
            frames.append(frame)
        
        return {
            'word': word,
            'keyframes': frames,
            'fps': 30.0,
            'duration': NUM_FRAMES / 30.0,
            'confidence': 1.0
        }
    
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