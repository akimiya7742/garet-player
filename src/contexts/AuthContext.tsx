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
  login: () => void;
  logout: () => void;
  setAuthToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("discord_music_token");
      if (storedToken) {
        fetchUserProfile(storedToken);
      } else {
        setLoading(false);
      }
    }
  }, []);

  const login = () => {
    if (typeof window !== "undefined") {
      window.location.href = `${backendUrl}/auth/discord/login`;
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
