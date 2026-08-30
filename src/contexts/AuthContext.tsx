"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { getApiUrl, isDiscordActivity } from "../utils/apiUrl";

interface UserProfile {
  id: string;
  username: string;
  avatar: string | null;
  level: number;
  coin: number;
  xp: number;
}

interface AuthContextType {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  isActivity: boolean;
  isConnectingDiscord: boolean;
  setIsConnectingDiscord: (open: boolean) => void;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  login: () => void;
  reopenPopup: () => void;
  logout: () => void;
  setAuthToken: (token: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Biến global để giữ token trong bộ nhớ (Memory Storage) phòng khi localStorage bị block trong iframe
let memoryToken: string | null = null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActivity, setIsActivity] = useState(false);
  const [isConnectingDiscord, setIsConnectingDiscord] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Dùng ref để tránh việc useEffect trigger loop hoặc gọi song song nhiều lần
  const isAuthenticating = useRef(false);
  const popupRef = useRef<Window | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "";

  // Helper an toàn để tương tác với localStorage trong iframe
  const safeGetToken = (): string | null => {
    try {
      return localStorage.getItem("discord_music_token") || memoryToken;
    } catch {
      return memoryToken;
    }
  };

  const safeSetToken = (newToken: string | null) => {
    memoryToken = newToken;
    try {
      if (newToken) {
        localStorage.setItem("discord_music_token", newToken);
      } else {
        localStorage.removeItem("discord_music_token");
      }
    } catch {
      console.warn("[Auth] LocalStorage restricted, using memory storage instead.");
    }
  };

  const fetchUserProfile = async (jwtToken: string): Promise<boolean> => {
    try {
      const url = getApiUrl(backendUrl, "user/me");
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "ngrok-skip-browser-warning": "69420",
        },
      });

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setToken(jwtToken);
        safeSetToken(jwtToken);
        setAuthError(null);
        setIsConnectingDiscord(false);
        return true;
      } else {
        let errMessage = `Authentication failed (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          if (errData && (errData.message || errData.error)) {
            errMessage = errData.message || errData.error;
          }
        } catch {}
        setAuthError(errMessage);
        clearAuth();
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect to backend server";
      console.error("[Auth] Error fetching user profile:", err);
      setAuthError(msg);
      clearAuth();
      return false;
    } finally {
      setLoading(false);
    }
  };

  const clearAuth = () => {
    safeSetToken(null);
    setToken(null);
    setUser(null);
    setLoading(false);
  };

  const performDiscordActivityAuth = async () => {
    if (isAuthenticating.current) return;
    isAuthenticating.current = true;
    setLoading(true);

    try {
      console.log("[Auth] Initializing Discord Activity Auth...");
      const { DiscordSDK } = await import("@discord/embedded-app-sdk");
      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
      
      if (!clientId) {
        throw new Error("NEXT_PUBLIC_DISCORD_CLIENT_ID is not configured in .env");
      }

      const discordSdk = new DiscordSDK(clientId);
      // Wait for SDK setup to complete
      await discordSdk.ready();

      console.log("[Auth] Discord SDK ready, authorizing...");
      const auth = await discordSdk.commands.authorize({
        client_id: clientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds"],
      });

      if (!auth.code) {
        throw new Error("No authorization code returned from Discord");
      }

      console.log("[Auth] Exchanging code for JWT token...");
      const res = await fetch(`/aauth/auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "69420",
        },
        body: JSON.stringify({ code: auth.code }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Token exchange failed: ${errText}`);
      }

      const data = await res.json();
      console.log("[Auth] Token exchange succeeded for:", data.user?.username);
      
      await fetchUserProfile(data.token);
    } catch (err: unknown) {
      console.error("[Auth] Discord Activity auth failed:", err);
      // Fallback
      const storedToken = safeGetToken();
      if (storedToken) {
        console.log("[Auth] Falling back to stored token...");
        await fetchUserProfile(storedToken);
      } else {
        setLoading(false);
      }
    } finally {
      isAuthenticating.current = false;
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isActivity = isDiscordActivity();
      setIsActivity(!!isActivity);

      // Listen for authentication tokens sent from popup login window
      const handleAuthMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === "DISCORD_AUTH_SUCCESS" && event.data.token) {
          console.log("[Auth] Successfully received token via popup message event.");
          setAuthToken(event.data.token);
        }
      };
      window.addEventListener("message", handleAuthMessage);

      if (isActivity) {
        performDiscordActivityAuth();
      } else {
        const storedToken = safeGetToken();
        if (storedToken) {
          fetchUserProfile(storedToken);
        } else {
          setLoading(false);
        }
      }

      return () => {
        window.removeEventListener("message", handleAuthMessage);
      };
    }
  }, []);

  const openAuthPopup = () => {
    const url = getApiUrl(backendUrl, "auth/discord/login");
    const width = 540;
    const height = 820;
    const left = typeof window.screenX !== "undefined" ? window.screenX + Math.max(0, (window.outerWidth - width) / 2) : 100;
    const top = typeof window.screenY !== "undefined" ? window.screenY + Math.max(0, (window.outerHeight - height) / 2) : 100;
    
    try {
      const popup = window.open(
        url,
        "discord_auth_popup",
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      popupRef.current = popup;

      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        console.warn("[Auth] Popup blocked by browser, opening in new tab");
        window.open(url, "_blank");
      } else {
        // Monitor popup status and localStorage synchronization
        const pollTimer = setInterval(() => {
          const stored = safeGetToken();
          if (stored && stored !== token) {
            setAuthToken(stored);
            clearInterval(pollTimer);
            if (popup && !popup.closed) popup.close();
          }
          if (popup.closed) {
            clearInterval(pollTimer);
          }
        }, 800);
      }
    } catch (e) {
      console.warn("[Auth] Failed to open popup, falling back to window.open", e);
      window.open(url, "_blank");
    }
  };

  const login = () => {
    if (typeof window !== "undefined") {
      if (isActivity) {
        performDiscordActivityAuth();
      } else {
        setAuthError(null);
        setIsConnectingDiscord(true);
        openAuthPopup();
      }
    }
  };

  const reopenPopup = () => {
    openAuthPopup();
  };

  const logout = () => {
    clearAuth();
    if (typeof window !== "undefined" && !isActivity) {
      window.location.href = "/";
    }
  };

  const setAuthToken = async (newToken: string): Promise<boolean> => {
    setToken(newToken);
    safeSetToken(newToken);
    setLoading(true);
    return await fetchUserProfile(newToken);
  };

  const isAuthenticated = !!token && !!user;

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated,
        loading,
        isActivity,
        isConnectingDiscord,
        setIsConnectingDiscord,
        authError,
        setAuthError,
        login,
        reopenPopup,
        logout,
        setAuthToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};