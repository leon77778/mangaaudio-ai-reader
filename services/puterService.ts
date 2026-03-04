
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

    const prompt = `You are a manga OCR engine. Extract dialogue and detect the emotional tone of this panel.

OUTPUT FORMAT (follow exactly):
Line 1: MOOD:[one of: CALM, HAPPY, EXCITED, ANGRY, SCARED, TENSE, SAD]
Line 2+: Raw dialogue text, one speech bubble per line, Right-to-Left Top-to-Bottom order

MOOD GUIDE:
- EXCITED: action, power-ups, big reveals, cheering
- ANGRY: fights, threats, frustration
- SCARED: danger, horror, shock, dread
- TENSE: suspense, confrontation, high stakes
- SAD: grief, loss, crying, heartbreak
- HAPPY: joy, reunion, celebration
- CALM: normal conversation, exposition

RULES:
- Do NOT describe art, characters, or actions
- Do NOT add labels like "Bubble 1:" or speaker names
- If no dialogue: output MOOD:CALM then NO_DIALOGUE`;

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
    // Strip trailing NO_DIALOGUE if it appears after the MOOD line
    if (text.endsWith('NO_DIALOGUE')) {
      const moodLine = text.split('\n')[0] || '';
      return moodLine.startsWith('MOOD:') ? moodLine : '';
    }
    return text;
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
