// Thin wrapper over the Web Speech API (SpeechRecognition) for voice dictation.
// Feature-detected so the rest of the app degrades gracefully where it's absent
// (e.g. jsdom in tests, or browsers without the API).

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

type Ctor = new () => SpeechRecognitionLike;

function ctor(): Ctor | undefined {
  const w = globalThis as unknown as {
    SpeechRecognition?: Ctor;
    webkitSpeechRecognition?: Ctor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function speechSupported(): boolean {
  return ctor() !== undefined;
}

export interface Dictation {
  stop(): void;
}

export interface DictationHandlers {
  /** Final (committed) transcript chunks, ready to append to the input. */
  onText: (text: string) => void;
  /** Fired when recognition ends for any reason (manual stop, silence, error). */
  onEnd: (error?: string) => void;
}

/**
 * Start dictation. Returns a handle to stop it, or null if unsupported.
 * Only final results are emitted, to keep the composer text stable.
 */
export function startDictation(handlers: DictationHandlers, lang?: string): Dictation | null {
  const Ctor = ctor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang ?? navigator.language;
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (event) => {
    let text = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) text += event.results[i][0].transcript;
    }
    if (text) handlers.onText(text);
  };
  rec.onerror = (e) => handlers.onEnd(e.error);
  rec.onend = () => handlers.onEnd();
  rec.start();
  return { stop: () => rec.stop() };
}
