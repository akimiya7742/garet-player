"use client";

import React, { createContext, useContext, useEffect, useRef } from "react";
import { useMusicWS } from "./MusicWSContext";

const MediaSessionContext = createContext<null>(null);

// 1-second ultra-lightweight silent WAV file in base64
const SILENT_AUDIO_BASE64 =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

export const MediaSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    statistics,
    voiceConnection,
    togglePlay,
    skipTrack,
    playPrevious,
    seekPosition,
  } = useMusicWS();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userInteractedRef = useRef<boolean>(false);

  // Initialize the silent audio element
  useEffect(() => {
    if (typeof window === "undefined") return;

    const audio = new Audio(SILENT_AUDIO_BASE64);
    audio.loop = true;
    audioRef.current = audio;

    // We pre-load the audio so it is ready
    audio.load();

    const handleUserInteraction = () => {
      if (userInteractedRef.current || !audioRef.current) return;
      
      console.log("[MediaSession] User interaction detected. Initializing silent audio trick...");
      userInteractedRef.current = true;
      
      // Attempt to play and immediately pause if the player is currently paused,
      // or keep playing if a track is active.
      audioRef.current.play()
        .then(() => {
          console.log("[MediaSession] Silent audio successfully started playing.");
          if (!statistics?.track || statistics.paused) {
            audioRef.current?.pause();
          }
        })
        .catch((err) => {
          console.warn("[MediaSession] Silent audio play blocked or failed:", err);
          userInteractedRef.current = false; // retry on next click
        });
    };

    // Listen to standard clicks or key events to trigger silent audio play
    window.addEventListener("click", handleUserInteraction, { capture: true });
    window.addEventListener("touchstart", handleUserInteraction, { capture: true });
    window.addEventListener("keydown", handleUserInteraction, { capture: true });

    return () => {
      window.removeEventListener("click", handleUserInteraction);
      window.removeEventListener("touchstart", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [statistics]);

  // Sync state between statistics and native Media Session API
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator) || !statistics) return;

    const audio = audioRef.current;
    const isPlaying = statistics.track && !statistics.paused;

    // 1. Play/Pause the local silent audio tag in lockstep with the bot player
    if (audio && userInteractedRef.current) {
      if (isPlaying) {
        if (audio.paused) {
          audio.play().catch((e) => console.warn("[MediaSession] Audio play failed:", e));
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }
    }

    // 2. Feed the actual track metadata to the OS Media Controller
    if (statistics.track) {
      const { title, author, thumbnail } = statistics.track;
      const albumTitle = voiceConnection
        ? `${voiceConnection.guild.name} • ${voiceConnection.channel.name}`
        : "Discord Music Connection";

      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: title || "Unknown Track",
        artist: author || "Discord Bot Player",
        album: albumTitle,
        artwork: [
          { src: thumbnail || "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=256", sizes: "256x256", type: "image/jpeg" },
          { src: thumbnail || "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=512", sizes: "512x512", type: "image/jpeg" },
        ],
      });

      navigator.mediaSession.playbackState = statistics.paused ? "paused" : "playing";

      // 3. Set the timeline position state for OS scrubbers (convert milliseconds to real seconds)
      if ("setPositionState" in navigator.mediaSession) {
        try {
          const durationInSeconds = (statistics.track.duration || 0) / 1000;
          const positionInSeconds = (statistics.timestamp || 0) / 1000;

          if (durationInSeconds > 0) {
            const clampedPos = Math.max(0, Math.min(positionInSeconds, durationInSeconds));
            navigator.mediaSession.setPositionState({
              duration: durationInSeconds,
              playbackRate: statistics.paused ? 0 : 1,
              position: clampedPos,
            });
            console.log(`[MediaSession] Synced OS Scrubber: duration=${durationInSeconds}s, position=${clampedPos}s`);
          }
        } catch (err) {
          console.warn("[MediaSession] Failed to set timeline position state:", err);
        }
      }
    } else {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
  }, [statistics, voiceConnection]);

  // Hook up external OS-level actions to WebSocket triggers
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        console.log("[MediaSession] OS trigger: Play");
        togglePlay();
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        console.log("[MediaSession] OS trigger: Pause");
        togglePlay();
      });

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        console.log("[MediaSession] OS trigger: Previous Track");
        playPrevious();
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        console.log("[MediaSession] OS trigger: Next Track");
        skipTrack();
      });

      // Enable seeking from media bar if supported
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        console.log("[MediaSession] OS trigger: Seek To", details);
        if (details.seekTime !== undefined) {
          // Convert seconds to milliseconds
          seekPosition(details.seekTime * 1000);
        }
      });
    } catch (err) {
      console.warn("[MediaSession] Action handlers failed to register:", err);
    }

    return () => {
      if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
      const actions: MediaSessionAction[] = ["play", "pause", "previoustrack", "nexttrack", "seekto"];
      actions.forEach((action) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch (e) {}
      });
    };
  }, [togglePlay, skipTrack, playPrevious, seekPosition]);

  return <MediaSessionContext.Provider value={null}>{children}</MediaSessionContext.Provider>;
};

export const useMediaSession = () => useContext(MediaSessionContext);
