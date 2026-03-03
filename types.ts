export type TTSProvider = 'gemini' | 'openai' | 'elevenlabs' | 'typecast' | 'puter' | 'browser';

export interface MangaPage {
  id: string;
  url: string;
  base64?: string;
  transcription?: string;
  audioCache?: string[]; // Stores base64 audio chunks
  status: 'idle' | 'processing' | 'ready' | 'error';
}

export interface VoiceProfile {
  name: string;
  id: string;
  provider: TTSProvider;
}

export const VOICES: VoiceProfile[] = [
  // Gemini Voices (Prebuilt options)
  { name: 'Kore (Mature Female)', id: 'Kore', provider: 'gemini' },
  { name: 'Puck (Youthful Female/Teen)', id: 'Puck', provider: 'gemini' },
  { name: 'Zephyr (Gentle Female)', id: 'Zephyr', provider: 'gemini' },
  { name: 'Charon (Deep Male)', id: 'Charon', provider: 'gemini' },
  { name: 'Fenrir (Gruff Male)', id: 'Fenrir', provider: 'gemini' },
  
  // OpenAI Voices
  { name: 'Nova (Energetic Teen)', id: 'nova', provider: 'openai' },
  { name: 'Shimmer (Bright/Girl)', id: 'shimmer', provider: 'openai' },
  { name: 'Alloy (Neutral)', id: 'alloy', provider: 'openai' },
  { name: 'Echo (Deep)', id: 'echo', provider: 'openai' },
  { name: 'Fable (British)', id: 'fable', provider: 'openai' },
  { name: 'Onyx (Deep)', id: 'onyx', provider: 'openai' },

  // ElevenLabs Voices
  { name: 'Lily (Teen Girl)', id: 'EXAVITQu4vr4xnSDxMaL', provider: 'elevenlabs' },
  { name: 'Mimi (Young Girl)', id: 'zrHiDhphv9ZnVXBqCLjz', provider: 'elevenlabs' },
  { name: 'Rachel (Clear)', id: '21m00Tcm4TlvDq8ikWAM', provider: 'elevenlabs' },
  { name: 'Clyde (Deep)', id: '2EiwWnXFnvU5JabPnv8n', provider: 'elevenlabs' },
  { name: 'Fin (Energetic)', id: 'D38z5RcWu1voky8WS1ja', provider: 'elevenlabs' },
  { name: 'Antoni (Polite)', id: 'ErXwobaYiN019PkySvjV', provider: 'elevenlabs' },

  // Typecast Voices
  { name: 'Typecast: English Female', id: 'typecast-en-f-1', provider: 'typecast' },
  { name: 'Typecast: English Male', id: 'typecast-en-m-1', provider: 'typecast' },

  // Puter Voices (OpenAI-compatible)
  { name: 'Nova (Energetic Female)', id: 'nova', provider: 'puter' },
  { name: 'Shimmer (Bright Female)', id: 'shimmer', provider: 'puter' },
  { name: 'Alloy (Neutral)', id: 'alloy', provider: 'puter' },
  { name: 'Echo (Deep Male)', id: 'echo', provider: 'puter' },
  { name: 'Fable (British Male)', id: 'fable', provider: 'puter' },
  { name: 'Onyx (Deep Male)', id: 'onyx', provider: 'puter' },

  // System (populated dynamically from window.speechSynthesis)
  { name: 'System Default', id: 'default', provider: 'browser' }
];