"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useMusicWS } from "../contexts/MusicWSContext";
import { isVideoBackgroundEnabled, getApiUrl } from "../utils/apiUrl";
import styles from "./YouTubeBackground.module.css";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * Extracts YouTube Video ID from various YouTube URL formats
 */
export const extractYouTubeVideoId = (url?: string | null): string | null => {
  if (!url) return null;
  
  // Standard watch URLs (youtube.com/watch?v=ID or music.youtube.com/watch?v=ID)
  const watchMatch = url.match(/(?:youtube\.com\/(?:watch\?.*v=|v\/|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([\w-]{11})/i);
  if (watchMatch && watchMatch[1]) {
    return watchMatch[1];
  }

  // Pure 11 character ID check
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }

  return null;
};

export const YouTubeBackground: React.FC = () => {
  const { statistics } = useMusicWS();
  const [bgEnabled, setBgEnabled] = useState<boolean>(true);
  const [apiReady, setApiReady] = useState<boolean>(false);
  const [isYTPlayerReady, setIsYTPlayerReady] = useState<boolean>(false);
  const [streamFailed, setStreamFailed] = useState<boolean>(false);
  const [backendUrlVer, setBackendUrlVer] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTrackUrlRef = useRef<string | null>(null);

  const currentTrackUrl = statistics?.track?.url;
  const isPaused = statistics?.paused ?? true;
  const timestampMs = statistics?.timestamp ?? 0;
  
  const videoId = useMemo(() => {
    return extractYouTubeVideoId(currentTrackUrl);
  }, [currentTrackUrl]);

  // Construct stream URL from API_URL/proxy/stream?url=${video_url}
  const streamUrl = useMemo(() => {
    if (!currentTrackUrl) return "";
    return getApiUrl("", `proxy/stream?url=${encodeURIComponent(currentTrackUrl)}`);
  }, [currentTrackUrl, backendUrlVer]);

  // Read video background preference & listen for changes
  useEffect(() => {
    setBgEnabled(isVideoBackgroundEnabled());

    const handleBgChange = (e: any) => {
      if (typeof e.detail?.enabled === "boolean") {
        setBgEnabled(e.detail.enabled);
      } else {
        setBgEnabled(isVideoBackgroundEnabled());
      }
    };

    const handleBackendChange = () => {
      setBackendUrlVer((v) => v + 1);
    };

    window.addEventListener("video-bg-changed", handleBgChange);
    window.addEventListener("backend-url-changed", handleBackendChange);
    return () => {
      window.removeEventListener("video-bg-changed", handleBgChange);
      window.removeEventListener("backend-url-changed", handleBackendChange);
    };
  }, []);

  // Reset stream error when track changes
  useEffect(() => {
    if (lastTrackUrlRef.current !== currentTrackUrl) {
      lastTrackUrlRef.current = currentTrackUrl || null;
      setStreamFailed(false);
      setIsYTPlayerReady(false);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {}
        playerRef.current = null;
      }
    }
  }, [currentTrackUrl]);

  // Load YouTube IFrame API script once if fallback needed
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.YT && window.YT.Player) {
      setApiReady(true);
      return;
    }

    const existingScript = document.getElementById("yt-iframe-api-script");
    if (!existingScript) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      setApiReady(true);
    };
  }, []);

  // -------------------------------------------------------------
  // PRIMARY MODE: Stream Video Tag Sync & Controls
  // -------------------------------------------------------------

  // Sync play/pause for native video stream
  useEffect(() => {
    if (streamFailed || !videoRef.current) return;

    try {
      videoRef.current.muted = true;
      if (isPaused) {
        videoRef.current.pause();
      } else {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Auto-play was prevented
          });
        }
      }
    } catch (e) {
      console.warn("[BackgroundVideo] Video play/pause sync error:", e);
    }
  }, [isPaused, streamFailed, streamUrl]);

  // Sync timestamp/duration position for native video stream
  useEffect(() => {
    if (streamFailed || !videoRef.current) return;

    try {
      const targetSec = timestampMs / 1000;
      const currentSec = videoRef.current.currentTime || 0;
      // Re-sync if playback drifts by more than 1.5s
      if (Math.abs(currentSec - targetSec) > 1.5 && targetSec >= 0) {
        videoRef.current.currentTime = targetSec;
      }
    } catch (e) {}
  }, [timestampMs, streamFailed]);

  // Handle stream video loaded metadata
  const handleVideoLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    try {
      videoRef.current.muted = true;
      const targetSec = timestampMs / 1000;
      if (targetSec > 0) {
        videoRef.current.currentTime = targetSec;
      }
      if (!isPaused) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    } catch (e) {}
  }, [timestampMs, isPaused]);

  // Handle video playback errors -> switch to YouTube iframe fallback
  const handleStreamError = useCallback(() => {
    console.warn("[BackgroundVideo] Proxy stream unavailable/failed for track. Falling back to YouTube iframe player.");
    setStreamFailed(true);
  }, []);

  // -------------------------------------------------------------
  // FALLBACK MODE: YouTube Iframe API Player
  // -------------------------------------------------------------
  useEffect(() => {
    // Only instantiate YouTube iframe player if stream failed or explicitly in fallback mode
    if (!streamFailed || !apiReady || !videoId || !bgEnabled) {
      if (playerRef.current && (!streamFailed || !videoId || !bgEnabled)) {
        try {
          playerRef.current.destroy();
        } catch (e) {}
        playerRef.current = null;
        setIsYTPlayerReady(false);
      }
      return;
    }

    const targetDivId = "yt-bg-player-node";
    let node = document.getElementById(targetDivId);
    if (!node && containerRef.current) {
      node = document.createElement("div");
      node.id = targetDivId;
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(node);
    }

    try {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {}
      }

      playerRef.current = new window.YT.Player(targetDivId, {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          showinfo: 0,
          autohide: 1,
          mute: 1,
          playsinline: 1,
          loop: 1,
          playlist: videoId,
          cc_load_policy: 0,
          cc_lang_pref: "none",
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: (event: any) => {
            try {
              event.target.mute();
              // Explicitly disable captions/subtitles
              if (typeof event.target.unloadModule === "function") {
                event.target.unloadModule("captions");
                event.target.unloadModule("cc");
              }
              if (typeof event.target.setOption === "function") {
                event.target.setOption("captions", "track", {});
              }
              if (!isPaused) {
                event.target.playVideo();
              } else {
                event.target.pauseVideo();
              }
              const startSec = Math.floor(timestampMs / 1000);
              if (startSec > 0) {
                event.target.seekTo(startSec, true);
              }
            } catch (e) {}
            setIsYTPlayerReady(true);
          },
          onStateChange: (event: any) => {
            try {
              if (typeof event.target.unloadModule === "function") {
                event.target.unloadModule("captions");
                event.target.unloadModule("cc");
              }
            } catch (e) {}
            if (event.data === window.YT.PlayerState.ENDED) {
              try {
                event.target.playVideo();
              } catch (e) {}
            }
          },
        },
      });
    } catch (err) {
      console.warn("[YouTubeBackground] Error instantiating fallback player:", err);
    }
  }, [streamFailed, apiReady, videoId, bgEnabled, isPaused, timestampMs]);

  // Synchronize playback state (Play / Pause) for YT Player
  useEffect(() => {
    if (!streamFailed || !playerRef.current || !isYTPlayerReady) return;

    try {
      playerRef.current.mute();
      if (isPaused) {
        playerRef.current.pauseVideo();
      } else {
        playerRef.current.playVideo();
      }
    } catch (e) {
      console.warn("[YouTubeBackground] Sync pause/play error:", e);
    }
  }, [streamFailed, isPaused, isYTPlayerReady]);

  // Synchronize playback position (Timestamp / Seek) for YT Player
  useEffect(() => {
    if (!streamFailed || !playerRef.current || !isYTPlayerReady) return;

    try {
      const targetSec = Math.floor(timestampMs / 1000);
      const currentSec = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
      if (Math.abs(currentSec - targetSec) > 1.8) {
        playerRef.current.seekTo(targetSec, true);
      }
    } catch (e) {}
  }, [streamFailed, timestampMs, isYTPlayerReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {}
      }
    };
  }, []);

  const hasMedia = !!currentTrackUrl;
  const showVideo = bgEnabled && hasMedia && (!streamFailed || !!videoId);

  // Toggle global class to hide ambient gradients when video is active
  useEffect(() => {
    if (typeof document !== "undefined") {
      if (showVideo) {
        document.body.classList.add("has-video-bg");
      } else {
        document.body.classList.remove("has-video-bg");
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove("has-video-bg");
      }
    };
  }, [showVideo]);

  return (
    <div className={styles.videoBackgroundContainer} aria-hidden="true">
      {/* Background Video Wrapper (holds either native stream video or YT fallback iframe) */}
      <div 
        className={styles.videoWrapper} 
        style={{ opacity: showVideo ? 1 : 0 }}
      >
        {!streamFailed && streamUrl ? (
          <video
            ref={videoRef}
            key={streamUrl}
            src={streamUrl}
            muted
            playsInline
            autoPlay
            loop
            controls={false}
            disablePictureInPicture
            className={styles.videoElement}
            onLoadedMetadata={handleVideoLoadedMetadata}
            onError={handleStreamError}
          />
        ) : (
          <div ref={containerRef} className={styles.iframeElement} />
        )}
      </div>

      {/* Subtle Liquid Glass Frosted Vignette Overlay */}
      <div className={styles.liquidGlassOverlay} />
      <div className={styles.specularSheen} />

      {/* Fallback ambient gradient if video is disabled or not available */}
      <div 
        className={styles.fallbackAmbience} 
        style={{ opacity: showVideo ? 0 : 1 }} 
      />
    </div>
  );
};

export default YouTubeBackground;
