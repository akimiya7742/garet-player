"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";

export interface Track {
  title: string;
  url: string;
  duration: number; // in milliseconds
  thumbnail: string;
  author: string;
}

export interface VoiceConnection {
  channel: { id: string; name: string };
  guild: { id: string; name: string };
}

interface MusicWSContextType {
  isConnected: boolean;
  isWSAuthenticated: boolean;
  voiceConnection: VoiceConnection | null;
  statistics: Statistics | null;
  errorMsg: string | null;
  
  // Player control operations
  togglePlay: () => void;
  playTrack: (trackUrl: string) => void;
  skipTrack: () => void;
  playPrevious: () => void;
  setVolume: (vol: number) => void;
  cycleLoop: () => void;
  shuffleQueue: () => void;
  seekPosition: (ms: number) => void;
  toggleLock: () => void;
  toggleAutoPlay: () => void;
  playNextTrack: (trackUrl: string, listIndexPosition: number) => void;
  removeTrack: (listIndexPosition: number) => void;
  getVoiceConnection: () => void;
  joinVoice: () => Promise<boolean>;
}

interface Statistics {
  timestamp: number;
  listeners: number;
  tracks: number;
  volume: number;
  paused: boolean;
  repeatMode: "off" | "track" | "queue";
  autoPlay: boolean;
  lockStatus: boolean;
  track: Track | null;
  queue: Track[];
  related: Track[];
}

const MusicWSContext = createContext<MusicWSContextType | undefined>(undefined);

