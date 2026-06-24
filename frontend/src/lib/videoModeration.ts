import * as nsfwjs from 'nsfwjs';
import * as tf from '@tensorflow/tfjs';
import { api } from './api';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';

// Model configuration
// We use the default public model hosted by nsfwjs.
let model: nsfwjs.NSFWJS | null = null;
let isInitializing = false;

// Initialize the model once
export const initModerationModel = async () => {
    if (model || isInitializing) return;
    isInitializing = true;
    try {
        // Ensure TF backend is ready (WebGL is fastest for browsers)
        await tf.ready();
        
        // Suppress NSFWJS default model warning
        const originalWarn = console.warn;
        console.warn = (...args) => {
            if (typeof args[0] === 'string' && args[0].includes('NSFWJS docs')) return;
            originalWarn(...args);
        };
        
        model = await nsfwjs.load();
        
        // Restore warning
        console.warn = originalWarn;
        
        console.log('NSFW.js model loaded successfully.');
    } catch (error) {
        console.error('Failed to load NSFW.js model:', error);
    } finally {
        isInitializing = false;
    }
};

// Start moderation loop on a given video element
export const startVideoModeration = (
    videoElement: HTMLVideoElement, 
    onViolationDetected: (predictions: nsfwjs.PredictionType[]) => void
) => {
    let active = true;
    let intervalId: number;

    const analyzeFrame = async () => {
        if (!active || !model || !videoElement || videoElement.readyState !== 4) return;
        
        try {
            // Predict from the video element directly. 
            // NSFWJS handles canvas downsampling internally.
            const predictions = await model.classify(videoElement, 3);
            
            // Check for severe violations (Porn or Hentai > 85%)
            // We ignore "Sexy" or "Neutral" to prevent false positives and give some freedom.
            const violation = predictions.find(p => 
                (p.className === 'Porn' || p.className === 'Hentai') && p.probability > 0.85
            );

            if (violation) {
                active = false;
                onViolationDetected(predictions);
            }
        } catch (err) {
            console.error('Moderation analysis failed:', err);
        }
    };

    // Make sure model is loaded
    if (!model) {
        initModerationModel().then(() => {
            // Run analysis every 5 seconds (5000ms) to save CPU & battery
            if (active) intervalId = window.setInterval(analyzeFrame, 5000);
        });
    } else {
        intervalId = window.setInterval(analyzeFrame, 5000);
    }

    // Return a cleanup function
    return () => {
        active = false;
        clearInterval(intervalId);
    };
};

export const reportAIStrike = async () => {
    try {
        const response = await api.reportStrike();
        // If the backend banned us, log the user out
        if (response && response.banned_until) {
            useUIStore.getState().showAlert('Banned', `You have been temporarily banned for inappropriate behavior until ${new Date(response.banned_until).toLocaleString()}`);
            useAuthStore.getState().clearAuth();
            window.location.href = '/auth';
        }
    } catch (err) {
        console.error('Failed to report AI strike', err);
    }
};
