import './styles/content_script.css';

// Content script for Sign Language Translator
class SignLanguageTranslator {
  constructor() {
    console.log('Creating SignLanguageTranslator instance...');
    this.isEnabled = false;
    this.video = null;
    this.overlay = null;
    this.quality = 'high';
    this.isInitialized = false;
    this.currentFrame = null;
    this.frameInterval = null;
    this.lastProcessedTime = 0;
    this.processingInterval = 1000; // Process every second
    this.backendConnected = false;
    this.isTranslating = false;
    this.currentSign = null;
    this.signQueue = [];
    
    // Set up message listener first
    this.setupMessageListener();
    
    // Then initialize
    this.initialize();
  }

  async initialize() {
    try {
      console.log('Initializing SignLanguageTranslator...');
      
      // Set up message listener first
      this.setupMessageListener();
      
      // Create overlay
      this.createOverlay();
      
      // Set up mutation observer
      this.setupMutationObserver();
      
      // Initialize video handling
      this.initializeVideoHandling();
      
      // Test backend connection
      await this.testBackendConnection();
      
      // Mark as initialized
      this.isInitialized = true;
      console.log('SignLanguageTranslator initialized successfully');
      
      // Notify background script that we're ready
      chrome.runtime.sendMessage({ 
        action: 'contentScriptReady',
        success: true,
        isEnabled: this.isEnabled,
        backendConnected: this.backendConnected
      });
    } catch (error) {
      console.error('Initialization failed:', error);
      this.isInitialized = false;
      chrome.runtime.sendMessage({ 
        action: 'contentScriptReady',
        success: false,
        error: error.message
      });
    }
  }

  async testBackendConnection() {
    try {
      console.log('Testing backend connection...');
      const response = await chrome.runtime.sendMessage({
        action: 'API_REQUEST',
        endpoint: '/health',
        method: 'GET',
        data: null
      });
      
      if (response && response.success) {
        console.log('Backend connection successful:', response);
        this.backendConnected = true;
      } else {
        console.error('Backend connection failed:', response?.error || 'No response');
        this.backendConnected = false;
      }
    } catch (error) {
      console.error('Backend connection test failed:', error);
      this.backendConnected = false;
    }
  }

  initializeVideoHandling() {
    // Find video element
    this.video = document.querySelector('video');
    if (!this.video) {
      console.error('No video element found');
      return;
    }

    // Set up video event listeners
    this.video.addEventListener('play', () => this.startFrameProcessing());
    this.video.addEventListener('pause', () => this.stopFrameProcessing());
    this.video.addEventListener('seeked', () => {
      this.lastProcessedTime = this.video.currentTime;
      this.processCurrentFrame();
    });
  }

  startFrameProcessing() {
    if (!this.isTranslating) {
      this.isTranslating = true;
      console.log('Starting frame processing');
      
      // Process frame every second
      this.frameInterval = setInterval(() => {
        this.processCurrentFrame();
      }, this.processingInterval);
    }
  }

