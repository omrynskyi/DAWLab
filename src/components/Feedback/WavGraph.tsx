import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import type { Comment } from "./CommentCard";
import WaveformCanvas, { type WaveformContextInfo } from "./WaveformCanvas";
import { createAudioEngine, type AudioEngine } from "./utils/audioEngine";

export type { WaveformContextInfo };

export interface AudioPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPlaying: boolean;
}

interface AudioPlayerProps {
  audioUrl: string;
  comments?: Comment[];
  activeCommentIds?: Set<string>;
  highlightedCommentId?: string | null;
  selectedRange?: { start: number; end: number } | null;
  hoveredEdge?: { commentId: string; side: "start" | "end"; time: number } | null;
  pxPerSec: number;
  scrollLeft: number;
  currentTime: number;
  height?: number;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onPeaksReady?: (peaks: Float32Array) => void;
  onSeek?: (time: number) => void;
  onRangeSelect?: (start: number, end: number) => void;
  onClearRange?: () => void;
  onCommentCmdClick?: (comment: Comment) => void;
  onCommentRangeChange?: (commentId: string, start: number, end: number) => void;
  onCommentRangeChangeCommit?: (commentId: string, start: number, end: number) => void;
  onCommentFocus?: (commentId: string) => void;
  onWaveformContextMenu?: (info: WaveformContextInfo) => void;
  loopRange?: { start: number; end: number } | null;
  onLoopRangeChange?: (range: { start: number; end: number } | null) => void;
  onLoadError?: (err: unknown) => void;
  heightScale?: number;
  globalDuration?: number;
  trackLabel?: string;
  isActiveTrack?: boolean;
  onSelectTrack?: () => void;
  onDeleteTrack?: () => void;
  initialPeaks?: number[];
  initialDuration?: number;
  /** Fetchable URL for the same audio, used to decode peaks (see AudioEngine.load). */
  peaksUrl?: string;
}

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  (
    {
      audioUrl,
      comments = [],
      activeCommentIds = new Set(),
      highlightedCommentId,
      selectedRange,
      hoveredEdge,
      pxPerSec,
      scrollLeft,
      currentTime,
      height = 300,
      onTimeUpdate,
      onDurationChange,
      onPlayStateChange,
      onPeaksReady,
      onSeek,
      onRangeSelect,
      onClearRange,
      onCommentCmdClick,
      onCommentRangeChange,
      onCommentRangeChangeCommit,
      onCommentFocus,
      onWaveformContextMenu,
      loopRange,
      onLoopRangeChange,
      onLoadError,
      heightScale = 1,
      globalDuration,
      trackLabel,
      isActiveTrack,
      onSelectTrack,
      onDeleteTrack,
      initialPeaks,
      initialDuration,
      peaksUrl,
    },
    ref
  ) => {
    const engineRef = useRef<AudioEngine | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [peaks, setPeaks] = useState<Float32Array>(new Float32Array(0));

    // Stable callback refs
    const onTimeUpdateRef = useRef(onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;
    const onPlayStateChangeRef = useRef(onPlayStateChange);
    onPlayStateChangeRef.current = onPlayStateChange;
    const onDurationChangeRef = useRef(onDurationChange);
    onDurationChangeRef.current = onDurationChange;
    const onPeaksReadyRef = useRef(onPeaksReady);
    onPeaksReadyRef.current = onPeaksReady;
    const onLoadErrorRef = useRef(onLoadError);
    onLoadErrorRef.current = onLoadError;

    useImperativeHandle(ref, () => ({
      play: () => {
        engineRef.current?.play();
        setIsPlaying(true);
        onPlayStateChangeRef.current?.(true);
      },
      pause: () => {
        engineRef.current?.pause();
        setIsPlaying(false);
        onPlayStateChangeRef.current?.(false);
      },
      seekTo: (time: number) => {
        engineRef.current?.seekTo(time);
      },
      getCurrentTime: () => engineRef.current?.getCurrentTime() ?? 0,
      getDuration: () => engineRef.current?.getDuration() ?? 0,
      get isPlaying() {
        return isPlaying;
      },
    }));

    // Initialize audio engine
    useEffect(() => {
      const engine = createAudioEngine();
      engineRef.current = engine;

      const unsubTime = engine.onTimeUpdate((t) => {
        onTimeUpdateRef.current?.(t);
      });

      const unsubEnded = engine.onEnded(() => {
        setIsPlaying(false);
        onPlayStateChangeRef.current?.(false);
      });

      const loadPromise = (initialPeaks && initialPeaks.length > 0 && initialDuration)
        ? engine.loadWithPeaks(audioUrl, initialPeaks, initialDuration)
        : engine.load(audioUrl, peaksUrl);

      loadPromise.then(({ peaks: p, duration: d }) => {
        setPeaks(p);
        onDurationChangeRef.current?.(d);
        onPeaksReadyRef.current?.(p);
      }).catch((err) => {
        onLoadErrorRef.current?.(err);
      });

      return () => {
        unsubTime();
        unsubEnded();
        engine.destroy();
      };
    }, [audioUrl, initialPeaks, initialDuration, peaksUrl]);

    const handleSeek = (time: number) => {
      onSeek?.(time);
    };

    const handleCommentCmdClick = (comment: Comment) => {
      engineRef.current?.seekTo(comment.timestamp);
      engineRef.current?.play();
      setIsPlaying(true);
      onPlayStateChangeRef.current?.(true);
      onCommentCmdClick?.(comment);
    };

    return (
      <WaveformCanvas
        peaks={peaks}
        duration={engineRef.current?.getDuration() ?? 0}
        pxPerSec={pxPerSec}
        scrollLeft={scrollLeft}
        currentTime={currentTime}
        comments={comments}
        activeCommentIds={activeCommentIds}
        highlightedCommentId={highlightedCommentId}
        selectedRange={selectedRange}
        hoveredEdge={hoveredEdge}
        height={height * heightScale}
        globalDuration={globalDuration}
        trackLabel={trackLabel}
        isActiveTrack={isActiveTrack}
        onSelectTrack={onSelectTrack}
        onDeleteTrack={onDeleteTrack}
        onSeek={handleSeek}
        onRangeSelect={onRangeSelect}
        onClearRange={onClearRange}
        onCommentCmdClick={handleCommentCmdClick}
        onCommentRangeChange={onCommentRangeChange}
        onCommentRangeChangeCommit={onCommentRangeChangeCommit}
        onCommentFocus={onCommentFocus}
        onWaveformContextMenu={onWaveformContextMenu}
        loopRange={loopRange}
        onLoopRangeChange={onLoopRangeChange}
      />
    );
  }
);

export default AudioPlayer;
