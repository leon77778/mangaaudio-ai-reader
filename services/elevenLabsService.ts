export class ElevenLabsService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async generateSpeech(text: string, voiceId: string): Promise<string[]> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API Key is missing. Please add it in Settings.");
    }

    if (!text.trim()) return [];

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2", // Updated to v2 as v1 is removed from free tier
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
            throw new Error("Invalid API key");
        }
        
        throw new Error(errorData.detail?.message || `ElevenLabs Error: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = this.arrayBufferToBase64(arrayBuffer);
      
      return [base64];

    } catch (error: any) {
      console.error("ElevenLabs TTS Failed:", error);
      throw error;
    }
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