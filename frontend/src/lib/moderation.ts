import * as nsfwjs from 'nsfwjs';

// Cache the model so we don't reload it for every upload
let model: nsfwjs.NSFWJS | null = null;

export async function loadModerationModel() {
  if (!model) {
    console.log('Loading NSFW detection model...');
    // Load the model from the default hosted URL
    model = await nsfwjs.load();
    console.log('NSFW model loaded successfully.');
  }
  return model;
}

export interface ModerationResult {
  isSafe: boolean;
  base64Image: string | null;
  reason?: string;
}

export async function processAndModerateAvatar(file: File): Promise<ModerationResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const currentModel = await loadModerationModel();
      
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        
        // 1. Run AI Moderation
        const predictions = await currentModel.classify(img);
        console.log('Image Moderation Predictions:', predictions);
        
        // nsfwjs returns an array of probabilities for: Drawing, Hentai, Neutral, Porn, Sexy
        // If Porn or Hentai is the top prediction, or Sexy > 80%, reject it.
        const topPrediction = predictions[0];
        
        if (topPrediction.className === 'Porn' || topPrediction.className === 'Hentai') {
          return resolve({ isSafe: false, base64Image: null, reason: 'Image flagged as explicit content.' });
        }
        
        const sexyPrediction = predictions.find(p => p.className === 'Sexy');
        if (sexyPrediction && sexyPrediction.probability > 0.8) {
          return resolve({ isSafe: false, base64Image: null, reason: 'Image flagged as highly sexually explicit.' });
        }

        // 2. Resize and convert to Base64 to save DB space
        // We want avatars to be small (e.g. max 200x200)
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Failed to get canvas context');
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to highly compressed JPEG base64
        const base64Image = canvas.toDataURL('image/jpeg', 0.8);
        resolve({ isSafe: true, base64Image });
      };
      
      img.onerror = () => reject('Failed to load image file');
      img.src = objectUrl;
      
    } catch (err) {
      console.error('Moderation failed:', err);
      reject('Moderation system error.');
    }
  });
}
