
// Use Puter from global window object (loaded via CDN)
declare global {
  interface Window {
    puter: any;
  }
}

export class PuterService {
  private currentAudio: HTMLAudioElement | null = null;

  async transcribePage(imageDataUrl: string): Promise<string> {
    const puter = window.puter;
    if (!puter) throw new Error("Puter.js not loaded");

    const prompt = `You are a manga OCR engine. Your ONLY job is to extract spoken dialogue and narration text from speech bubbles and narration boxes in this manga image.

Rules:
- Read in manga order: Right-to-Left, Top-to-Bottom
- Output ONLY the raw text from each bubble/box, each on its own line
- Do NOT describe the art, characters, or actions
- Do NOT add labels like "Bubble 1:" or speaker names
- If the page has no dialogue or text, respond with exactly: NO_DIALOGUE`;

    const response = await puter.ai.chat(prompt, imageDataUrl);

    // Handle different response shapes from puter.ai.chat
    let text = '';
    if (typeof response === 'string') {
      text = response;
    } else if (response?.message?.content) {
      const c = response.message.content;
      text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x: any) => x.text ?? '').join('\n') : '';
    } else if (response?.text) {
      text = response.text;
    }

    text = text.trim();
    return text === 'NO_DIALOGUE' ? '' : text;
  }

// Play Puter TTS directly via HTMLAudioElement (avoids cross-origin blob fetch issues)
  async playAudio(text: string): Promise<void> {
    if (!text.trim()) return;

    const puter = window.puter;
    if (!puter) throw new Error("Puter.js not loaded");

    const result = await puter.ai.txt2speech(text);

    // Resolve to an HTMLAudioElement however Puter returns it
    let audio: HTMLAudioElement;
    if (result instanceof HTMLAudioElement) {
      audio = result;
    } else if (result && typeof result.play === 'function') {
      audio = result as HTMLAudioElement;
    } else if (typeof result === 'string') {
      audio = new Audio(result);
    } else if (result instanceof Blob) {
      audio = new Audio(URL.createObjectURL(result));
    } else {
      throw new Error("Puter TTS returned unknown audio format");
    }

    audio.playbackRate = 0.95; // Slightly slower = more natural, less rushed
    this.currentAudio = audio;

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Puter audio playback failed"));
      audio.play().catch(reject);
    });

    this.currentAudio = null;
  }

  stopAudio() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }
}
