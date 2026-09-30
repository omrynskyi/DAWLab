import { applyAudioSettings } from "@/lib/audioOutput";

export interface AudioEngine {
  /**
   * `peaksUrl` is where the bytes are fetched for decoding. Playback URLs come
   * from the loopback media server, which the renderer can't fetch cross-origin,
   * so callers pass the fetchable dawpreview:// URL for the same file here.
   */
  load(url: string, peaksUrl?: string): Promise<{ peaks: Float32Array; duration: number }>;
  loadWithPeaks(url: string, peaks: number[], duration: number): Promise<{ peaks: Float32Array; duration: number }>;
  play(): void;
  pause(): void;
  seekTo(time: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  onTimeUpdate(cb: (time: number) => void): () => void;
  onEnded(cb: () => void): () => void;
  destroy(): void;
}

export function createAudioEngine(): AudioEngine {
  const audio = new Audio();
  audio.preload = "auto";

  let peaks: Float32Array = new Float32Array(0);
  let duration = 0;
  let destroyed = false;
  // Output routing is async, so a pause() that lands before it settles must win.
  let playRequested = false;

  // rAF-based time update for smooth ~60fps updates while playing
  const timeListeners = new Set<(time: number) => void>();
  const endedListeners = new Set<() => void>();
  let rafId = 0;

  const tick = () => {
    if (destroyed) return;
    const t = audio.currentTime;
    for (const cb of timeListeners) cb(t);
    if (!audio.paused) {
      rafId = requestAnimationFrame(tick);
    }
  };

  audio.addEventListener("play", () => {
    if (!destroyed) rafId = requestAnimationFrame(tick);
  });
  audio.addEventListener("pause", () => {
    cancelAnimationFrame(rafId);
    // Emit one final time update on pause for accurate position
    const t = audio.currentTime;
    for (const cb of timeListeners) cb(t);
  });
  audio.addEventListener("ended", () => {
    cancelAnimationFrame(rafId);
    for (const cb of endedListeners) cb();
  });

  let blobUrl: string | null = null;

  const setAudioSrc = (src: string) => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
    if (src.startsWith("blob:")) blobUrl = src;
    audio.src = src;
  };

  return {
    async load(url: string, peaksUrl?: string) {
      const resolvedUrl = url;

      // Try to fetch + decode for peak extraction; fall back to audio-element-only if CORS blocks it
      try {
        const response = await fetch(peaksUrl ?? resolvedUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx = new AudioContext();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        await audioCtx.close();

        duration = audioBuffer.duration;

        // Downsample to ~100k points
        const raw = audioBuffer.getChannelData(0);
        const NUM_SAMPLES = 100_000;
        const blockSize = Math.max(1, Math.floor(raw.length / NUM_SAMPLES));
        const actualSamples = Math.ceil(raw.length / blockSize);
        peaks = new Float32Array(actualSamples);

        for (let i = 0; i < actualSamples; i++) {
          let sum = 0;
          const start = i * blockSize;
          const end = Math.min(start + blockSize, raw.length);
          for (let j = start; j < end; j++) {
            sum += Math.abs(raw[j]);
          }
          peaks[i] = sum / (end - start);
        }
      } catch {
        // CORS or network error — set src and let the browser handle playback;
        // waveform will be empty until peaks are provided via loadWithPeaks
        peaks = new Float32Array(0);
      }

      // Set source on the audio element for playback
      setAudioSrc(resolvedUrl);
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => { audio.removeEventListener("canplaythrough", onCanPlay); audio.removeEventListener("error", onError); resolve(); };
        const onError = () => { audio.removeEventListener("canplaythrough", onCanPlay); audio.removeEventListener("error", onError); reject(new Error("Audio load error")); };
        audio.addEventListener("canplaythrough", onCanPlay);
        audio.addEventListener("error", onError);
      });

      if (!duration) duration = audio.duration || 0;

      return { peaks, duration };
    },

    async loadWithPeaks(url: string, precomputedPeaks: number[], precomputedDuration: number) {
      peaks = Float32Array.from(precomputedPeaks);
      duration = precomputedDuration;

      setAudioSrc(url);
      // Resolve regardless of audio load success — peaks are already set so the
      // waveform will render. Playback errors surface when the user hits play.
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          audio.removeEventListener("canplaythrough", onCanPlay);
          audio.removeEventListener("error", onError);
        };
        const onCanPlay = () => { cleanup(); resolve(); };
        const onError = () => {
          console.error('[audio] load failed', {
            src: audio.src,
            error: audio.error,
            code: audio.error?.code,
            // 1=ABORTED 2=NETWORK 3=DECODE 4=SRC_NOT_SUPPORTED
            message: audio.error?.message,
            networkState: audio.networkState,
            readyState: audio.readyState,
          });
          cleanup();
          resolve();
        };
        audio.addEventListener("canplaythrough", onCanPlay);
        audio.addEventListener("error", onError);
      });

      return { peaks, duration };
    },

    play() {
      // AbortError fires when pause() interrupts an in-flight play() — harmless.
      // All other errors are real and should surface. Output device + volume
      // come from the app's audio settings, same as every other player.
      playRequested = true;
      applyAudioSettings(audio).then(() => {
        if (playRequested && !destroyed) return audio.play();
      }).catch((err) => {
        if (err.name !== "AbortError") console.error("Audio play error:", err);
      });
    },

    pause() {
      playRequested = false;
      audio.pause();
    },

    seekTo(time: number) {
      audio.currentTime = Math.max(0, Math.min(time, duration));
      // Emit time update immediately on seek
      const t = audio.currentTime;
      for (const cb of timeListeners) cb(t);
    },

    getCurrentTime() {
      return audio.currentTime;
    },

    getDuration() {
      return duration;
    },

    isPlaying() {
      return !audio.paused;
    },

    onTimeUpdate(cb: (time: number) => void) {
      timeListeners.add(cb);
      return () => { timeListeners.delete(cb); };
    },

    onEnded(cb: () => void) {
      endedListeners.add(cb);
      return () => { endedListeners.delete(cb); };
    },

    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      audio.pause();
      audio.src = "";
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
      timeListeners.clear();
      endedListeners.clear();
    },
  };
}
