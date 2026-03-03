# MangaAudio AI Reader

A free, AI-powered manga reader that scans pages using computer vision and reads them aloud with realistic text-to-speech voices — no paid subscription required.

---

## Features

- **Free AI Scanning** — Uses Puter AI to extract dialogue from manga pages at no cost (no API key needed)
- **Multiple TTS Voices** — Choose from Puter, Gemini, OpenAI, ElevenLabs, or your browser's built-in voices
- **PDF & Image Support** — Load manga from PDF files or direct image URLs
- **Auto-Play Mode** — Automatically reads each page aloud as you flip through
- **Voice Switching** — Pick different voice styles (energetic, calm, deep, British, etc.)
- **Smart Text Processing** — Normalizes ALL CAPS manga text into natural sentence case for better TTS

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- A free [Puter.com](https://puter.com) account (for free AI scanning and TTS)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/leon77778/mangaaudio-ai-reader.git
   cd mangaaudio-ai-reader
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the app:**
   ```bash
   npm run dev
   ```
   Or just double-click **`start.bat`** on Windows.

4. **Open your browser** at `http://localhost:3000`

---

## How to Use

### Step 1 — Load Your Manga

You have two ways to load manga:

**Option A: Upload a PDF**
1. Click the **"Upload PDF"** button at the top
2. Select your manga PDF file from your computer
3. The app will automatically extract all pages

**Option B: Enter an Image URL**
1. Paste a direct image URL into the URL field
2. Press Enter or click **"Add Page"**
3. Repeat for each page you want to add

---

### Step 2 — Scan Pages (OCR)

Before the app can read text aloud, it needs to extract the dialogue from the images.

1. Click **"Scan All Pages"** to process every page at once
   - Or click **"Scan"** on an individual page to process just that one
2. The app will use **Puter AI** (free, no key needed) to read the speech bubbles
   - If Puter AI is unavailable, it automatically falls back to **Gemini**
3. A **Puter login popup** may appear the first time — log in with your free Puter account
4. Wait for the status to change from **Processing...** to **Ready**
5. You can see the extracted text in the script panel below each page

> **Tip:** Scanning runs 2 pages at a time to avoid rate limits. Be patient with large manga volumes.

---

### Step 3 — Choose a Voice

1. Open the **Settings** panel (gear icon or settings button)
2. Select a **TTS Provider:**
   - **Puter** — Free, no key needed. Uses OpenAI-compatible voices via Puter's free tier
   - **Browser** — Uses your system's built-in voices. Completely free, works offline
   - **Gemini** — High quality voices (requires Gemini API key, has rate limits)
   - **OpenAI** — Premium voices (requires OpenAI API key)
   - **ElevenLabs** — Ultra-realistic voices (requires ElevenLabs API key)
3. Select a **Voice** from the dropdown:
   - **Nova** — Energetic female voice, great for action/shonen manga
   - **Shimmer** — Bright, clear female voice
   - **Alloy** — Neutral, versatile voice
   - **Echo / Onyx** — Deep male voices
   - **Fable** — British-accented male voice

---

### Step 4 — Listen

**Read a single page:**
- Click the **▶ Play** button on any page card to hear it read aloud
- Click **⏹ Stop** to stop playback at any time

**Auto-play through all pages:**
1. Click **"Play All"** to start reading from the beginning
2. The app will automatically move to the next page when each one finishes
3. Click **"Stop"** to pause at any time

---

## API Keys (Optional)

The app works completely free using Puter AI and Browser voices. API keys are only needed if you want to use premium providers.

| Provider | Where to get a key | Cost |
|---|---|---|
| Puter | [puter.com](https://puter.com) — free account | Free |
| Browser | Built into your OS | Free |
| Gemini | [aistudio.google.com](https://aistudio.google.com) → Get API Key | Free tier (limited) |
| OpenAI | [platform.openai.com](https://platform.openai.com) | Paid |
| ElevenLabs | [elevenlabs.io](https://elevenlabs.io) | Free tier + Paid |

To enter an API key:
1. Open **Settings**
2. Paste your key in the appropriate field
3. Click **Save**

---

## Tips & Tricks

- **Best free setup:** Use **Puter AI** for scanning + **Puter Nova** voice for reading
- **Offline reading:** Use **Browser** voice — works without internet after pages are scanned
- **Rate limits:** Gemini free tier allows ~15 requests per minute. The app automatically spaces requests to avoid hitting this limit
- **Large PDFs:** For manga volumes with 100+ pages, scan in batches by selecting a range
- **Text quality:** If the extracted text looks wrong, try re-scanning that page individually

---

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **OCR:** Puter AI (primary), Google Gemini (fallback)
- **TTS:** Puter AI, Gemini TTS, OpenAI TTS, ElevenLabs, Web Speech API
- **PDF Parsing:** pdf.js

---

## License

MIT — free to use, modify, and distribute.
