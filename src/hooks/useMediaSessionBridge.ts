import { useEffect } from 'react';
import type { RefObject } from 'react';
import { PlayerState } from '../types';
import type { SongResult } from '../types';
import { getSongAlbumLabel, getSongArtistLabel, getSongCoverUrl } from '../services/onlineMusic/songMetadata';

// Bridges Folia playback state to the browser Media Session API.
type UseMediaSessionBridgeOptions = {
    audioRef: RefObject<HTMLAudioElement | null>;
    currentSong: SongResult | null;
    cachedCoverUrl: string | null;
    playerState: PlayerState;
    isNowPlayingStageActive: boolean;
    t: (key: string) => string;
    mediaSessionPlayRef: RefObject<() => Promise<void>>;
    mediaSessionPauseRef: RefObject<() => void>;
    mediaSessionPrevRef: RefObject<() => void>;
    mediaSessionNextRef: RefObject<() => Promise<void> | void>;
    isNowPlayingControlDisabledRef: RefObject<boolean>;
};

export const useMediaSessionBridge = ({
    audioRef,
    currentSong,
    cachedCoverUrl,
    playerState,
    isNowPlayingStageActive,
    t,
    mediaSessionPlayRef,
    mediaSessionPauseRef,
    mediaSessionPrevRef,
    mediaSessionNextRef,
    isNowPlayingControlDisabledRef,
}: UseMediaSessionBridgeOptions) => {
    // Push the current playback position/duration to the OS media notification
    // so the lock-screen progress bar advances and seeking stays accurate.
    const updatePositionState = (audio: HTMLAudioElement | null) => {
        if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
            return;
        }
        try {
            navigator.mediaSession.setPositionState({
                duration: audio.duration,
                position: Math.min(audio.currentTime, audio.duration),
                playbackRate: audio.playbackRate || 1,
            });
        } catch (e) {
            console.warn('[MediaSession] Failed to set position state', e);
        }
    };

    useEffect(() => {
        if (!('mediaSession' in navigator)) {
            return;
        }

        const mediaSession = navigator.mediaSession;
        const setActionHandlerSafely = (
            action: MediaSessionAction,
            handler: MediaSessionActionHandler | null
        ) => {
            try {
                mediaSession.setActionHandler(action, handler);
            } catch (e) {
                console.warn(`[MediaSession] Failed to bind ${action} handler`, e);
            }
        };

        setActionHandlerSafely('play', async () => {
            if (isNowPlayingControlDisabledRef.current || !audioRef.current) {
                return;
            }

            try {
                await mediaSessionPlayRef.current();
            } catch (e) {
                console.error('MediaSession play failed', e);
            }
        });
        setActionHandlerSafely('pause', () => {
            if (isNowPlayingControlDisabledRef.current || !audioRef.current) {
                return;
            }

            mediaSessionPauseRef.current();
        });
        setActionHandlerSafely('previoustrack', () => {
            if (isNowPlayingControlDisabledRef.current) {
                return;
            }
            mediaSessionPrevRef.current();
        });
        setActionHandlerSafely('nexttrack', () => {
            if (isNowPlayingControlDisabledRef.current) {
                return;
            }
            void mediaSessionNextRef.current();
        });

        // Seek actions let the OS media notification / lock screen scrub the track.
        const safeSeek = (time: number) => {
            const audio = audioRef.current;
            if (!audio || isNowPlayingControlDisabledRef.current) {
                return;
            }
            const max = Number.isFinite(audio.duration) ? audio.duration : time;
            audio.currentTime = Math.max(0, Math.min(time, max));
            updatePositionState(audio);
        };

        setActionHandlerSafely('seekto', (details) => {
            safeSeek(Number.isFinite(details.seekTime) ? details.seekTime! : 0);
        });
        setActionHandlerSafely('seekforward', (details) => {
            const audio = audioRef.current;
            if (!audio) {
                return;
            }
            safeSeek(audio.currentTime + (Number.isFinite(details.seekOffset) ? details.seekOffset! : 10));
        });
        setActionHandlerSafely('seekbackward', (details) => {
            const audio = audioRef.current;
            if (!audio) {
                return;
            }
            safeSeek(audio.currentTime - (Number.isFinite(details.seekOffset) ? details.seekOffset! : 10));
        });

        return () => {
            setActionHandlerSafely('play', null);
            setActionHandlerSafely('pause', null);
            setActionHandlerSafely('previoustrack', null);
            setActionHandlerSafely('nexttrack', null);
            setActionHandlerSafely('seekto', null);
            setActionHandlerSafely('seekforward', null);
            setActionHandlerSafely('seekbackward', null);
        };
    }, [audioRef, isNowPlayingControlDisabledRef, mediaSessionNextRef, mediaSessionPauseRef, mediaSessionPlayRef, mediaSessionPrevRef]);

    useEffect(() => {
        if (!('mediaSession' in navigator)) {
            return;
        }

        const mediaSession = navigator.mediaSession;

        if (!currentSong) {
            try {
                mediaSession.metadata = null;
            } catch (e) {
                console.warn('[MediaSession] Failed to clear metadata', e);
            }
            return;
        }

        const artistName = getSongArtistLabel(currentSong) || t('ui.unknownArtist');
        const albumName = getSongAlbumLabel(currentSong);
        const cover = cachedCoverUrl || getSongCoverUrl(currentSong) || '';

        try {
            mediaSession.metadata = new MediaMetadata({
                title: currentSong.name,
                artist: artistName,
                album: albumName,
                artwork: cover ? [
                    { src: cover, sizes: '512x512', type: 'image/jpeg' }
                ] : []
            });
        } catch (e) {
            console.warn('[MediaSession] Failed to update metadata', e);
        }
    }, [cachedCoverUrl, currentSong, t]);

    useEffect(() => {
        if (!('mediaSession' in navigator)) {
            return;
        }

        try {
            navigator.mediaSession.playbackState = isNowPlayingStageActive
                ? 'none'
                : currentSong
                    ? (playerState === PlayerState.PLAYING ? 'playing' : 'paused')
                    : 'none';
        } catch (e) {
            console.warn('[MediaSession] Failed to update playback state', e);
        }

        // Keep the lock-screen progress bar in sync with the actual audio position.
        updatePositionState(audioRef.current);
    }, [audioRef, currentSong, isNowPlayingStageActive, playerState]);
};
