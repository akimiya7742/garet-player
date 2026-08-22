"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { Loader2, ShieldCheck } from "lucide-react";

function LoginSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuthToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      // Store token safely
      try {
        localStorage.setItem("discord_music_token", token);
      } catch (e) {
        console.warn("[LoginSuccess] localStorage access warning:", e);
      }

      setAuthToken(token);

      // If opened as a popup from parent iframe / window
      if (typeof window !== "undefined" && window.opener) {
        try {
          window.opener.postMessage(
            { type: "DISCORD_AUTH_SUCCESS", token },
            "*"
          );
        } catch (err) {
          console.error("[LoginSuccess] Failed to send postMessage to opener:", err);
        }

        // Auto close the popup after brief confirmation
        const closeTimer = setTimeout(() => {
          window.close();
        }, 800);
        return () => clearTimeout(closeTimer);
      } else {
        // Direct navigation redirect
        const timer = setTimeout(() => {
          router.push("/");
        }, 1000);
        return () => clearTimeout(timer);
      }
    } else {
      router.push("/");
    }
  }, [searchParams, setAuthToken, router]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      gap: "20px",
      textAlign: "center",
      padding: "20px"
    }}>
      <div className="glass-panel" style={{
        padding: "40px",
        borderRadius: "var(--border-radius-lg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px",
        maxWidth: "400px"
      }}>
        <ShieldCheck style={{ width: "48px", height: "48px", color: "var(--accent-success)" }} />
        <h2 style={{ fontFamily: "var(--font-title)", fontWeight: 600, fontSize: "1.4rem" }}>
          Authenticated!
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.5" }}>
          Your Discord session has been verified and registered. Opening your music control console now...
        </p>
        <Loader2 style={{ 
          width: "24px", 
          height: "24px", 
          color: "var(--accent-primary)", 
          animation: "spin 1s linear infinite",
          marginTop: "8px" 
        }} />
      </div>
      
      <style jsx global>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function LoginSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh"
      }}>
        <Loader2 style={{ width: "32px", height: "32px", color: "var(--accent-primary)", animation: "spin 1s linear infinite" }} />
      </div>
    }>
      <LoginSuccessContent />
    </Suspense>
  );
}
