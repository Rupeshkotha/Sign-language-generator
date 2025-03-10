# backend/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from models.inference import SignLanguageInference
import os
import time
import traceback

app = Flask(__name__)
CORS(app)

print("Starting Sign Language Translation Server...")

# Model paths - using absolute paths to ensure correct file location
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'sign_language_model_chunk_167.pt')  # Updated to use PyTorch model
WORD_TO_ID_PATH = os.path.join(MODEL_DIR, 'word_to_id.json')
WORD_EMBEDDINGS_PATH = os.path.join(MODEL_DIR, 'word_embeddings.pkl')

# Check if model files exist
print("Checking model files...")
print(f"Model path exists: {os.path.exists(MODEL_PATH)}")
print(f"Word-to-ID path exists: {os.path.exists(WORD_TO_ID_PATH)}")
print(f"Word embeddings path exists: {os.path.exists(WORD_EMBEDDINGS_PATH)}")

# Initialize components
try:
    print("Loading model...")
    sign_generator = SignLanguageInference(
        model_path=MODEL_PATH,
        word_to_id_path=WORD_TO_ID_PATH,
        word_embeddings_path=WORD_EMBEDDINGS_PATH
    )
    components_healthy = True
    print("Model loaded successfully!")
except Exception as e:
    print(f"Error during initialization: {str(e)}")
    print("Full traceback:")
    traceback.print_exc()
    sign_generator = None
    components_healthy = False

@app.route('/', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy" if components_healthy else "error",
        "message": "Sign Language Translation API",
        "timestamp": time.time(),
        "vocab_size": len(sign_generator.vocabulary) if components_healthy else 0
    })

@app.route('/get_sign', methods=['POST'])
def get_sign():
    """Get sign language animation for a single word"""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    word = request.json.get('word')
    if not word:
        return jsonify({"error": "No word provided"}), 400

    try:
        if not sign_generator:
            return jsonify({"error": "Sign generator not available"}), 503

        # Generate keypoints for the word
        result = sign_generator.generate_keypoints(word)
        return jsonify({
            "success": True,
            "word": word,
            "sign": result
        })
    except Exception as e:
        print(f"Error in get_sign: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/translate_text', methods=['POST'])
def translate_text():
    """Translate text to sign language animations"""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    text = request.json.get('text')
    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        if not sign_generator:
            return jsonify({"error": "Sign generator not available"}), 503
            
        # Generate keypoints for all words
        results = sign_generator.generate_sequence(text)
        
        print("Generated sequence results:", {
            "word_count": len(text.split()),
            "results_count": len(results),
            "sample_result": results[0] if results else None,
            "has_keypoints": all('keypoints' in r for r in results)
        })
            
        return jsonify({
            "success": True,
            "text": text,
            "word_count": len(text.split()),
            "signs": results,
            "metrics": {
                "signs_generated": len(results),
                "coverage": len(results) / len(text.split()) if text.split() else 0
            }
        })
    except Exception as e:
        print(f"Error in translate_text: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/vocabulary', methods=['GET'])
def get_vocabulary():
    """Get list of all known words"""
    try:
        if not sign_generator:
            return jsonify({"error": "Sign generator not available"}), 503
            
        return jsonify({
            "success": True,
            "vocabulary": sign_generator.vocabulary,
            "count": len(sign_generator.vocabulary)
        })
    except Exception as e:
        print(f"Error in get_vocabulary: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)