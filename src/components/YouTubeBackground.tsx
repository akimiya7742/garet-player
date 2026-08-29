"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useMusicWS } from "../contexts/MusicWSContext";
import { useAuth } from "../contexts/AuthContext";
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
  const { token } = useAuth();
  const [bgEnabled, setBgEnabled] = useState<boolean>(true);
  const [apiReady, setApiReady] = useState<boolean>(false);
  const [isYTPlayerReady, setIsYTPlayerReady] = useState<boolean>(false);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const [streamFailed, setStreamFailed] = useState<boolean>(false);
  const [streamUrl, setStreamUrl] = useState<string>("");
  const [backendUrlVer, setBackendUrlVer] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentTrackUrl = statistics?.track?.url;
  const isPaused = statistics?.paused ?? true;
  const timestampMs = statistics?.timestamp ?? 0;
  
  const videoId = useMemo(() => {
    return extractYouTubeVideoId(currentTrackUrl);
  }, [currentTrackUrl]);

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

  // -------------------------------------------------------------
  // Fetch stream url from /music/video/url?id= and pass to /proxy/stream
  // -------------------------------------------------------------
  useEffect(() => {
    // Abort previous in-flight fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset video / player readiness on track change
    setIsVideoReady(false);
    setIsYTPlayerReady(false);
    setStreamFailed(false);
    setStreamUrl("");

    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {}
      playerRef.current = null;
    }

    if (!currentTrackUrl || !bgEnabled) {
      return;
    }

    if (!videoId) {
      // Non-YouTube URL: try directly proxying the raw track url
      const fallbackProxyUrl = getApiUrl("", `proxy/stream?url=${encodeURIComponent(currentTrackUrl)}`);
      setStreamUrl(fallbackProxyUrl);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fetchDirectVideoUrl = async () => {
      try {
        const fetchUrl = getApiUrl("", `music/video/url?id=${encodeURIComponent(videoId)}`);
        const headers: Record<string, string> = {
          "ngrok-skip-browser-warning": "69420",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(fetchUrl, {
          headers,
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch video url: ${res.status}`);
        }

        const data = await res.json();
        const rawVideoUrl = data?.video || data?.url;

        if (data?.success && rawVideoUrl) {
          // Pass the direct googlevideo stream url to proxy/stream
          const proxyStreamUrl = getApiUrl("", `proxy/stream?url=${encodeURIComponent(rawVideoUrl)}`);
          setStreamUrl(proxyStreamUrl);
        } else {
          throw new Error("No video url in response");
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.warn("[BackgroundVideo] /music/video/url failed, falling back to YouTube iframe:", err);
        setStreamFailed(true);
      }
    };

    fetchDirectVideoUrl();

    return () => {
      controller.abort();
    };
  }, [currentTrackUrl, videoId, bgEnabled, token, backendUrlVer]);

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

  // Handle stream video can play / ready event: sync position and play only when ready
  const handleVideoCanPlay = useCallback(() => {
    if (!videoRef.current) return;
    try {
      videoRef.current.muted = true;
      const targetSec = timestampMs / 1000;
      if (targetSec > 0 && Math.abs(videoRef.current.currentTime - targetSec) > 0.5) {
        videoRef.current.currentTime = targetSec;
      }
      
      setIsVideoReady(true);

      // Play only if player is not paused, otherwise remain paused
      if (!isPaused) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    } catch {}
  }, [timestampMs, isPaused]);

  // Sync play/pause for native video stream once video is ready
  useEffect(() => {
    if (streamFailed || !videoRef.current || !isVideoReady) return;

    try {
      videoRef.current.muted = true;
      if (isPaused) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      console.warn("[BackgroundVideo] Video play/pause sync error:", e);
    }
  }, [isPaused, streamFailed, isVideoReady]);

  // Sync timestamp/duration position for native video stream once video is ready
  useEffect(() => {
    if (streamFailed || !videoRef.current || !isVideoReady) return;

    try {
      const targetSec = timestampMs / 1000;
      const currentSec = videoRef.current.currentTime || 0;
      // Re-sync if playback drifts by more than 1.5s
      if (Math.abs(currentSec - targetSec) > 1.5 && targetSec >= 0) {
        videoRef.current.currentTime = targetSec;
      }
    } catch {}
  }, [timestampMs, streamFailed, isVideoReady]);

  // Handle video playback errors -> switch to YouTube iframe fallback
  const handleStreamError = useCallback(() => {
    console.warn("[BackgroundVideo] Proxy stream failed or error occurred. Switching to YouTube iframe player.");
    setIsVideoReady(false);
    setStreamFailed(true);
  }, []);

  // -------------------------------------------------------------
  // FALLBACK MODE: YouTube Iframe API Player
  // -------------------------------------------------------------
  useEffect(() => {
    // Only instantiate YouTube iframe player if stream failed and videoId is valid
    if (!streamFailed || !apiReady || !videoId || !bgEnabled) {
      if (playerRef.current && (!streamFailed || !videoId || !bgEnabled)) {
        try {
          playerRef.current.destroy();
        } catch {}
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
        } catch {}
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
              
              const startSec = Math.floor(timestampMs / 1000);
              if (startSec > 0) {
                event.target.seekTo(startSec, true);
              }

              // Only play if not paused
              if (!isPaused) {
                event.target.playVideo();
              } else {
                event.target.pauseVideo();
              }
            } catch {}
            setIsYTPlayerReady(true);
          },
          onStateChange: (event: any) => {
            try {
              if (typeof event.target.unloadModule === "function") {
                event.target.unloadModule("captions");
                event.target.unloadModule("cc");
              }
            } catch {}
            if (event.data === window.YT.PlayerState.ENDED) {
              try {
                event.target.playVideo();
              } catch {}
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
    } catch {}
  }, [streamFailed, timestampMs, isYTPlayerReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
      }
    };
  }, []);

  const hasMedia = !!currentTrackUrl;
  const isCurrentlyReady = (!streamFailed && isVideoReady) || (streamFailed && isYTPlayerReady);
  const showVideo = bgEnabled && hasMedia && isCurrentlyReady;

  // Toggle global class to hide ambient background gradients when video is active
  useEffect(() => {
    if (typeof document !== "undefined") {
      if (bgEnabled && hasMedia) {
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
  }, [bgEnabled, hasMedia]);

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
            autoPlay={false}
            loop
            controls={false}
            disablePictureInPicture
            className={styles.videoElement}
            onCanPlay={handleVideoCanPlay}
            onLoadedData={handleVideoCanPlay}
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
