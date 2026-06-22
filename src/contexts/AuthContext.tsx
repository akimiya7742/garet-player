"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";

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
  login: () => void;
  logout: () => void;
  setAuthToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Biến global để giữ token trong bộ nhớ (Memory Storage) phòng khi localStorage bị block trong iframe
let memoryToken: string | null = null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActivity, setIsActivity] = useState(false);
  
  // Dùng ref để tránh việc useEffect trigger loop hoặc gọi song song nhiều lần
  const isAuthenticating = useRef(false);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "";

  // Helper an toàn để tương tác với localStorage trong iframe
  const safeGetToken = (): string | null => {
    try {
      return localStorage.getItem("discord_music_token") || memoryToken;
    } catch (e) {
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
    } catch (e) {
      console.warn("[Auth] LocalStorage restricted, using memory storage instead.");
    }
  };

  const fetchUserProfile = async (jwtToken: string) => {
    try {
      const res = await fetch(`${backendUrl}/user/me`, {
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
      } else {
        clearAuth();
      }
    } catch (err) {
      console.error("[Auth] Error fetching user profile:", err);
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
    } catch (err) {
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
      const urlParams = new URLSearchParams(window.location.search);
      // Check chuẩn bài theo tài liệu Discord
      const isDiscordActivity = urlParams.has("frame_id") || window.location.ancestorOrigins?.contains("https://discord.com");
      setIsActivity(!!isDiscordActivity);

      if (isDiscordActivity) {
        performDiscordActivityAuth();
      } else {
        const storedToken = safeGetToken();
        if (storedToken) {
          fetchUserProfile(storedToken);
        } else {
          setLoading(false);
        }
      }
    }
  }, []);

  const login = () => {
    if (typeof window !== "undefined") {
      if (isActivity) {
        performDiscordActivityAuth();
      } else {
        window.location.href = `${backendUrl}/auth/discord/login`;
      }
    }
  };

  const logout = () => {
    clearAuth();
    if (typeof window !== "undefined" && !isActivity) {
      window.location.href = "/";
    }
  };

  const setAuthToken = (newToken: string) => {
    setToken(newToken);
    safeSetToken(newToken);
    setLoading(true);
    fetchUserProfile(newToken);
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
        login,
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