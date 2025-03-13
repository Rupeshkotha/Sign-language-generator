from flask import Flask, request, jsonify
from flask_cors import CORS
from models.inference import SignLanguageInference
from utils.word_extractor import WordExtractor
import os
import time
import traceback
import logging
import json

app = Flask(__name__)
# Enable CORS for all routes with proper configuration
CORS(app, resources={
    r"/*": {
        "origins": ["chrome-extension://*", "http://localhost:*"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept"]
    }
})

print("Starting Sign Language Translation Server...")

# Enable more detailed logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.before_request
def log_request_info():
    """Log details about every incoming request"""
    if request.method != 'OPTIONS':  # Don't log CORS preflight requests
        logger.info('Headers: %s', dict(request.headers))
        logger.info('Body: %s', request.get_data())
        logger.info('URL: %s %s', request.method, request.url)

@app.errorhandler(Exception)
def handle_error(error):
    """Global error handler to ensure consistent error responses"""
    logger.error(f"Error handling request: {str(error)}")
    logger.error(traceback.format_exc())
    
    status_code = getattr(error, 'code', 500)
    return jsonify({
        "error": str(error),
        "status": "error",
        "timestamp": time.time()
    }), status_code

# Model paths - using absolute paths to ensure correct file location
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'sign_language_model_final.pt')  # Updated to use PyTorch model
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

@app.route('/')
def root():
    """Root endpoint providing API status information"""
    try:
        # Check if sign generator is available
        model_status = "healthy" if sign_generator else "unavailable"
        vocab_size = len(sign_generator.vocabulary) if sign_generator else 0
        
        return jsonify({
            "status": "online",
            "api_version": "1.0.0",
            "model_status": model_status,
            "vocabulary_size": vocab_size,
            "endpoints": {
                "GET /": "API status (this endpoint)",
                "GET /health": "Detailed health check",
                "POST /get_sign": "Generate sign language keyframes for a word",
                "POST /translate_text": "Translate text to sign language",
                "GET /vocabulary": "List available words"
            },
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"Error in root endpoint: {str(e)}")
        return jsonify({
            "status": "degraded",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        if not components_healthy:
            return jsonify({
                "status": "error",
                "message": "Sign Language Translation API - Components Unhealthy",
                "timestamp": time.time(),
                "vocab_size": 0
            }), 503
            
        vocab_size = len(sign_generator.vocabulary) if sign_generator else 0
        return jsonify({
            "status": "healthy",
            "message": "Sign Language Translation API",
            "timestamp": time.time(),
            "vocab_size": vocab_size,
            "components": {
                "sign_generator": "healthy" if sign_generator else "error",
                "word_extractor": "healthy"
            }
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e),
            "timestamp": time.time()
        }), 503

@app.route('/get_sign', methods=['POST'])
def get_sign():
    """Generate sign language keyframes for a word or video URL"""
    try:
        data = request.get_json()
        if not data:
            raise ValueError("No JSON data provided")

        # Log request data
        logger.info(f"Received request data: {data}")
        
        if 'word' in data:
            word = data['word'].strip().lower()
            if not word:
                raise ValueError("Empty word provided")
                
            # Generate sign data for single word
            sign_data = sign_generator.generate_keypoints(word)
            if not sign_data:
                raise ValueError(f"Could not generate sign data for word: {word}")
                
            return jsonify({
                "success": True,
                "data": {
                    "word": word,
                    "keyframes": sign_data["keyframes"],
                    "duration": sign_data["duration"],
                    "fps": sign_data.get("fps", 30)
                }
            })
            
        elif 'video_url' in data:
            video_url = data['video_url']
            if not video_url:
                raise ValueError("Empty video URL provided")
                
            # Extract words from video
            word_data = word_extractor.extract_words(video_url)
            if not word_data or not word_data.get('words'):
                raise ValueError(f"Could not extract words from video: {video_url}")
                
            # Generate sign data for each word
            results = []
            for word in word_data['words']:
                sign_data = sign_generator.generate_keypoints(word)
                if sign_data:
                    results.append({
                        "word": word,
                        "keyframes": sign_data["keyframes"],
                        "duration": sign_data["duration"],
                        "fps": sign_data.get("fps", 30)
                    })
            
            return jsonify({
                "success": True,
                "data": results,
                "timestamps": word_data.get('timestamps', [])
            })
            
        else:
            raise ValueError("Request must include either 'word' or 'video_url'")
            
    except Exception as e:
        logger.error(f"Error in get_sign: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400

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
                    # Format the result to match frontend expectations
                    formatted_result = {
                        "word": word,
                        "keyframes": result['keyframes'],
                        "fps": result['fps'],
                        "duration": result['duration']
                    }
                    results.append(formatted_result)
                    
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