# backend/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from models.inference import SignLanguageInference
import os
import time
import traceback
import logging

app = Flask(__name__)
CORS(app)

print("Starting Sign Language Translation Server...")

# Enable more detailed logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.before_request
def log_request_info():
    """Log details about every incoming request"""
    logger.info('Headers: %s', dict(request.headers))
    logger.info('Body: %s', request.get_data())
    logger.info('URL: %s %s', request.method, request.url)

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
        
        # Validate result structure
        if not result or 'keyframes' not in result:
            return jsonify({"error": f"Invalid keypoint structure generated for word '{word}'"}), 500
            
        # Validate keyframes
        for i, frame in enumerate(result['keyframes']):
            if not all(k in frame for k in ['left_hand', 'right_hand', 'pose', 'timestamp']):
                return jsonify({"error": f"Missing required keypoints in frame {i} for word '{word}'"}), 500
                
            # Validate point counts
            if len(frame['left_hand']) != 21 or len(frame['right_hand']) != 21 or len(frame['pose']) != 33:
                return jsonify({
                    "error": f"Invalid number of keypoints in frame {i} for word '{word}'",
                    "details": {
                        "left_hand": len(frame['left_hand']),
                        "right_hand": len(frame['right_hand']),
                        "pose": len(frame['pose'])
                    }
                }), 500

        return jsonify({
            "success": True,
            "word": word,
            "sign": result
        })
    except Exception as e:
        print(f"Error in get_sign for word '{word}': {str(e)}")
        print("Full traceback:")
        traceback.print_exc()
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
        results = []
        errors = []
        
        for word in text.split():
            try:
                result = sign_generator.generate_keypoints(word)
                # Validate result structure
                if not result or 'keyframes' not in result:
                    errors.append(f"Invalid keypoint structure for word '{word}'")
                    continue
                    
                # Validate keyframes
                valid = True
                for i, frame in enumerate(result['keyframes']):
                    if not all(k in frame for k in ['left_hand', 'right_hand', 'pose', 'timestamp']):
                        errors.append(f"Missing required keypoints in frame {i} for word '{word}'")
                        valid = False
                        break
                        
                    # Validate point counts
                    if len(frame['left_hand']) != 21 or len(frame['right_hand']) != 21 or len(frame['pose']) != 33:
                        errors.append(f"Invalid number of keypoints in frame {i} for word '{word}'")
                        valid = False
                        break
                        
                if valid:
                    results.append(result)
                    
            except Exception as e:
                print(f"Error generating keypoints for word '{word}': {str(e)}")
                errors.append(f"Error for word '{word}': {str(e)}")
                continue
        
        response = {
            "success": len(results) > 0,
            "text": text,
            "word_count": len(text.split()),
            "signs": results,
            "metrics": {
                "signs_generated": len(results),
                "coverage": len(results) / len(text.split()) if text.split() else 0
            }
        }
        
        if errors:
            response["errors"] = errors
            
        return jsonify(response)
        
    except Exception as e:
        print(f"Error in translate_text: {str(e)}")
        print("Full traceback:")
        traceback.print_exc()
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

@app.route('/get_sign_language_videos', methods=['POST'])
def get_sign_language_videos():
    """Get sign language animations for a list of words"""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    words = request.json.get('words', [])
    if not isinstance(words, list):
        return jsonify({"error": "Words parameter must be an array"}), 400

    try:
        if not sign_generator:
            return jsonify({"error": "Sign generator not available"}), 503
            
        logger.info(f"Generating signs for words: {words}")
        results = []
        errors = []
        
        for word in words:
            try:
                sign_data = sign_generator.generate_keypoints(word)
                # Format the keypoints data correctly for the frontend
                formatted_data = {
                    'word': word,
                    'duration': sign_data['duration'],
                    'fps': sign_data['fps'],
                    'keyframes': sign_data['keyframes'],
                    'success': True
                }
                results.append(formatted_data)
            except Exception as e:
                logger.error(f"Error generating keypoints for word '{word}': {str(e)}")
                errors.append({
                    'word': word,
                    'error': str(e)
                })
                continue
        
        response = {
            "success": len(results) > 0,
            "signs": results,  # Changed from 'videos' to 'signs' to match frontend expectation
            "errors": errors if errors else None
        }
        
        logger.info(f"Generated signs for {len(results)} words with {len(errors)} errors")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error in get_sign_language_videos: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)