export const MusicWSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isWSAuthenticated, setIsWSAuthenticated] = useState(false);
  const [voiceConnection, setVoiceConnection] = useState<VoiceConnection | null>(null);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "";
  
  // Convert http/https URL to ws/wss URL
  const getWSUrl = useCallback((httpUrl: string) => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      // Check chuẩn bài theo tài liệu Discord
      const isDiscordActivity = urlParams.has("frame_id") || window.location.ancestorOrigins?.contains("https://discord.com");

      if (isDiscordActivity) {
        return '/api/ws'; // Use relative path for Discord activity
      }
    } else {
        if (!httpUrl) return "";
        let wsUrl = httpUrl.replace(/^http/, "ws");
        // Ensure it ends properly for WS connection
        return wsUrl;
    }
  }, []);

  const sendEvent = useCallback((event: string, data: Record<string, any> = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, ...data }));
    } else {
      console.warn(`[WS] Attempted to send event "${event}" but WebSocket is not open.`);
    }
  }, []);

  const connectWS = useCallback(() => {
    if (!token) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsTarget = getWSUrl(backendUrl);
    if (!wsTarget) {
      setErrorMsg("WebSocket URL is missing or invalid.");
      return;
    }

    console.log(`[WS] Connecting to ${wsTarget}...`);
    const ws = new WebSocket(`${wsTarget}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected successfully.");
      setIsConnected(true);
      setErrorMsg(null);
      // Identify immediately on connection open
      ws.send(JSON.stringify({ event: "identify", token }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.event) {
          case "authenticated":
            console.log("[WS] Authenticated successfully with Discord user:", message.user);
            setIsWSAuthenticated(true);
            // Fetch voice details right away
            ws.send(JSON.stringify({ event: "GetVoice" }));
            break;
            
          case "ReplyVoice":
            console.log("[WS] Active voice session synced:", message.channel, message.guild);
            setVoiceConnection({
              channel: message.channel,
              guild: message.guild
            });
            break;
            
          case "statistics":
            setStatistics({
              timestamp: message.timestamp,
              listeners: message.listeners,
              tracks: message.tracks,
              volume: message.volume,
              paused: message.paused,
              repeatMode: message.repeatMode || "off",
              autoPlay: message.autoPlay || false,
              lockStatus: message.lockStatus || false,
              track: message.track,
              queue: message.queue || [],
              related: message.related || [],
            });
            break;
            
          case "error":
            console.error("[WS] Error message from backend:", message.message);
            setErrorMsg(message.message);
            if (message.message === "Invalid token") {
              setIsWSAuthenticated(false);
            }
            break;
            
          default:
            break;
        }
      } catch (err) {
        console.error("[WS] Failed to parse WebSocket message:", err);
      }
    };

    ws.onclose = (event) => {
      console.log(`[WS] Connection closed. Code: ${event.code}, Reason: ${event.reason}`);
      setIsConnected(false);
      setIsWSAuthenticated(false);
      setVoiceConnection(null);
      setStatistics(null);
      
      // Auto-reconnect after 3 seconds if authenticated
      if (isAuthenticated) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWS();
        }, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error("[WS] Connection error:", err);
      setIsConnected(false);
    };
  }, [backendUrl, getWSUrl, token, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && token) {
      connectWS();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
      }
      setIsConnected(false);
      setIsWSAuthenticated(false);
      setStatistics(null);
      setVoiceConnection(null);
    }

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isAuthenticated, token, connectWS]);

  // Player Controls
  const togglePlay = useCallback(() => sendEvent("pause"), [sendEvent]);
  const playTrack = useCallback((trackUrl: string) => sendEvent("play", { trackUrl }), [sendEvent]);
  const skipTrack = useCallback(() => sendEvent("skip"), [sendEvent]);
  const playPrevious = useCallback(() => sendEvent("back"), [sendEvent]);
  const setVolume = useCallback((volume: number) => sendEvent("volume", { volume }), [sendEvent]);
  const cycleLoop = useCallback(() => sendEvent("loop"), [sendEvent]);
  const shuffleQueue = useCallback(() => sendEvent("shuffle"), [sendEvent]);
  const seekPosition = useCallback((position: number) => sendEvent("seek", { position }), [sendEvent]);
  const toggleLock = useCallback(() => sendEvent("Lock"), [sendEvent]);
  const toggleAutoPlay = useCallback(() => sendEvent("AutoPlay"), [sendEvent]);
  
  // Note: TrackPosition is 1-indexed in backend array deletions and insertions
  const playNextTrack = useCallback((trackUrl: string, listIndexPosition: number) => {
    sendEvent("Playnext", { trackUrl, TrackPosition: listIndexPosition + 1 });
  }, [sendEvent]);

  const removeTrack = useCallback((listIndexPosition: number) => {
    sendEvent("DelTrack", { TrackPosition: listIndexPosition + 1 });
  }, [sendEvent]);

  const getVoiceConnection = useCallback(() => sendEvent("GetVoice"), [sendEvent]);

  const joinVoice = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    setErrorMsg(null);
    try {
      const res = await fetch(`${backendUrl}/music/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "ngrok-skip-browser-warning": "69420",
        },
      });

      if (res.ok) {
        // Voice successfully joined. Request updated voice connection status from WS
        getVoiceConnection();
        return true;
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || data.message || "Failed to automatically join voice channel.");
        return false;
      }
    } catch (err) {
      console.error("[WS/API] Error joining voice:", err);
      setErrorMsg("Network error occurred while trying to join voice.");
      return false;
    }
  }, [backendUrl, token, getVoiceConnection]);

  return (
    <MusicWSContext.Provider
      value={{
        isConnected,
        isWSAuthenticated,
        voiceConnection,
        statistics,
        errorMsg,
        togglePlay,
        playTrack,
        skipTrack,
        playPrevious,
        setVolume,
        cycleLoop,
        shuffleQueue,
        seekPosition,
        toggleLock,
        toggleAutoPlay,
        playNextTrack,
        removeTrack,
        getVoiceConnection,
        joinVoice,
      }}
    >
      {children}
    </MusicWSContext.Provider>
  );
};

export const useMusicWS = () => {
  const context = useContext(MusicWSContext);
  if (context === undefined) {
    throw new Error("useMusicWS must be used within a MusicWSProvider");
  }
  return context;
};
