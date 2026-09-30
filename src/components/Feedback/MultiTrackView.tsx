import { forwardRef, useImperativeHandle, useRef, useCallback, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import AudioPlayer, { type AudioPlayerHandle, type WaveformContextInfo } from "./WavGraph";
import type { Comment } from "./CommentCard";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TrackEntry {
    id: string;
    audioUrl: string;
    label: string;
    comments: Comment[];
    initialPeaks?: number[];  // pre-computed peaks from server, skips WebAudio decode
    initialDuration?: number;
    peaksUrl?: string;        // fetchable URL for decoding peaks when audioUrl can't be fetched
    hidden?: boolean;         // loaded in background, not yet shown in the waveform UI
}

export interface MultiTrackHandle {
    play: () => void;
    pause: () => void;
    seekTo: (time: number) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    isPlaying: boolean;
}

interface MultiTrackViewProps {
    tracks: TrackEntry[];
    activeTrackId: string;
    isResizing: boolean;

    // Shared waveform state (passed to every AudioPlayer)
    pxPerSec: number;
    scrollLeft: number;
    currentTime: number;
    activeCommentIds: Set<string>;
    highlightedCommentId?: string | null;
    selectedRange?: { start: number; end: number } | null;
    hoveredEdge?: { commentId: string; side: "start" | "end"; time: number } | null;
    loopRange?: { start: number; end: number } | null;
    onLoopRangeChange?: (range: { start: number; end: number } | null) => void;
    onSeek?: (time: number) => void;
    onRangeSelect?: (start: number, end: number) => void;
    onClearRange?: () => void;
    onCommentCmdClick?: (comment: Comment) => void;
    onCommentRangeChange?: (commentId: string, start: number, end: number) => void;
    onCommentRangeChangeCommit?: (commentId: string, start: number, end: number) => void;
    onCommentFocus?: (commentId: string) => void;
    onWaveformContextMenu?: (info: WaveformContextInfo) => void;

    // Callbacks
    onActiveTrackChange?: (trackId: string) => void;
    onDeleteTrack?: (trackId: string) => void;
    onTimeUpdate?: (time: number) => void;
    onPlayStateChange?: (playing: boolean) => void;
    onDurationChange?: (duration: number) => void;
    onPeaksReady?: (peaks: Float32Array) => void;
    onActiveTrackDuration?: (duration: number) => void;
}

// ── Spring transition matching the waveform wrapper ───────────────────────────
const SPRING = { type: "spring" as const, stiffness: 400, damping: 30 };
const INSTANT = { duration: 0 };
const EMPTY_SET = new Set<string>();
const EMPTY_COMMENTS: Comment[] = [];

// Proportion of total height the active track takes (adjustable)
const ACTIVE_TRACK_WEIGHT = 0.5;

// ── Component ─────────────────────────────────────────────────────────────────
const MultiTrackView = forwardRef<MultiTrackHandle, MultiTrackViewProps>(
    (
        {
            tracks,
            activeTrackId,
            isResizing,
            pxPerSec,
            scrollLeft,
            currentTime,
            activeCommentIds,
            highlightedCommentId,
            selectedRange,
            hoveredEdge,
            loopRange,
            onLoopRangeChange,
            onSeek,
            onRangeSelect,
            onClearRange,
            onCommentCmdClick,
            onCommentRangeChange,
            onCommentRangeChangeCommit,
            onCommentFocus,
            onWaveformContextMenu,
            onActiveTrackChange,
            onDeleteTrack,
            onTimeUpdate,
            onPlayStateChange,
            onDurationChange,
            onPeaksReady,
            onActiveTrackDuration,
        },
        ref
    ) => {
        // Ref to the active track's audio player
        const playerRefs = useRef<Map<string, AudioPlayerHandle>>(new Map());

        // When the user clicks an inactive track's waveform, capture the clicked
        // time so the useEffect below can seek to it instead of the old track's position.
        const pendingSeekRef = useRef<number | null>(null);

        // If the user switches to a track that hasn't finished loading yet, we can't
        // seekTo immediately (engine duration = 0, seek silently goes to 0). Store
        // the intent here and apply it when that track's onDurationChange fires.
        const pendingPlayRef = useRef<{ time: number; autoPlay: boolean } | null>(null);

        // Stable ref to current activeTrackId so handleTrackDuration can read it
        // without needing it as a dep (avoids stale closure in the callback).
        const activeTrackIdRef = useRef(activeTrackId);
        activeTrackIdRef.current = activeTrackId;

        // Cache peaks + individual duration for every track so we can re-push the
        // right data when the active track changes (tracks that loaded while inactive
        // have already fired onPeaksReady and won't fire again).
        const peaksByTrackRef = useRef<Map<string, { peaks: Float32Array; duration: number }>>(new Map());
        const onPeaksReadyRef = useRef(onPeaksReady);
        onPeaksReadyRef.current = onPeaksReady;
        const onActiveTrackDurationRef = useRef(onActiveTrackDuration);
        onActiveTrackDurationRef.current = onActiveTrackDuration;

        // Per-track durations — used to compute global max duration
        const trackDurationsRef = useRef<Map<string, number>>(new Map());
        const [globalDuration, setGlobalDuration] = useState(0);
        const onDurationChangeRef = useRef(onDurationChange);
        onDurationChangeRef.current = onDurationChange;

        // When any track reports its duration, update the map and report max to parent.
        // Also applies any pending seek+play that was deferred because the track wasn't ready.
        const handleTrackDuration = useCallback((trackId: string, duration: number) => {
            trackDurationsRef.current.set(trackId, duration);
            const maxDuration = Math.max(...trackDurationsRef.current.values());
            setGlobalDuration(maxDuration);
            onDurationChangeRef.current?.(maxDuration);

            // Keep cached entry's duration in sync (peaks may or may not be stored yet)
            const existing = peaksByTrackRef.current.get(trackId);
            if (existing) peaksByTrackRef.current.set(trackId, { ...existing, duration });

            // Let the parent know the active track's own duration for the minimap
            if (trackId === activeTrackIdRef.current) {
                onActiveTrackDurationRef.current?.(duration);
            }

            // If we tried to switch to this track before it finished loading, apply now
            const pending = pendingPlayRef.current;
            if (pending && trackId === activeTrackIdRef.current) {
                pendingPlayRef.current = null;
                playerRefs.current.get(trackId)?.seekTo(pending.time);
                if (pending.autoPlay) playerRefs.current.get(trackId)?.play();
            }
        }, []);

        // Expose play/pause/seekTo
        // play/pause → active track only  |  seekTo → all tracks (synced)
        useImperativeHandle(ref, () => ({
            play: () => playerRefs.current.get(activeTrackId)?.play(),
            pause: () => playerRefs.current.get(activeTrackId)?.pause(),
            seekTo: (time: number) => playerRefs.current.forEach(p => p.seekTo(time)),
            getCurrentTime: () => playerRefs.current.get(activeTrackId)?.getCurrentTime() ?? 0,
            getDuration: () => {
                const vals = trackDurationsRef.current.values();
                const max = Math.max(0, ...vals);
                return max > 0 ? max : playerRefs.current.get(activeTrackId)?.getDuration() ?? 0;
            },
            get isPlaying() {
                return playerRefs.current.get(activeTrackId)?.isPlaying ?? false;
            },
        }));

        // When the active track changes: pause old, sync new to current time, resume if was playing.
        // If the new track hasn't loaded yet (duration = 0), defer seek+play to handleTrackDuration.
        const prevActiveRef = useRef(activeTrackId);
        useEffect(() => {
            const prevId = prevActiveRef.current;
            if (prevId === activeTrackId) return;

            const prev = playerRefs.current.get(prevId);
            const next = playerRefs.current.get(activeTrackId);
            const wasPlaying = prev?.isPlaying ?? false;
            // Use clicked position if the switch came from a waveform click, otherwise sync position
            const currentT = pendingSeekRef.current ?? prev?.getCurrentTime() ?? 0;
            pendingSeekRef.current = null;

            // Pause old track
            prev?.pause();

            const nextIsLoaded = (trackDurationsRef.current.get(activeTrackId) ?? 0) > 0;
            if (nextIsLoaded) {
                next?.seekTo(currentT);
                if (wasPlaying) next?.play();
            } else {
                // New track still loading — defer so the seek doesn't get clamped to 0
                pendingPlayRef.current = { time: currentT, autoPlay: wasPlaying };
            }

            // Update minimap to show the new active track's waveform
            const cached = peaksByTrackRef.current.get(activeTrackId);
            if (cached) {
                onPeaksReadyRef.current?.(cached.peaks);
                onActiveTrackDurationRef.current?.(cached.duration);
            }

            prevActiveRef.current = activeTrackId;
        }, [activeTrackId]);

        const visibleTracks = tracks.filter(t => !t.hidden);
        const visibleCount  = visibleTracks.length;
        const trackCount    = tracks.length;
        const activeScale   = visibleCount > 1 ? ACTIVE_TRACK_WEIGHT : 1;
        const inactiveScale = visibleCount > 1 ? (1 - ACTIVE_TRACK_WEIGHT) / (visibleCount - 1) : 0;

        // Store ref for a track
        const setPlayerRef = useCallback((trackId: string, handle: AudioPlayerHandle | null) => {
            if (handle) {
                playerRefs.current.set(trackId, handle);
            } else {
                playerRefs.current.delete(trackId);
            }
        }, []);

        return (
            <div className="multi-track-view">
                <AnimatePresence initial={false}>
                    {tracks.map((track, i) => {
                        const isActive = track.id === activeTrackId;

                        return (
                            <motion.div
                                key={track.id}
                                className="multi-track-row"
                                initial={{ flex: 0, opacity: 0 }}
                                animate={track.hidden
                                    ? { flex: 0, opacity: 0 }
                                    : { flex: isActive ? activeScale : inactiveScale, opacity: 1 }}
                                exit={{ flex: 0, opacity: 0 }}
                                transition={isResizing ? INSTANT : SPRING}
                                style={{
                                    willChange: "flex, opacity",
                                    cursor: isActive || track.hidden ? undefined : "pointer",
                                    pointerEvents: track.hidden ? "none" : undefined,
                                    overflow: "hidden",
                                }}
                                onClick={isActive || track.hidden ? undefined : () => onActiveTrackChange?.(track.id)}
                            >
                                <AudioPlayer
                                    ref={(handle) => setPlayerRef(track.id, handle)}
                                    audioUrl={track.audioUrl}
                                    initialPeaks={track.initialPeaks}
                                    initialDuration={track.initialDuration}
                                    peaksUrl={track.peaksUrl}
                                    heightScale={1}
                                    globalDuration={globalDuration}
                                    trackLabel={track.label}
                                    isActiveTrack={isActive}
                                    onSelectTrack={() => onActiveTrackChange?.(track.id)}
                                    onDeleteTrack={tracks.length > 1 ? () => onDeleteTrack?.(track.id) : undefined}
                                    pxPerSec={pxPerSec}
                                    scrollLeft={scrollLeft}
                                    currentTime={currentTime}
                                    comments={isActive ? track.comments : EMPTY_COMMENTS}
                                    activeCommentIds={isActive ? activeCommentIds : EMPTY_SET}
                                    highlightedCommentId={isActive ? highlightedCommentId : null}
                                    selectedRange={isActive ? selectedRange : null}
                                    hoveredEdge={isActive ? hoveredEdge : null}
                                    loopRange={isActive ? loopRange : null}
                                    onLoopRangeChange={isActive ? onLoopRangeChange : undefined}
                                    onSeek={isActive ? onSeek : (time) => { pendingSeekRef.current = time; }}
                                    onRangeSelect={isActive ? onRangeSelect : undefined}
                                    onClearRange={isActive ? onClearRange : undefined}
                                    onCommentCmdClick={isActive ? onCommentCmdClick : undefined}
                                    onCommentRangeChange={isActive ? onCommentRangeChange : undefined}
                                    onCommentRangeChangeCommit={isActive ? onCommentRangeChangeCommit : undefined}
                                    onCommentFocus={isActive ? onCommentFocus : undefined}
                                    onWaveformContextMenu={isActive ? onWaveformContextMenu : undefined}
                                    onTimeUpdate={isActive ? onTimeUpdate : undefined}
                                    onPlayStateChange={isActive ? onPlayStateChange : undefined}
                                    onDurationChange={(d) => handleTrackDuration(track.id, d)}
                                    onPeaksReady={(p) => {
                                        const dur = trackDurationsRef.current.get(track.id) ?? 0;
                                        peaksByTrackRef.current.set(track.id, { peaks: p, duration: dur });
                                        if (isActive) {
                                            onPeaksReadyRef.current?.(p);
                                            onActiveTrackDurationRef.current?.(dur);
                                        }
                                    }}
                                />
                                {/* Separator between visible tracks only */}
                                {!track.hidden && i < trackCount - 1 && tracks.slice(i + 1).some(t => !t.hidden) && (
                                    <div className="multi-track-separator" />
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        );
    }
);

export default MultiTrackView;
