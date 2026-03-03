export class OpenAIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  private createChunks(text: string): string[] {
    const cleanText = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
    if (!cleanText) return [];
    
    // OpenAI TTS limit is 4096 characters. 
    // We use a safe buffer to account for encoding differences.
    const MAX_CHUNK_SIZE = 4000; 
    
    if (cleanText.length <= MAX_CHUNK_SIZE) return [cleanText];

    const chunks: string[] = [];
    // Split by sentence terminators to keep speech natural
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

  async generateSpeech(text: string, voiceId: string): Promise<string[]> {
    if (!this.apiKey) {
      throw new Error("OpenAI API Key is missing. Please add it in Settings.");
    }

    if (!text.trim()) return [];

    const chunks = this.createChunks(text);
    const audioResults: string[] = [];

    // Process chunks sequentially
    for (const chunk of chunks) {
      try {
        const response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: chunk,
            voice: voiceId,
            response_format: "pcm", // CRITICAL: The app's audioService expects raw 16-bit PCM @ 24kHz
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `OpenAI Error: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64 = this.arrayBufferToBase64(arrayBuffer);
        
        audioResults.push(base64);

      } catch (error: any) {
        console.error("OpenAI TTS Failed:", error);
        throw error;
      }
    }
    
    return audioResults;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}