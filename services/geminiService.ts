import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Modality } from "@google/genai";

// Global Rate Limiter State
let dispatchQueue = Promise.resolve();
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 6000; // 6s spacing — 10 RPM, safely under Gemini free tier 15 RPM limit
const DAILY_LIMIT = 5000; 

function incrementDailyUsage() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `gemini_usage_${today}`;
    const current = parseInt(localStorage.getItem(key) || '0');
    localStorage.setItem(key, (current + 1).toString());
  } catch (e) {
    console.warn("Failed to update usage stats", e);
  }
}

async function scheduleRateLimitedRequest<T>(task: () => Promise<T>): Promise<T> {
  const startPromise = dispatchQueue.then(async () => {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    const waitTime = Math.max(0, MIN_REQUEST_INTERVAL - timeSinceLast);

    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();
    incrementDailyUsage();
  });

  dispatchQueue = startPromise;
  await startPromise;

  let attempts = 0;
  while (true) {
    try {
      return await task();
    } catch (error: any) {
      const isQuota = error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED');
      
      if (isQuota && attempts < 3) {
        attempts++;
        const backoff = 1500 * Math.pow(2, attempts); 
        console.warn(`Rate limit hit. Retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw error;
    }
  }
}

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private apiKey: string;

  constructor(customKey?: string) {
    this.apiKey = customKey || process.env.API_KEY || '';
    this.initAI();
  }

  setApiKey(key: string) {
    this.apiKey = key || process.env.API_KEY || '';
    this.initAI();
  }

  private initAI() {
    if (!this.apiKey) {
      this.ai = null;
      return;
    }
    this.ai = new GoogleGenAI({
      apiKey: this.apiKey,
    });
  }

  getQuotaInfo() {
    const today = new Date().toISOString().split('T')[0];
    const usage = parseInt(localStorage.getItem(`gemini_usage_${today}`) || '0');
    const remaining = Math.max(0, DAILY_LIMIT - usage);
    
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    const cooldown = Math.max(0, MIN_REQUEST_INTERVAL - timeSinceLast);

    return { usage, remaining, limit: DAILY_LIMIT, cooldown, isRateLimited: cooldown > 0 };
  }

  private async optimizeImage(base64Str: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const MAX_DIMENSION = 1600; 
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = MAX_DIMENSION / Math.max(width, height);
          width *= ratio;
          height *= ratio;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(base64Str); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(base64Str);
    });
  }

  async transcribeMangaPage(base64Image: string): Promise<string> {
    if (!this.ai) throw new Error('Gemini API key is required. Please add it in Settings.');
    const optimizedDataUrl = await this.optimizeImage(base64Image);
    const base64Data = optimizedDataUrl.split(',')[1] || optimizedDataUrl;
    
    const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];
    let lastError: any;

    for (const model of models) {
      try {
        return await scheduleRateLimitedRequest(() => this.performOCR(model, base64Data));
      } catch (err: any) {
        // If rate limited, don't try next model — it'll also be rate limited
        const isQuota = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED');
        if (isQuota) throw err;
        console.warn(`Model ${model} failed`, err);
        lastError = err;
      }
    }
    throw lastError || new Error("OCR failed on all models");
  }

  private async performOCR(model: string, base64Data: string): Promise<string> {
    const response = await this.ai!.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: `SYSTEM PROTOCOL: SPEECH BUBBLE TARGETED SCANNING.
            
            SCIENTIFIC RESEARCH CONTEXT: This is for a linguistic study on English dialogue in graphic novels.
            
            OPERATIONAL MANDATE: 
            1. SCAN ONLY SPEECH BUBBLES: Move focus strictly from bubble to bubble. 
            2. IGNORE ALL ILLUSTRATIONS: Treat characters, backgrounds, action lines, and artistic elements as "empty space".
            3. SEQUENTIAL EXTRACTION: Read text from bubbles in standard manga reading order (Right-to-Left, Top-to-Bottom).
            4. ENGLISH DIALOGUE ONLY: Only extract text that is in English and contained within a dialogue bubble or narration box.
            5. NO IMAGE DESCRIPTION: Do not describe any visual content. Do not mention "a character is talking" or "action scene". 
            6. OUTPUT FORMAT: Provide only the raw text strings from each bubble, each on a new line. If no bubbles are present, return "NO_DIALOGUE".`,
          },
        ],
      },
      config: {
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      }
    });

    if (!response || !response.candidates || response.candidates.length === 0) {
      throw new Error("No transcription candidates returned.");
    }

    const text = response.text?.trim();
    if (text === 'NO_DIALOGUE') return '';
    return text || '';
  }

  private createChunks(text: string): string[] {
    const cleanText = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
    if (!cleanText) return [];
    const MAX_CHUNK_SIZE = 2500; 
    if (cleanText.length <= MAX_CHUNK_SIZE) return [cleanText];

    const chunks: string[] = [];
    const rawSegments = cleanText.split(/(\n|[.!?]+)/).filter(s => s.trim());
    let currentChunk = "";
    for (const segment of rawSegments) {
      if ((currentChunk + " " + segment).length > MAX_CHUNK_SIZE) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = segment;
      } else {
        currentChunk += " " + segment;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks.length > 0 ? chunks : [cleanText];
  }

  async generateSpeech(text: string, voiceName: string = 'Kore'): Promise<string[]> {
    if (!this.ai) throw new Error('Gemini API key is required. Please add it in Settings.');
    if (!text.trim()) return [];
    const chunks = this.createChunks(text);
    const audioResults: string[] = [];

    // Process audio chunks sequentially to maintain order and context
    for (const chunk of chunks) {
      try {
        const audioData = await scheduleRateLimitedRequest(() => 
          this.generateSpeechForChunk(chunk, voiceName)
        );
        audioResults.push(audioData);
      } catch (e) {
        console.error("Failed to generate speech chunk", e);
        throw e;
      }
    }
    return audioResults;
  }

  private async generateSpeechForChunk(text: string, voiceName: string): Promise<string> {
    const response = await this.ai!.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: { parts: [{ text: text }] },
      config: {
        responseModalities: [Modality.AUDIO], // Use enum for type safety
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (audioData) return audioData;
    throw new Error("Audio generation returned empty result.");
  }
}