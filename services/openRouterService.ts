const OCR_PROMPT = `You are a manga OCR engine. Extract ALL spoken dialogue and narration text from speech bubbles and narration boxes in this manga image.

Rules:
- Read in manga order: Right-to-Left, Top-to-Bottom
- Output ONLY the raw text from each bubble/box, one per line
- Do NOT describe art, characters, or actions
- Do NOT add labels like "Bubble 1:" or speaker names
- If the page has no text at all, respond with exactly: NO_DIALOGUE`;

// Free vision-capable models on OpenRouter (no payment required)
const FREE_VISION_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-1.5-flash:free',
  'qwen/qwen2-vl-7b-instruct:free',
  'mistralai/pixtral-12b:free',
];

export class OpenRouterService {
  private apiKey: string;

  constructor(apiKey: string = '') {
    this.apiKey = apiKey;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async transcribePage(imageDataUrl: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is missing. Get a free one at openrouter.ai');
    }

    let lastError: any;

    for (const model of FREE_VISION_MODELS) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
          },
          body: JSON.stringify({
            model,
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: imageDataUrl } },
                { type: 'text', text: OCR_PROMPT },
              ],
            }],
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          if (response.status === 401) throw new Error('Invalid OpenRouter API key.');
          // Any other error (400, 404, 503, etc.) means model unavailable — try next
          lastError = new Error(err?.error?.message || `Model ${model} unavailable (${response.status})`);
          continue;
        }

        const data = await response.json();
        const text = (data.choices?.[0]?.message?.content ?? '').trim();
        return text === 'NO_DIALOGUE' ? '' : text;

      } catch (err: any) {
        if (err.message?.includes('Invalid OpenRouter')) throw err;
        lastError = err;
        console.warn(`OpenRouter model ${model} failed:`, err.message);
      }
    }

    throw lastError || new Error('All OpenRouter models failed');
  }
}
