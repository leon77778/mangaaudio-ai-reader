export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  // First try browser-native decoding (handles MP3, WAV, OGG, AAC from ElevenLabs/Puter/Typecast)
  try {
    const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    return await ctx.decodeAudioData(slice);
  } catch {
    // Fall back to manual Int16 PCM decoding for headerless raw PCM (Gemini/OpenAI)
    const length = data.byteLength;
    const evenLength = length % 2 === 0 ? length : length - 1;
    const dataInt16 = new Int16Array(data.buffer, data.byteOffset, evenLength / 2);

    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }
}

export class Player {
  private ctx: AudioContext;
  private sources: AudioBufferSourceNode[] = [];
  private _isPlaying = false;
  private resolveCurrent: (() => void) | null = null;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  get isPlaying() {
    return this._isPlaying;
  }

  /**
   * Resumes the AudioContext if suspended. 
   * Must be called during a user interaction (click/keydown) to satisfy browser Autoplay policies.
   */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async play(audioChunks: string | string[]): Promise<void> {
    this.stop(); // Stop any existing playback
    
    // Ensure context is running
    await this.resume();

    const chunks = Array.isArray(audioChunks) ? audioChunks : [audioChunks];
    if (chunks.length === 0) return;

    this._isPlaying = true;
    let nextStartTime = this.ctx.currentTime + 0.1; // Slight delay to ensure smooth start

    return new Promise<void>(async (resolve) => {
      this.resolveCurrent = resolve;

      const buffers: AudioBuffer[] = [];
      
      // Decode all chunks first
      for (const base64 of chunks) {
        if (!this._isPlaying) { resolve(); return; }
        const data = decodeBase64(base64);
        const buffer = await decodeAudioData(data, this.ctx);
        buffers.push(buffer);
      }

      if (!this._isPlaying) { resolve(); return; }

      // Schedule all sources
      buffers.forEach((buffer, index) => {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);
        
        source.start(nextStartTime);
        nextStartTime += buffer.duration;
        this.sources.push(source);

        // Attach cleanup and end detection to the last chunk
        if (index === buffers.length - 1) {
          source.onended = () => {
            this.sources = this.sources.filter(s => s !== source);
            // Only finish if we naturally reached the end (not stopped manually)
            if (this._isPlaying) {
              this._isPlaying = false;
              if (this.resolveCurrent) {
                this.resolveCurrent();
                this.resolveCurrent = null;
              }
            }
          };
        } else {
          source.onended = () => {
            this.sources = this.sources.filter(s => s !== source);
          };
        }
      });
    });
  }

  stop() {
    this._isPlaying = false;
    this.sources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Ignore errors if source already stopped
      }
    });
    this.sources = [];
    
    if (this.resolveCurrent) {
      this.resolveCurrent();
      this.resolveCurrent = null;
    }
  }
}