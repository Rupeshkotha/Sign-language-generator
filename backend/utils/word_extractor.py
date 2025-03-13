import io
import re
import logging
import speech_recognition as sr
from youtube_transcript_api import YouTubeTranscriptApi
import pytube
import time
from typing import Dict, List, Union, Optional
from functools import lru_cache

class WordExtractor:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        self.max_video_duration = 3600  # Increase to 1 hour max
        self.min_word_length = 2
    
    @lru_cache(maxsize=100)
    def get_youtube_video_id(self, url: str) -> Optional[str]:
        """Extract YouTube video ID from various URL formats with validation"""
        if not url:
            return None
            
        # Common YouTube URL patterns
        patterns = [
            r'(?:v=|/v/|/embed/|youtu\.be/)([0-9A-Za-z_-]{11})',  # Standard, embed, and short URLs
            r'(?:watch\?v=)([0-9A-Za-z_-]{11})',  # Watch URLs
            r'(?:/video/)([0-9A-Za-z_-]{11})'  # Alternative video URLs
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                video_id = match.group(1)
                self.logger.info(f"Extracted video ID: {video_id} from URL: {url}")
                return video_id
                
        self.logger.warning(f"Could not extract video ID from URL: {url}")
        return None
    
    def clean_word(self, word: str) -> str:
        """Clean and normalize words with improved filtering"""
        if not word:
            return ""
            
        # Common contractions mapping
        contractions = {
            "doesn't": "does not",
            "don't": "do not",
            "won't": "will not",
            "can't": "cannot",
            "isn't": "is not",
            "ain't": "is not",
            "aren't": "are not",
            "wasn't": "was not",
            "weren't": "were not",
            "hasn't": "has not",
            "haven't": "have not",
            "hadn't": "had not",
            "wouldn't": "would not",
            "couldn't": "could not",
            "shouldn't": "should not",
            "mustn't": "must not",
            "i'm": "i am",
            "you're": "you are",
            "he's": "he is",
            "she's": "she is",
            "it's": "it is",
            "we're": "we are",
            "they're": "they are",
            "i've": "i have",
            "you've": "you have",
            "we've": "we have",
            "they've": "they have",
            "i'd": "i would",
            "you'd": "you would",
            "he'd": "he would",
            "she'd": "she would",
            "it'd": "it would",
            "we'd": "we would",
            "they'd": "they would",
            "i'll": "i will",
            "you'll": "you will",
            "he'll": "he will",
            "she'll": "she will",
            "it'll": "it will",
            "we'll": "we will",
            "they'll": "they will"
        }
        
        # Convert to lowercase and remove extra whitespace
        word = word.lower().strip()
        
        # Handle contractions before cleaning
        if word in contractions:
            # Get the first word of the expanded contraction
            word = contractions[word].split()[0]
        elif "'" in word:
            # Remove any remaining apostrophes and text after them
            word = word.split("'")[0]
            
        # Remove non-alphabetic characters
        cleaned = re.sub(r'[^a-z]', '', word)
        
        # Filter out common noise words and short words
        noise_words = {'uh', 'um', 'ah', 'er', 'hm', 'erm', 'uhm', 'hmm'}
        if cleaned in noise_words or len(cleaned) < self.min_word_length:
            return ""
            
        return cleaned
    
    def extract_words(self, video_url: str) -> Dict[str, List[Union[str, float]]]:
        """
        Extract words from video with improved validation and error handling
        """
        try:
            # Validate video URL
            video_id = self.get_youtube_video_id(video_url)
            if not video_id:
                self.logger.error(f"Invalid YouTube URL format: {video_url}")
                raise ValueError(f"Invalid YouTube URL format: {video_url}")
            
            self.logger.info(f"Processing YouTube video ID: {video_id}")
            words = []
            timestamps = []
            
            # Try caption extraction first since it's more reliable
            caption_success = False
            try:
                caption_result = self.extract_from_captions(video_url)
                if caption_result['words']:
                    words.extend(caption_result['words'])
                    timestamps.extend(caption_result['timestamps'])
                    caption_success = True
                    self.logger.info(f"Successfully extracted {len(caption_result['words'])} words from captions")
                
            except Exception as e:
                self.logger.warning(f"Caption extraction failed: {str(e)}")
            
            # Try audio extraction if captions didn't yield results
            audio_success = False
            if not caption_success or len(words) == 0:
                try:
                    # Try different URL formats for pytube
                    url_formats = [
                        f"https://youtube.com/watch?v={video_id}",
                        f"https://www.youtube.com/watch?v={video_id}",
                        f"https://youtu.be/{video_id}"
                    ]
                    
                    yt = None
                    last_error = None
                    
                    for url in url_formats:
                        try:
                            yt = pytube.YouTube(url)
                            # Verify the object works
                            _ = yt.length
                            self.logger.info(f"Successfully connected to YouTube video: {url}")
                            break
                        except Exception as e:
                            last_error = e
                            continue
                    
                    if yt is None:
                        raise ValueError(f"Failed to access YouTube video. Last error: {str(last_error)}")
                    
                    # Check video duration
                    if yt.length > self.max_video_duration:
                        raise ValueError(f"Video duration ({yt.length}s) exceeds maximum allowed ({self.max_video_duration}s)")
                    
                    audio_result = self.extract_from_audio_stream(video_url, yt)
                    if audio_result['words']:
                        words.extend(audio_result['words'])
                        timestamps.extend(audio_result['timestamps'])
                        audio_success = True
                        self.logger.info(f"Successfully extracted {len(audio_result['words'])} words from audio")
                    
                except Exception as e:
                    self.logger.warning(f"Audio extraction failed: {str(e)}")
            
            if not words:
                raise ValueError("No words could be extracted from either captions or audio")
            
            # Clean and deduplicate words while preserving order
            unique_words = []
            seen = set()
            cleaned_timestamps = []
            
            for word, timestamp in zip(words, timestamps):
                cleaned_word = self.clean_word(word)
                if cleaned_word and cleaned_word not in seen:
                    unique_words.append(cleaned_word)
                    cleaned_timestamps.append(float(timestamp))
                    seen.add(cleaned_word)
            
            self.logger.info(f"Final results: {len(unique_words)} unique words extracted")
            self.logger.info(f"Extraction methods: Captions={caption_success}, Audio={audio_success}")
            
            return {
                'words': unique_words,
                'timestamps': cleaned_timestamps,
                'metrics': {
                    'total_words': len(words),
                    'unique_words': len(unique_words),
                    'caption_success': caption_success,
                    'audio_success': audio_success
                }
            }
        
        except Exception as e:
            self.logger.error(f"Word extraction failed: {str(e)}")
            raise
    
    @lru_cache(maxsize=50)
    def extract_from_captions(self, video_url: str) -> Dict[str, List[Union[str, float]]]:
        """
        Extract words from YouTube video captions with caching
        """
        try:
            video_id = self.get_youtube_video_id(video_url)
            if not video_id:
                raise ValueError("Invalid YouTube URL")
            
            # Retrieve video transcript
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
            
            words = []
            timestamps = []
            
            for entry in transcript:
                # Extract words from transcript text
                entry_words = re.findall(r'\b\w+\b', entry['text'].lower())
                
                # Add words and their corresponding start times
                for word in entry_words:
                    cleaned_word = self.clean_word(word)
                    if cleaned_word:
                        words.append(cleaned_word)
                        timestamps.append(entry['start'])
            
            self.logger.info(f"Extracted {len(words)} words from captions")
            
            return {'words': words, 'timestamps': timestamps}
        
        except Exception as e:
            self.logger.warning(f"Caption extraction failed: {e}")
            raise
    
    def extract_from_audio_stream(self, video_url: str, yt: pytube.YouTube = None) -> Dict[str, List[Union[str, float]]]:
        """
        Extract words from video audio stream with improved timing
        """
        try:
            # Use provided YouTube object or create new one
            if yt is None:
                yt = pytube.YouTube(video_url)
            
            # Select audio stream
            audio_stream = yt.streams.filter(only_audio=True, file_extension='mp4').first()
            if not audio_stream:
                raise ValueError("No suitable audio stream available")
            
            self.logger.info(f"Selected audio stream: {audio_stream}")
            
            # Stream audio to memory buffer
            audio_buffer = io.BytesIO()
            audio_stream.stream_to_buffer(audio_buffer)
            audio_buffer.seek(0)
            
            words = []
            timestamps = []
            
            # Process audio in chunks for better timing
            with sr.AudioFile(audio_buffer) as source:
                chunk_duration = 5  # 5 seconds per chunk
                offset = 0.0  # Ensure offset is float
                
                # Adjust the audio input level
                self.recognizer.adjust_for_ambient_noise(source)
                
                while True:
                    try:
                        audio_chunk = self.recognizer.record(source, duration=chunk_duration)
                        if not audio_chunk:
                            break
                            
                        text = self.recognizer.recognize_google(audio_chunk)
                        chunk_words = re.findall(r'\b\w+\b', text.lower())
                        
                        if chunk_words:
                            # Distribute timestamps evenly within the chunk
                            time_per_word = chunk_duration / len(chunk_words)
                            for i, word in enumerate(chunk_words):
                                cleaned_word = self.clean_word(word)
                                if cleaned_word:
                                    words.append(cleaned_word)
                                    timestamps.append(float(offset + (i * time_per_word)))  # Ensure timestamp is float
                        
                        offset += float(chunk_duration)  # Ensure offset remains float
                        
                    except sr.WaitTimeoutError:
                        break
                    except sr.UnknownValueError:
                        # No speech detected in this chunk
                        offset += float(chunk_duration)
                        continue
                    except Exception as e:
                        self.logger.warning(f"Error processing audio chunk: {e}")
                        offset += float(chunk_duration)
                        continue
            
            if not words:
                raise ValueError("No words could be extracted from the audio")
                
            self.logger.info(f"Extracted {len(words)} words from audio stream")
            
            return {
                'words': words,
                'timestamps': timestamps
            }
        
        except Exception as e:
            self.logger.warning(f"Audio stream extraction failed: {e}")
            raise