export class TypecastService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async generateSpeech(text: string, voiceId: string): Promise<string[]> {
    if (!this.apiKey) {
      throw new Error("Typecast API Key is missing. Please add it in Settings.");
    }

    if (!text.trim()) return [];

    try {
      // NOTE: This assumes the Typecast API endpoint is https://typecast.ai/api/speak
      // If Typecast uses a polling mechanism or a different endpoint structure, 
      // this URL and the response handling logic will need to be adjusted.
      const response = await fetch("https://typecast.ai/api/speak", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          actor_id: voiceId,
          lang: 'auto',
          x_api_id: "typecast-api", // Sometimes required by legacy Typecast integrations
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
            throw new Error("Invalid Typecast API key");
        }
        
        throw new Error(errorData.message || `Typecast Error: ${response.status}`);
      }

      // Check if response is JSON (containing audio_url) or direct audio buffer
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (data.audio_url) {
           const audioResp = await fetch(data.audio_url);
           const arrayBuffer = await audioResp.arrayBuffer();
           return [this.arrayBufferToBase64(arrayBuffer)];
        }
        // Fallback or specific error if URL not found in JSON
        throw new Error("No audio URL in Typecast response");
      } else {
        // Assume direct audio stream
        const arrayBuffer = await response.arrayBuffer();
        return [this.arrayBufferToBase64(arrayBuffer)];
      }

    } catch (error: any) {
      console.error("Typecast TTS Failed:", error);
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