  stopFrameProcessing() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
      this.isTranslating = false;
      console.log('Stopped frame processing');
    }
  }

  async processCurrentFrame() {
    if (!this.isTranslating || !this.video) return;

    const currentTime = this.video.currentTime;
    if (currentTime === this.lastProcessedTime) return;

    this.lastProcessedTime = currentTime;

    try {
      console.log('Processing frame at time:', currentTime);
      const response = await this.sendToBackend({
        video_url: window.location.href,
        timestamp: currentTime
      });

      console.log('Backend response:', response);
      
      if (response.success && response.data) {
        this.updateOverlay(response.data);
      } else {
        console.log('No data to display');
        this.clearOverlay();
      }
    } catch (error) {
      console.error('Error processing frame:', error);
      this.showError('Error processing video');
    }
  }

  async sendToBackend(data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'API_REQUEST',
        endpoint: '/get_sign',
        method: 'POST',
        data: data
      }, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  async toggleTranslation(enabled) {
    if (!this.isInitialized) {
      return { success: false, error: 'Not initialized' };
    }

    console.log('Toggling translation:', enabled);
    this.isEnabled = enabled;
    
    if (enabled) {
      if (!this.overlay) {
        this.createOverlay();
      }
      this.overlay.style.display = 'block';
      this.startFrameProcessing();
    } else {
      this.stopFrameProcessing();
      if (this.overlay) {
        this.overlay.style.display = 'none';
      }
    }

    return { success: true, isEnabled: this.isEnabled };
  }

  setupMessageListener() {
    console.log('Setting up message listener...');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Content script received message:', message);
      
      // Always respond to ping messages immediately
      if (message.action === 'ping') {
        console.log('Responding to ping message');
        sendResponse({ 
          success: true, 
          isEnabled: this.isEnabled,
          isInitialized: this.isInitialized,
          backendConnected: this.backendConnected
        });
        return true;
      }
      
      // For other messages, check initialization
      if (!this.isInitialized) {
        console.log('Content script not initialized, sending error response');
        sendResponse({ 
          success: false, 
          error: 'Content script not initialized',
          isInitialized: false
        });
        return true;
      }

      // Handle other messages asynchronously
      (async () => {
        try {
          switch (message.action) {
            case 'toggleTranslation':
              console.log('Handling toggle translation:', message.enabled);
              await this.toggleTranslation(message.enabled);
              sendResponse({ 
                success: true, 
                isEnabled: this.isEnabled,
                message: `Translation ${this.isEnabled ? 'enabled' : 'disabled'}`
              });
              break;
              
            case 'updateQuality':
              console.log('Handling quality update:', message.quality);
              await this.handleQualityUpdate(message.quality);
              sendResponse({ success: true });
              break;
              
            default:
              console.log('Unknown action:', message.action);
              sendResponse({ success: false, error: 'Unknown action' });
          }
        } catch (error) {
          console.error('Error handling message:', error);
          sendResponse({ 
            success: false, 
            error: error.message || 'Internal error'
          });
        }
      })();

      return true; // Keep message channel open for async response
    });
    console.log('Message listener setup complete');
  }

  async handleQualityUpdate(quality) {
    console.log('Quality update received:', quality);
    // Implement quality update logic here
  }

  createOverlay() {
    console.log('Creating overlay element');
    if (this.overlay) {
      console.log('Overlay already exists');
      return;
    }

    this.overlay = document.createElement('div');
    this.overlay.id = 'sign-language-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      background: rgba(0, 0, 0, 0.7);
      padding: 10px;
      border-radius: 5px;
      display: none;
      min-width: 200px;
      min-height: 200px;
      color: white;
      text-align: center;
      font-family: Arial, sans-serif;
    `;
    document.body.appendChild(this.overlay);
    console.log('Overlay created successfully');
  }

  setupMutationObserver() {
    console.log('Setting up mutation observer');
    const observer = new MutationObserver((mutations) => {
      if (!this.video) {
        console.log('Video element lost, attempting to find it again');
        this.initializeVideoHandling();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  showError(message) {
    if (!this.overlay) return;
    
    // Create error message container if it doesn't exist
    let errorContainer = this.overlay.querySelector('.error-message');
    if (!errorContainer) {
      errorContainer = document.createElement('div');
      errorContainer.className = 'error-message';
      errorContainer.style.cssText = `
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(255, 0, 0, 0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 10001;
        font-family: Arial, sans-serif;
        font-size: 14px;
      `;
      this.overlay.appendChild(errorContainer);
    }
    
    errorContainer.textContent = message;
    
    // Hide error after 5 seconds
    setTimeout(() => {
      errorContainer.textContent = '';
    }, 5000);
  }

  updateOverlay(data) {
    if (!data.word) {
      this.clearOverlay();
      return;
    }

    console.log('Updating overlay with word:', data.word);
    
    // Show overlay
    this.overlay.style.display = 'block';
    
    // Update overlay content
    this.overlay.innerHTML = `
      <div style="margin-bottom: 10px; font-size: 18px;">${data.word}</div>
      <canvas id="sign-canvas" width="200" height="200"></canvas>
    `;

    // Render sign animation
    const canvas = this.overlay.querySelector('#sign-canvas');
    if (canvas && data.keyframes) {
      this.renderSignAnimation(canvas, data.keyframes);
    }
  }

  renderSignAnimation(canvas, keyframes) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!keyframes || !keyframes.length) return;
    
    const currentFrame = keyframes[0];
    
    // Constants for rendering
    const POINT_RADIUS = 3;
    const LINE_WIDTH = 2;
    
    // Helper function to draw a keypoint
    const drawPoint = (point, color = '#ffffff') => {
      if (!point || point.length < 2) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(
        point[0] * canvas.width,
        point[1] * canvas.height,
        POINT_RADIUS,
        0,
        2 * Math.PI
      );
      ctx.fill();
    };
    
    // Helper function to draw a connection between points
    const drawConnection = (point1, point2, color = '#ffffff') => {
      if (!point1 || !point2 || point1.length < 2 || point2.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(point1[0] * canvas.width, point1[1] * canvas.height);
      ctx.lineTo(point2[0] * canvas.width, point2[1] * canvas.height);
      ctx.stroke();
    };
    
    // Draw pose keypoints
    if (currentFrame.pose) {
      const pose = currentFrame.pose;
      // Draw pose points
      pose.forEach(point => drawPoint(point, '#ffff00'));
      
      // Draw pose connections (simplified skeleton)
      const poseConnections = [
        [11, 13], [13, 15], // Left arm
        [12, 14], [14, 16], // Right arm
        [11, 12], // Shoulders
        [11, 23], [12, 24], // Torso
        [23, 24], // Hips
      ];
      
      poseConnections.forEach(([i, j]) => {
        if (pose[i] && pose[j]) {
          drawConnection(pose[i], pose[j], '#ffff00');
        }
      });
    }
    
    // Draw hand keypoints
    if (currentFrame.left_hand) {
      const hand = currentFrame.left_hand;
      // Draw points
      hand.forEach(point => drawPoint(point, '#00ff00'));
      
      // Draw finger connections
      for (let finger = 0; finger < 5; finger++) {
        const baseIndex = finger * 4;
        for (let joint = 0; joint < 3; joint++) {
          drawConnection(
            hand[baseIndex + joint],
            hand[baseIndex + joint + 1],
            '#00ff00'
          );
        }
      }
    }
    
    if (currentFrame.right_hand) {
      const hand = currentFrame.right_hand;
      // Draw points
      hand.forEach(point => drawPoint(point, '#ff0000'));
      
      // Draw finger connections
      for (let finger = 0; finger < 5; finger++) {
        const baseIndex = finger * 4;
        for (let joint = 0; joint < 3; joint++) {
          drawConnection(
            hand[baseIndex + joint],
            hand[baseIndex + joint + 1],
            '#ff0000'
          );
        }
      }
    }
  }

  clearOverlay() {
    if (this.overlay) {
      this.overlay.innerHTML = '';
    }
  }
}

// Initialize the translator
console.log('Creating SignLanguageTranslator instance...');
const translator = new SignLanguageTranslator();

// Wait for DOM to be ready and then initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing translator...');
    translator.initialize();
  });
} else {
  console.log('DOM already loaded, initializing translator...');
  translator.initialize();
}