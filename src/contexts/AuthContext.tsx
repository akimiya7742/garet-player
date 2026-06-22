"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActivity, setIsActivity] = useState(false);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "";

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
      } else {
        // Token might have expired or is invalid
        clearAuth();
      }
    } catch (err) {
      console.error("[Auth] Error fetching user profile:", err);
      // We don't clear session on simple network errors, but we keep checking
    } finally {
      setLoading(false);
    }
  };

  const clearAuth = () => {
    localStorage.removeItem("discord_music_token");
    setToken(null);
    setUser(null);
    setLoading(false);
  };

  const performDiscordActivityAuth = async () => {
    setLoading(true);
    try {
      console.log("[Auth] Initializing Discord Activity Auth...");
      const { DiscordSDK } = await import("@discord/embedded-app-sdk");
      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
      
      if (!clientId) {
        throw new Error("NEXT_PUBLIC_DISCORD_CLIENT_ID is not configured in .env");
      }

      const discordSdk = new DiscordSDK(clientId);
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
      const res = await fetch(`${backendUrl}/auth/token`, {
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
      
      // Store token and load profile details
      localStorage.setItem("discord_music_token", data.token);
      await fetchUserProfile(data.token);
    } catch (err) {
      console.error("[Auth] Discord Activity auth failed:", err);
      // Fallback: see if we have a stored token
      const storedToken = localStorage.getItem("discord_music_token");
      if (storedToken) {
        console.log("[Auth] Falling back to stored localStorage token...");
        await fetchUserProfile(storedToken);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const isDiscordActivity = urlParams.has("frame_id") || urlParams.has("channel_id");
      setIsActivity(isDiscordActivity);

      if (isDiscordActivity) {
        performDiscordActivityAuth();
      } else {
        const storedToken = localStorage.getItem("discord_music_token");
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
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  const setAuthToken = (newToken: string) => {
    localStorage.setItem("discord_music_token", newToken);
    setToken(newToken);
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
