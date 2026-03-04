import React, { useState, useRef, useEffect } from 'react';
import { MangaPage, VOICES, TTSProvider, VoiceProfile } from './types';
import { GeminiService } from './services/geminiService';
import { OpenAIService } from './services/openaiService';
import { ElevenLabsService } from './services/elevenLabsService';
import { TypecastService } from './services/typecastService';
import { PuterService } from './services/puterService';
import { OpenRouterService } from './services/openRouterService';
import { Player } from './services/audioService';
// CORS Proxy Helpers
// Rotating list of free CORS proxies to ensure reliability
const PROXIES = [
  // Primary: AllOrigins (reliable, JSON/Raw support)
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  // Secondary: CORSProxy.io (Fast, direct)
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  // Tertiary: ThingProxy
  (url: string) => `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(url)}`,
  // Quaternary: CodeTabs
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

const fetchWithProxy = async (targetUrl: string): Promise<Response> => {
  let lastError: any;
  for (const formatProxy of PROXIES) {
    try {
      const proxyUrl = formatProxy(targetUrl);
      const response = await fetch(proxyUrl);
      if (response.ok) return response;
      
      // If we get here, status was not 200-299. Log and try next proxy.
      console.warn(`Proxy ${proxyUrl} returned ${response.status}`);
      lastError = new Error(`Proxy returned ${response.status}`);
    } catch (e) {
      console.warn(`Proxy attempt failed for ${formatProxy(targetUrl).split('?')[0]}...`, e);
      lastError = e;
    }
  }
  throw lastError || new Error("Failed to fetch through all proxies");
};

const App: React.FC = () => {
  // Data State
  const [pages, setPages] = useState<MangaPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [scrapeUrl, setScrapeUrl] = useState(''); // New state for web scraping
  const [isScraping, setIsScraping] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showScraper, setShowScraper] = useState(false); // Modal toggle

  // Audio Configuration State
  const [provider, setProvider] = useState<TTSProvider>('gemini');
  const [selectedVoice, setSelectedVoice] = useState(VOICES.find(v => v.provider === 'gemini')?.id || 'Kore');
  const [browserVoices, setBrowserVoices] = useState<VoiceProfile[]>([]);
  
  // Safe LocalStorage Helper
  const getStorage = (key: string) => {
    try {
      return localStorage.getItem(key) || '';
    } catch (e) {
      console.warn('LocalStorage access denied', e);
      return '';
    }
  };

  const setStorage = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalStorage access denied', e);
    }
  };

  // API Keys
  const [openaiKey, setOpenaiKey] = useState(getStorage('openai_key'));
  const [geminiKey, setGeminiKey] = useState(getStorage('gemini_key'));
  const [elevenLabsKey, setElevenLabsKey] = useState(getStorage('elevenlabs_key'));
  const [typecastKey, setTypecastKey] = useState(getStorage('typecast_key'));
  const [openRouterKey, setOpenRouterKey] = useState(getStorage('openrouter_key'));

  // Zoom & Pan State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Services
  const gemini = useRef(new GeminiService(geminiKey));
  const openai = useRef(new OpenAIService(openaiKey));
  const elevenlabs = useRef(new ElevenLabsService(elevenLabsKey));
  const typecast = useRef(new TypecastService(typecastKey));
  const puterService = useRef(new PuterService());
  const openRouter = useRef(new OpenRouterService(openRouterKey));
  const player = useRef(new Player());
  
  // Refs
  const speakingRef = useRef(false);

  // Update Services on Key Change
  useEffect(() => {
    openai.current.setApiKey(openaiKey);
    setStorage('openai_key', openaiKey);
  }, [openaiKey]);

  useEffect(() => {
    gemini.current.setApiKey(geminiKey);
    setStorage('gemini_key', geminiKey);
  }, [geminiKey]);

  useEffect(() => {
    elevenlabs.current.setApiKey(elevenLabsKey);
    setStorage('elevenlabs_key', elevenLabsKey);
  }, [elevenLabsKey]);

  useEffect(() => {
    typecast.current.setApiKey(typecastKey);
    setStorage('typecast_key', typecastKey);
  }, [typecastKey]);

  useEffect(() => {
    openRouter.current.setApiKey(openRouterKey);
    setStorage('openrouter_key', openRouterKey);
  }, [openRouterKey]);

  // Handle Provider Change -> Default Voice
  // Load browser voices dynamically
  useEffect(() => {
    const loadVoices = () => {
      const systemVoices = window.speechSynthesis.getVoices();
      const engVoices: VoiceProfile[] = systemVoices
        .filter(v => v.lang.startsWith('en'))
        .map(v => ({ name: v.name, id: v.name, provider: 'browser' as TTSProvider }));
      if (engVoices.length > 0) setBrowserVoices(engVoices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const handleProviderChange = (newProvider: TTSProvider) => {
    setProvider(newProvider);
    if (newProvider === 'browser') {
      setSelectedVoice(browserVoices[0]?.id || 'default');
    } else {
      const firstVoice = VOICES.find(v => v.provider === newProvider);
      if (firstVoice) setSelectedVoice(firstVoice.id);
    }
    setPages(prev => prev.map(p => ({ ...p, audioCache: undefined })));
  };

  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [currentIndex]);

  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false);
        else if (showScraper) setShowScraper(false);
        else setIsFullScreen(false);
      }
      if (!showSettings && !showScraper) {
        if (e.key === 'ArrowLeft' && !isProcessing) setCurrentIndex(prev => Math.max(0, prev - 1));
        if (e.key === 'ArrowRight' && !isProcessing) setCurrentIndex(prev => Math.min(pages.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pages.length, isProcessing, showSettings, showScraper]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (showSettings || showScraper) return; 
      const items = e.clipboardData?.items;
      if (!items) return;

      Array.from(items).forEach((item: any) => {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const base64 = ev.target?.result as string;
              const newPage: MangaPage = {
                id: Math.random().toString(36).substr(2, 9),
                url: base64,
                base64: base64,
                status: 'idle'
              };
              setPages(prev => [...prev, newPage]);
            };
            reader.readAsDataURL(file);
          }
        }
      });
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [showSettings, showScraper]);

  // --- PDF HANDLING ---
  const processPdf = async (file: File) => {
    try {
      setIsImporting(true);
      // @ts-ignore
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        if (context) {
          await page.render({ canvasContext: context, viewport: viewport }).promise;
          const base64 = canvas.toDataURL('image/jpeg', 0.85);
          setPages(prev => [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            url: base64,
            base64: base64,
            status: 'idle'
          }]);
        }
      }
    } catch (e: any) {
      console.error("PDF Import Error", e);
      setErrorToast("Failed to import PDF: " + e.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files) as File[]) {
      if (file.type === 'application/pdf') {
        await processPdf(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target?.result as string;
          const newPage: MangaPage = {
            id: Math.random().toString(36).substr(2, 9),
            url: base64,
            base64: base64,
            status: 'idle'
          };
          setPages(prev => [...prev, newPage]);
        };
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  };

  // --- WEB SCRAPER LOGIC ---
  const handleWebScrape = async () => {
    if (!scrapeUrl) return;
    setIsScraping(true);
    try {
      // Normalize URL
      let targetUrl = scrapeUrl;
      if (!targetUrl.match(/^https?:\/\//i)) {
          targetUrl = 'https://' + targetUrl;
      }

      // 1. Fetch HTML via Proxy with Fallback
      const response = await fetchWithProxy(targetUrl);
      const htmlText = await response.text();
      
      // 2. Parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      
      // 3. Extract Images
      const imgElements = Array.from(doc.querySelectorAll('img'));
      const extractedImages: string[] = [];
      const seenUrls = new Set();

      // Helper to resolve relative URLs
      const resolveUrl = (relativeUrl: string) => {
        try {
          return new URL(relativeUrl, targetUrl).href;
        } catch {
          return null;
        }
      };

      imgElements.forEach(img => {
        // Try various common lazy loading attributes
        const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
        
        if (src) {
          const fullUrl = resolveUrl(src);
          
          if (fullUrl && !seenUrls.has(fullUrl)) {
             // Basic filter for common ad sizes or icons based on file extensions or obvious tracking keywords
             const lower = fullUrl.toLowerCase();
             if (!lower.match(/\.(svg|ico)$/) && !lower.includes('tracker') && !lower.includes('analytics') && !lower.includes('logo')) {
               extractedImages.push(fullUrl);
               seenUrls.add(fullUrl);
             }
          }
        }
      });

      if (extractedImages.length === 0) {
        setErrorToast("No images found on this page. The site might be SPA-only.");
      } else {
        // Add images to state
        const newPages: MangaPage[] = extractedImages.map(url => ({
          id: Math.random().toString(36).substr(2, 9),
          url: url,
          status: 'idle'
        }));
        setPages(prev => [...prev, ...newPages]);
        setShowScraper(false);
        setScrapeUrl('');
      }

    } catch (e: any) {
      console.error("Scrape Error", e);
      setErrorToast("Failed to fetch webpage. Site may block proxies or use advanced protection.");
    } finally {
      setIsScraping(false);
    }
  };

  const addUrl = () => {
    if (!urlInput) return;
    const newPage: MangaPage = {
      id: Math.random().toString(36).substr(2, 9),
      url: urlInput,
      status: 'idle'
    };
    setPages(prev => [...prev, newPage]);
    setUrlInput('');
  };

  // --- VIEWER LOGIC ---

  const handleZoom = (delta: number) => {
    setScale(prev => Math.min(Math.max(1, prev + delta), 4));
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      handleZoom(delta);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- ANALYSIS LOGIC ---

  const processSinglePage = async (index: number, force: boolean = false) => {
    const page = pages[index];
    if (!page || (!force && (page.status === 'ready' || page.status === 'processing'))) return;

    setPages(prev => prev.map((p, idx) => idx === index ? { 
      ...p, 
      status: 'processing', 
      transcription: undefined,
      audioCache: undefined 
    } : p));

    try {
      let imageToProcess = page.base64;
      
      // If we don't have base64 (external URL), we must fetch it.
      if (!imageToProcess) {
        try {
          // Try direct fetch first
          const resp = await fetch(page.url);
          if (!resp.ok) throw new Error("Direct fetch failed");
          const blob = await resp.blob();
          imageToProcess = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.readAsDataURL(blob);
          });
        } catch (fetchErr) {
          // Retry with Proxy
          console.log("Direct fetch failed, trying proxy for analysis...");
          try {
            const resp = await fetchWithProxy(page.url);
            const blob = await resp.blob();
            imageToProcess = await new Promise<string>((resolve) => {
              const r = new FileReader();
              r.onloadend = () => resolve(r.result as string);
              r.readAsDataURL(blob);
            });
          } catch (proxyErr: any) {
            throw new Error(`Failed to load image: ${proxyErr.message}`);
          }
        }
      }

      if (imageToProcess) {
        let text: string;
        // Use Puter for scanning (free, no rate limits) — Gemini key is reserved for TTS
        try {
          text = await puterService.current.transcribePage(imageToProcess);
        } catch (puterErr: any) {
          // Puter failed — fall back to Gemini OCR
          text = await gemini.current.transcribeMangaPage(imageToProcess);
        }
        // Normalize ALL CAPS manga text → natural sentence case for display and TTS
        text = text
          .replace(/\b([A-Z][A-Z''\-]{1,})\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase())
          .trim();
        setPages(prev => prev.map((p, idx) => idx === index ? {
          ...p,
          transcription: text,
          status: 'ready',
          base64: imageToProcess // Cache the base64 so we don't fetch again
        } : p));
      }
    } catch (err: any) {
      console.error("Single page analysis failed", err);
      const isQuota = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED');
      
      if (isQuota) {
        setErrorToast("Gemini rate limit hit. Wait a moment and try again (free tier: 15 scans/min).");
      } else {
        // More descriptive error for user
        const msg = err.message.includes("Failed to load image") 
          ? "Could not load image. The website may be blocking access." 
          : err.message;
        setErrorToast("Scan failed: " + msg);
      }
      
      setPages(prev => prev.map((p, idx) => idx === index ? { ...p, status: 'error' } : p));
    }
  };

  const processAllPages = async () => {
    if (pages.length === 0) return;
    setIsProcessing(true);

    const indicesToProcess = pages
        .map((p, i) => ({ status: p.status, index: i }))
        .filter(p => p.status === 'idle' || p.status === 'error')
        .map(p => p.index);

    if (indicesToProcess.length === 0) {
      setIsProcessing(false);
      return;
    }

    try {
      // SLIDING WINDOW CONCURRENCY: Scan 2 pages at a time (safe for Gemini free tier)
      const CONCURRENCY_LIMIT = 2;
      const executing = new Set<Promise<void>>();

      for (const index of indicesToProcess) {
        // Create the promise for the current page
        const p = processSinglePage(index, true).then(() => {
          // Remove from set when done
          executing.delete(p);
        });
        
        executing.add(p);

        // If we hit the limit, wait for one to finish before starting the next
        if (executing.size >= CONCURRENCY_LIMIT) {
          await Promise.race(executing);
        }
      }
      
      // Wait for the remaining active requests to complete
      await Promise.all(executing);

    } finally {
      setIsProcessing(false);
    }
  };

  // --- AUDIO LOGIC ---

  // Cleans raw manga transcription into natural flowing text for TTS
  const cleanTextForTTS = (raw: string): string => {
    return raw
      // Collapse repeated punctuation first
      .replace(/!{2,}/g, '!')
      .replace(/\?{2,}/g, '?')
      .replace(/\.{4,}/g, '...')
      // Ellipsis → comma pause (sounds more natural when spoken)
      .replace(/\.\.\./g, ', ')
      // Remove markdown/formatting artifacts
      .replace(/[*_#~`]/g, '')
      // Split into lines, trim, drop blanks
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      // Merge fragmented lines — if a line doesn't end a sentence, join it to the next
      .reduce((acc: string[], line: string) => {
        if (acc.length === 0) return [line];
        const prev = acc[acc.length - 1];
        if (!/[.!?,]$/.test(prev)) {
          acc[acc.length - 1] = prev + ' ' + line;
        } else {
          acc.push(line);
        }
        return acc;
      }, [])
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const playSystemVoice = (text: string): Promise<void> => {
    return new Promise((resolve) => {
        const cleanText = cleanTextForTTS(text);
        const utterance = new SpeechSynthesisUtterance(cleanText);
        
        const voices = window.speechSynthesis.getVoices();
        // Use selected voice if set, otherwise prefer neural/online voices
        const preferred = voices.find(v => v.name === selectedVoice) ||
                          voices.find(v => v.name.includes('Microsoft Aria Online')) ||
                          voices.find(v => v.name.includes('Microsoft Emma Online')) ||
                          voices.find(v => v.name.includes('Microsoft Jenny Online')) ||
                          voices.find(v => v.name.includes('Google US English')) ||
                          voices.find(v => v.name.includes('Samantha')) ||
                          voices.find(v => v.lang === 'en-US' && v.localService === false) ||
                          voices.find(v => v.lang.startsWith('en-US')) ||
                          voices[0];
        if (preferred) utterance.voice = preferred;
        
        utterance.rate = 0.92;
        utterance.onend = () => resolve();
        utterance.onerror = (e) => {
            console.warn("System TTS error", e);
            resolve();
        };

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    });
  };

  const synthesizeAndPlay = async (page: MangaPage): Promise<void> => {
      const useSystem = provider === 'browser';
      const useOpenAI = provider === 'openai';
      const useElevenLabs = provider === 'elevenlabs';
      const useTypecast = provider === 'typecast';
      const usePuter = provider === 'puter';
      const useGemini = provider === 'gemini';

      if (useSystem) {
        await playSystemVoice(page.transcription || '');
        return;
      }

      // Puter plays audio directly (blob URLs are cross-origin scoped, can't be fetched)
      if (usePuter) {
        await puterService.current.playAudio(cleanTextForTTS(page.transcription || ''));
        return;
      }

      try {
          let audioChunks = page.audioCache;
          
          if (!audioChunks || audioChunks.length === 0) {
              if (useOpenAI) {
                audioChunks = await openai.current.generateSpeech(page.transcription || '', selectedVoice);
              } else if (useElevenLabs) {
                audioChunks = await elevenlabs.current.generateSpeech(page.transcription || '', selectedVoice);
              } else if (useTypecast) {
                audioChunks = await typecast.current.generateSpeech(page.transcription || '', selectedVoice);
              } else if (usePuter) {
                audioChunks = await puterService.current.generateSpeech(page.transcription || '', selectedVoice);
              } else if (useGemini) {
                audioChunks = await gemini.current.generateSpeech(page.transcription || '', selectedVoice);
              }
              
              if (audioChunks && audioChunks.length > 0) {
                 setPages(prev => prev.map(p => p.id === page.id ? { ...p, audioCache: audioChunks } : p));
              }
          }
          
          if (audioChunks) {
            await player.current.play(audioChunks);
          }

      } catch (err: any) {
          console.error(`${provider} TTS failed`, err);
          const msg = (err.message || '').toLowerCase();
          
          if (msg.includes('api key') || msg.includes('401') || msg.includes('unauthorized')) {
             setErrorToast(`Invalid ${provider.toUpperCase()} API Key. Check Settings.`);
             setShowSettings(true);
             return;
          }

          const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('limit') || msg.includes('resource_exhausted') || msg.includes('tier');
          
          if (isQuota) {
              setErrorToast(`${provider.toUpperCase()} Quota Limit. Falling back to Browser Voice.`);
              await playSystemVoice(cleanTextForTTS(page.transcription || ''));
          } else {
             setErrorToast("Audio Error. Switching to Browser Voice.");
             await playSystemVoice(cleanTextForTTS(page.transcription || ''));
          }
      }
  };

  const readPage = async (index: number) => {
    const page = pages[index];
    if (!page || !page.transcription) {
      setErrorToast("Please scan page first.");
      return;
    }
    await player.current.resume();
    setIsSpeaking(true);
    speakingRef.current = true;
    try {
      await synthesizeAndPlay(page);
    } finally {
      if (speakingRef.current) {
        setIsSpeaking(false);
        speakingRef.current = false;
      }
    }
  };

  const stopAudio = () => {
    player.current.stop();
    window.speechSynthesis.cancel();
    puterService.current.stopAudio();
    speakingRef.current = false;
    setIsSpeaking(false);
  };

  const readSequence = async () => {
    if (isSpeaking) {
      stopAudio();
      return;
    }
    const startIndex = currentIndex;
    const pagesToRead = pages.slice(startIndex);
    if (pagesToRead.length === 0) return;

    await player.current.resume();
    setIsSpeaking(true);
    speakingRef.current = true;

    try {
      for (let i = 0; i < pagesToRead.length; i++) {
        const globalIndex = startIndex + i;
        const page = pages[globalIndex];
        
        if (!speakingRef.current) break;
        setCurrentIndex(globalIndex);
        if (page.status !== 'ready' || !page.transcription) continue; 
        if (speakingRef.current) await synthesizeAndPlay(page);
      }
    } finally {
      setIsSpeaking(false);
      speakingRef.current = false;
    }
  };

  const removePage = (id: string) => {
    setPages(prev => prev.filter(p => p.id !== id));
    if (currentIndex >= pages.length - 1 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const currentPage = pages[currentIndex];
  const availableVoices = provider === 'browser'
    ? (browserVoices.length > 0 ? browserVoices : VOICES.filter(v => v.provider === 'browser'))
    : VOICES.filter(v => v.provider === provider);

  const LoadingSpinner = () => (
    <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full"></div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
              <h2 className="font-bold text-white flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                API Key Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
              {/* Settings Inputs... */}
              <div>
                <label className="block text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">Google Gemini API Key</label>
                <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="Defaults to system key if empty" className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-green-400 uppercase tracking-wider mb-2">OpenAI API Key</label>
                <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:ring-2 focus:ring-green-500 outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">ElevenLabs API Key</label>
                <input type="password" value={elevenLabsKey} onChange={(e) => setElevenLabsKey(e.target.value)} placeholder="xi-..." className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-orange-400 uppercase tracking-wider mb-2">Typecast.ai API Key</label>
                <input type="password" value={typecastKey} onChange={(e) => setTypecastKey(e.target.value)} placeholder="Typecast API Key" className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">OpenRouter API Key <span className="text-emerald-600 normal-case font-normal">(Free OCR — openrouter.ai)</span></label>
                <p className="text-[10px] text-slate-500 mb-2">Free account → free vision models (Gemini 2.0 Flash, Llama 4). No credit card needed.</p>
                <input type="password" value={openRouterKey} onChange={(e) => setOpenRouterKey(e.target.value)} placeholder="sk-or-..." className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"/>
              </div>
            </div>
            <div className="bg-slate-800/50 p-4 text-right">
              <button onClick={() => setShowSettings(false)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded text-sm font-bold transition">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Web Scraper Modal */}
      {showScraper && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowScraper(false)}>
           <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
             <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Scan Webpage
                </h2>
                <button onClick={() => setShowScraper(false)} className="text-slate-400 hover:text-white">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
             </div>
             <div className="p-6">
               <p className="text-sm text-slate-400 mb-4">Enter the URL of a manga chapter. The app will attempt to extract images from the page.</p>
               <input 
                  type="text" 
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="https://example-manga-site.com/chapter-1"
                  className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none mb-4"
                  onKeyDown={(e) => e.key === 'Enter' && handleWebScrape()}
                />
                <button 
                  onClick={handleWebScrape}
                  disabled={isScraping || !scrapeUrl}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded text-sm font-bold shadow-lg transition flex items-center justify-center gap-2"
                >
                  {isScraping ? (
                    <>
                      <LoadingSpinner />
                      Scanning Page...
                    </>
                  ) : 'Start Scan'}
                </button>
                <div className="mt-4 p-3 bg-slate-800/50 rounded border border-slate-700/50">
                  <p className="text-[10px] text-slate-500 leading-normal">
                    <span className="font-bold text-orange-400">NOTE:</span> This uses a proxy service to bypass security restrictions (CORS). Some websites may block this. If images fail to load, the site is likely protected.
                  </p>
                </div>
             </div>
           </div>
        </div>
      )}

      {errorToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl font-bold animate-bounce text-sm text-center">
          {errorToast}
        </div>
      )}

      <header className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0 shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center font-black text-black">M</div>
          <h1 className="text-xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent hidden sm:block">
            MANGA AUDIO AI
          </h1>
        </div>
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2 bg-slate-800 rounded p-1 border border-slate-700">
             <select 
               className="bg-transparent text-xs font-bold text-slate-300 focus:outline-none cursor-pointer"
               value={provider}
               onChange={(e) => handleProviderChange(e.target.value as TTSProvider)}
               disabled={isSpeaking}
             >
               <option value="gemini">Gemini AI</option>
               <option value="openai">OpenAI</option>
               <option value="elevenlabs">ElevenLabs</option>
               <option value="typecast">Typecast</option>
               <option value="puter">Puter AI</option>
               <option value="browser">Browser</option>
             </select>
          </div>

          <select 
            className="bg-slate-800 border border-slate-700 p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 text-slate-200 max-w-[120px] sm:max-w-xs"
            value={selectedVoice}
            disabled={false}
            onChange={(e) => {
              setSelectedVoice(e.target.value);
              setPages(prev => prev.map(p => ({ ...p, audioCache: undefined })));
            }}
          >
            {availableVoices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"
            title="API Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          
          <button 
            onClick={stopAudio}
            className="bg-red-900/40 hover:bg-red-900/60 text-red-400 px-4 py-2 rounded text-sm transition font-medium whitespace-nowrap"
          >
            Stop
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className={`w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col shrink-0 transition-all duration-500 ${isFullScreen ? '-ml-80' : 'ml-0'}`}>
          <div className="p-4 border-b border-slate-800 space-y-3">
            <div className="flex flex-col gap-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Import Manga</label>
              
              <div className="grid grid-cols-2 gap-2">
                <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition border border-slate-700">
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*,application/pdf" 
                    onChange={handleFileUpload}
                    disabled={isImporting}
                    className="hidden"
                  />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Upload File
                </label>
                <button 
                  onClick={() => setShowScraper(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-cyan-400 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 transition border border-slate-700"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Scan Web
                </button>
              </div>

              <div className="flex gap-1">
                <input 
                  type="text" 
                  placeholder="Paste direct image URL..." 
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded p-2 text-xs flex-1 focus:ring-1 focus:ring-cyan-500 outline-none placeholder-slate-600"
                />
                <button onClick={addUrl} className="bg-slate-700 hover:bg-slate-600 px-3 rounded text-xs font-bold transition">Add</button>
              </div>
            </div>
            
            {isImporting && (
               <div className="w-full bg-slate-800 py-2 rounded flex items-center justify-center gap-2 text-xs font-bold text-cyan-400 animate-pulse border border-cyan-900">
                  <LoadingSpinner />
                  Importing PDF...
               </div>
            )}

            <button 
              onClick={processAllPages}
              disabled={isProcessing || pages.length === 0}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded text-sm font-bold shadow-lg shadow-cyan-900/20 transition flex items-center justify-center gap-2"
            >
              {isProcessing && <LoadingSpinner />}
              {isProcessing ? 'Analyzing All...' : 'Analyze All Pending'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            {pages.map((page, idx) => (
              <div 
                key={page.id}
                onClick={() => setCurrentIndex(idx)}
                className={`group flex items-center gap-3 p-2 rounded cursor-pointer transition ${currentIndex === idx ? 'bg-cyan-900/30 ring-1 ring-cyan-500' : 'hover:bg-slate-800'}`}
              >
                <div className="w-12 h-16 bg-slate-800 rounded overflow-hidden shrink-0 relative border border-slate-700">
                  <img src={page.url} alt="Page" className="w-full h-full object-cover" />
                  {page.status === 'processing' && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                       <LoadingSpinner />
                    </div>
                  )}
                  {page.audioCache && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-cyan-500 rounded-tl shadow-sm"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold truncate">Page {idx + 1}</p>
                    {(page.status === 'idle' || page.status === 'ready' || page.status === 'error') && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); processSinglePage(idx, true); }}
                        className="opacity-0 group-hover:opacity-100 text-cyan-400 hover:text-cyan-300 transition-opacity"
                        title={page.status === 'ready' ? "Re-scan this page" : "Scan this page"}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          {page.status === 'ready' ? (
                            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                          ) : (
                            <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>
                          )}
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`text-[10px] uppercase font-bold tracking-tighter ${page.status === 'ready' ? 'text-cyan-400' : page.status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>
                      {page.status === 'ready' ? 'Ready' : page.status === 'processing' ? 'Scanning...' : page.status === 'error' ? 'Error' : 'Pending'}
                    </p>
                    {page.audioCache && (
                      <span className="text-[8px] bg-slate-800 text-slate-400 px-1 rounded font-black uppercase tracking-widest border border-slate-700">Audio Ready</span>
                    )}
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); removePage(page.id); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 transition-opacity"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main Viewer Area */}
        <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
          {currentPage ? (
            <>
              <div 
                ref={containerRef}
                className={`flex-1 overflow-hidden flex items-center justify-center p-8 transition-all duration-700 ${isFullScreen ? 'bg-black p-0' : 'bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black'} relative cursor-default`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div 
                  className={`relative transition-transform duration-200 ease-out ${isFullScreen ? 'h-screen w-screen flex items-center justify-center' : 'max-h-full max-w-full'}`}
                  style={{ 
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                  }}
                  onDoubleClick={() => setIsFullScreen(!isFullScreen)}
                >
                  <img 
                    src={currentPage.url} 
                    alt={`Page ${currentIndex + 1}`}
                    draggable={false}
                    className={`${isFullScreen ? 'h-full w-auto' : 'max-h-full max-w-full'} shadow-2xl rounded shadow-black/80 ring-1 ring-slate-800 transition-all duration-500 ${currentPage.status === 'processing' ? 'opacity-40' : 'opacity-100'}`}
                  />
                  
                  {currentPage.status === 'processing' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 animate-spin rounded-full"></div>
                      <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-cyan-500/30 text-cyan-400 text-xs font-black tracking-widest uppercase animate-pulse">
                        Scanning All Text...
                      </div>
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-[scan_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(34,211,238,0.8)]"></div>
                    </div>
                  )}

                  {(currentPage.status === 'idle' || currentPage.status === 'ready' || currentPage.status === 'error') && !isProcessing && scale === 1 && !isFullScreen && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity duration-300 backdrop-blur-[2px]">
                      <button 
                        onClick={() => processSinglePage(currentIndex, true)}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-full font-black text-sm shadow-2xl shadow-cyan-900/50 flex items-center gap-3 transform hover:scale-105 transition"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
                        {currentPage.status === 'ready' ? 'RE-ANALYZE PAGE' : 'ANALYZE THIS PAGE'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Full Screen Controls */}
                {isFullScreen && (
                  <div className="absolute inset-0 pointer-events-none group/fs">
                    {/* Top Right Close Button */}
                    <button 
                      onClick={() => setIsFullScreen(false)}
                      className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all z-50 pointer-events-auto opacity-0 group-hover/fs:opacity-100"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>

                    {/* Navigation Arrows */}
                    <button 
                      onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentIndex === 0}
                      className="absolute left-8 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-sm flex items-center justify-center text-white/30 hover:text-white disabled:opacity-0 transition-all z-40 pointer-events-auto opacity-0 group-hover/fs:opacity-100"
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <button 
                      onClick={() => setCurrentIndex(prev => Math.min(pages.length - 1, prev + 1))}
                      disabled={currentIndex === pages.length - 1}
                      className="absolute right-8 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-sm flex items-center justify-center text-white/30 hover:text-white disabled:opacity-0 transition-all z-40 pointer-events-auto opacity-0 group-hover/fs:opacity-100"
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </button>

                    {/* Floating Narration Trigger */}
                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 z-50 pointer-events-auto opacity-0 group-hover/fs:opacity-100 transition-opacity">
                      {currentPage.status === 'ready' ? (
                        <div className="flex flex-col items-center gap-2">
                           {currentPage.audioCache && <span className="text-[10px] font-black text-cyan-400 bg-cyan-900/50 px-3 py-1 rounded-full uppercase tracking-widest border border-cyan-500/30">From Cache ({provider})</span>}
                           <button 
                            onClick={() => isSpeaking ? stopAudio() : readPage(currentIndex)}
                            disabled={!currentPage.transcription}
                            className={`${isSpeaking ? 'bg-red-600 hover:bg-red-500' : (!currentPage.transcription ? 'bg-slate-700 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500')} text-white px-8 py-4 rounded-full font-black text-sm shadow-2xl flex items-center gap-3 transition transform hover:scale-105 active:scale-95`}
                          >
                            {isSpeaking ? (
                              <>
                                <div className="flex gap-1 items-end h-4">
                                  <div className="w-1 h-2 bg-white animate-[bounce_1s_infinite]"></div>
                                  <div className="w-1 h-4 bg-white animate-[bounce_1s_infinite_0.2s]"></div>
                                  <div className="w-1 h-3 bg-white animate-[bounce_1s_infinite_0.4s]"></div>
                                </div>
                                STOP NARRATION
                              </>
                            ) : (
                              <>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                {currentPage.audioCache ? 'RE-PLAY NARRATION' : (!currentPage.transcription ? 'NO DIALOGUE' : 'START NARRATION')}
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-full border border-slate-700 text-slate-400 text-xs font-bold flex items-center gap-2">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          SCAN PAGE IN NORMAL VIEW FIRST
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Zoom Controls Overlay */}
                <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-full shadow-2xl z-20 transition-opacity ${isFullScreen ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                  <button 
                    onClick={() => handleZoom(-0.25)}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    title="Zoom Out"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  <div className="px-2 text-[10px] font-black text-slate-500 w-10 text-center">
                    {Math.round(scale * 100)}%
                  </div>
                  <button 
                    onClick={() => handleZoom(0.25)}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    title="Zoom In"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  {scale !== 1 && (
                    <>
                      <div className="w-px h-4 bg-slate-700 mx-1"></div>
                      <button 
                        onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
                        className="px-3 h-8 rounded-full flex items-center justify-center hover:bg-cyan-600/20 text-cyan-400 text-[10px] font-bold transition uppercase tracking-tighter"
                      >
                        Reset
                      </button>
                    </>
                  )}
                  <div className="w-px h-4 bg-slate-700 mx-1"></div>
                  <button 
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition ${isFullScreen ? 'bg-cyan-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
                    title="Toggle Full Screen"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                  </button>
                </div>
              </div>
              
              {!isFullScreen && (
                <>
                  <div className="absolute top-4 right-4 flex gap-2 z-20">
                    <button 
                      onClick={readSequence}
                      disabled={isSpeaking && !speakingRef.current ? false : (isSpeaking && speakingRef.current) || !pages.some(p => p.status === 'ready')}
                      className={`${isSpeaking ? 'bg-red-600 hover:bg-red-500' : 'bg-purple-600 hover:bg-purple-500'} disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-xl shadow-purple-900/40 flex items-center gap-2 transition-all transform active:scale-95`}
                    >
                      {isSpeaking ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
                          Stop Sequence
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          Read from Here
                        </>
                      )}
                    </button>
                  </div>

                  <div className={`h-56 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 p-5 flex flex-col gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.5)] z-10 transition-transform duration-500 ${isFullScreen ? 'translate-y-56' : 'translate-y-0'}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Page {currentIndex + 1} Script</h3>
                        {isSpeaking && (
                          <div className="flex items-center gap-2 text-cyan-400 text-[10px] font-bold animate-pulse uppercase">
                            <div className="flex gap-0.5 items-end h-3">
                              <div className="w-0.5 h-1.5 bg-cyan-400 animate-[bounce_1s_infinite]"></div>
                              <div className="w-0.5 h-3 bg-cyan-400 animate-[bounce_1s_infinite_0.2s]"></div>
                              <div className="w-0.5 h-2 bg-cyan-400 animate-[bounce_1s_infinite_0.4s]"></div>
                            </div>
                            {provider.toUpperCase()} Speaking...
                          </div>
                        )}
                        {currentPage.audioCache && !isSpeaking && (
                          <span className="text-[9px] font-bold text-slate-500 border border-slate-800 px-2 py-0.5 rounded-full uppercase">Audio Cached</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {currentPage.status === 'ready' && (
                          <button 
                            onClick={() => processSinglePage(currentIndex, true)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition mr-2"
                            title="Re-run analysis"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
                            Re-Scan
                          </button>
                        )}
                        {currentPage.status === 'idle' || currentPage.status === 'error' ? (
                          <button 
                            onClick={() => processSinglePage(currentIndex)}
                            className="bg-slate-800 hover:bg-slate-700 text-cyan-400 px-5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                            Scan Now
                          </button>
                        ) : (
                          <button 
                            onClick={() => isSpeaking ? stopAudio() : readPage(currentIndex)}
                            disabled={currentPage.status !== 'ready' || !currentPage.transcription}
                            className={`${isSpeaking ? 'bg-red-600 hover:bg-red-500' : (!currentPage.transcription ? 'bg-slate-700 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500')} text-white px-5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition transform active:scale-95`}
                          >
                            {isSpeaking ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
                                Stop
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                {currentPage.audioCache ? 'Listen Again' : (!currentPage.transcription ? 'No Dialogue' : 'Listen To Page')}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto text-sm text-slate-300 leading-relaxed italic bg-black/40 p-4 rounded-xl border border-slate-800/50 scrollbar-thin">
                      {currentPage.status === 'ready' ? (
                        currentPage.transcription || <span className="text-slate-600 opacity-50">No speech bubbles detected on this page.</span>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
                          <p className="text-xs uppercase tracking-widest font-bold">{currentPage.status === 'processing' ? 'Processing...' : 'Waiting for Scan'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-700 gap-6">
               <div className="w-32 h-32 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 shadow-inner">
                 <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
               </div>
               <p className="text-lg font-bold text-slate-400">Library is Empty</p>
               <p className="text-sm text-slate-600">Drag images, paste (Ctrl+V), or import via URL.</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className={`h-16 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-8 shrink-0 transition-transform duration-500 ${isFullScreen ? 'translate-y-16' : 'translate-y-0'}`}>
        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          Page <span className="text-white">{pages.length ? currentIndex + 1 : 0}</span> / <span className="text-white">{pages.length}</span>
        </div>
        <div className="flex gap-6">
          <button 
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0 || isProcessing}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 text-slate-300 hover:bg-cyan-600 hover:text-white disabled:bg-slate-900 disabled:text-slate-800 transition transform active:scale-90 shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button 
            onClick={() => setCurrentIndex(prev => Math.min(pages.length - 1, prev + 1))}
            disabled={currentIndex === pages.length - 1 || pages.length === 0 || isProcessing}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 text-slate-300 hover:bg-cyan-600 hover:text-white disabled:bg-slate-900 disabled:text-slate-800 transition transform active:scale-90 shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
        <div className="w-24"></div>
      </footer>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default App;