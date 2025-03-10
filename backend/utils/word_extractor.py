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
        self.max_video_duration = 600  # 10 minutes max
        self.min_word_length = 2
        self.max_words = 100
    
    @lru_cache(maxsize=100)
    def get_youtube_video_id(self, url: str) -> Optional[str]:
        """Extract YouTube video ID from various URL formats with validation"""
        if not url:
            return None
            
        patterns = [
            r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
            r'(?:embed\/)([0-9A-Za-z_-]{11})',
            r'(?:youtu\.be\/)([0-9A-Za-z_-]{11})'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None
    
    def clean_word(self, word: str) -> str:
        """Clean and normalize words with improved filtering"""
        if not word:
            return ""
            
        # Remove non-alphabetic characters
        cleaned = re.sub(r'[^a-zA-Z\']', '', word)
        # Remove standalone apostrophes and normalize contractions
        cleaned = re.sub(r'\'(?![a-zA-Z])|(?<![a-zA-Z])\'', '', cleaned)
        # Convert to lowercase
        cleaned = cleaned.lower()
        
        # Filter out common noise words and short words
        noise_words = {'uh', 'um', 'ah', 'er', 'hm'}
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
                raise ValueError("Invalid YouTube URL")
            
            # Check video duration
            yt = pytube.YouTube(video_url)
            if yt.length > self.max_video_duration:
                raise ValueError(f"Video is too long (max {self.max_video_duration} seconds)")
            
            words = []
            timestamps = []
            
            # Try caption extraction first
            try:
                caption_result = self.extract_from_captions(video_url)
                words.extend(caption_result['words'])
                timestamps.extend(caption_result['timestamps'])
            except Exception as e:
                self.logger.warning(f"Caption extraction failed: {e}")
            
            # Fall back to audio extraction if needed
            if len(words) < 5:
                try:
                    audio_result = self.extract_from_audio_stream(video_url)
                    words.extend(audio_result['words'])
                    timestamps.extend(audio_result['timestamps'])
                except Exception as e:
                    self.logger.warning(f"Audio extraction failed: {e}")
            
            if not words:
                raise ValueError("No words could be extracted from the video")
            
            # Clean and deduplicate words while preserving order
            unique_words = []
            seen = set()
            cleaned_timestamps = []
            
            for word, timestamp in zip(words, timestamps):
                cleaned_word = self.clean_word(word)
                
                if cleaned_word and cleaned_word not in seen:
                    unique_words.append(cleaned_word)
                    cleaned_timestamps.append(timestamp)
                    seen.add(cleaned_word)
                    
                    # Limit number of words
                    if len(unique_words) >= self.max_words:
                        break
            
            self.logger.info(f"Extracted {len(unique_words)} unique words")
            
            return {
                'words': unique_words,
                'timestamps': cleaned_timestamps
            }
        
        except Exception as e:
            self.logger.error(f"Word extraction failed: {e}")
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
    
    def extract_from_audio_stream(self, video_url: str) -> Dict[str, List[Union[str, float]]]:
        """
        Extract words from video audio stream with improved timing
        """
        try:
            # Download YouTube video
            yt = pytube.YouTube(video_url)
            
            # Select audio stream
            audio_stream = yt.streams.filter(only_audio=True).first()
            if not audio_stream:
                raise ValueError("No audio stream available")
            
            # Stream audio to memory buffer
            audio_buffer = io.BytesIO()
            audio_stream.stream_to_buffer(audio_buffer)
            audio_buffer.seek(0)
            
            words = []
            timestamps = []
            
            # Process audio in chunks for better timing
            with sr.AudioFile(audio_buffer) as source:
                # Calculate chunk size (5 seconds)
                chunk_duration = 5
                chunk_samples = int(source.SAMPLE_RATE * chunk_duration)
                
                offset = 0
                while True:
                    try:
                        audio_chunk = self.recognizer.record(source, duration=chunk_duration)
                        text = self.recognizer.recognize_google(audio_chunk)
                        
                        chunk_words = re.findall(r'\b\w+\b', text.lower())
                        chunk_word_count = len(chunk_words)
                        
                        if chunk_word_count > 0:
                            # Distribute timestamps evenly within the chunk
                            time_per_word = chunk_duration / chunk_word_count
                            for i, word in enumerate(chunk_words):
                                cleaned_word = self.clean_word(word)
                                if cleaned_word:
                                    words.append(cleaned_word)
                                    timestamps.append(offset + (i * time_per_word))
                        
                        offset += chunk_duration
                        
                    except sr.WaitTimeoutError:
                        break
                    except Exception as e:
                        self.logger.warning(f"Error processing audio chunk: {e}")
                        continue
            
            self.logger.info(f"Extracted {len(words)} words from audio stream")
            
            return {
                'words': words,
                'timestamps': timestamps
            }
        
        except Exception as e:
            self.logger.warning(f"Audio stream extraction failed: {e}")
            raise