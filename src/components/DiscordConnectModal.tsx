"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardPaste, ExternalLink, Loader2, ShieldCheck, X } from "lucide-react";
import styles from "./DiscordConnectModal.module.css";

interface DiscordConnectModalProps {
  isOpen: boolean;
  isActivity: boolean;
  onClose: () => void;
  onConnect: () => void;
  onPasteToken: (token: string) => Promise<void>;
  error?: string | null;
}

export default function DiscordConnectModal({ isOpen, isActivity, onClose, onConnect, onPasteToken, error }: DiscordConnectModalProps) {
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setToken("");
      setIsSubmitting(false);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 150);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const submitToken = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onPasteToken(trimmed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="discord-connect-title">
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close Discord connection dialog">
          <X size={18} />
        </button>
        <div className={styles.icon}><ShieldCheck size={25} /></div>
        <p className={styles.eyebrow}>SECURE SESSION HANDOFF</p>
        <h2 id="discord-connect-title">Connecting to Discord</h2>
        <p className={styles.description}>
          {isActivity ? "Authorize this Activity to sync your Discord profile and music session." : "Authorize in Discord, then return here to start your synchronized music session."}
        </p>

        <button type="button" onClick={onConnect} className={`${styles.primaryButton} glass-btn glass-btn-primary`}>
          <ExternalLink size={17} />
          {isActivity ? "Authorize Activity" : "Continue with Discord"}
        </button>

        {!isActivity && (
          <>
            <div className={styles.divider}><span>or paste a session token</span></div>
            <form onSubmit={submitToken} className={styles.form}>
              <label htmlFor="discord-session-token">Session token</label>
              <div className={styles.inputRow}>
                <ClipboardPaste size={17} aria-hidden="true" />
                <input ref={inputRef} id="discord-session-token" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token here" type="password" autoComplete="off" spellCheck={false} />
                <button type="submit" disabled={!token.trim() || isSubmitting} aria-label="Verify pasted token">
                  {isSubmitting ? <Loader2 className={styles.spinner} size={17} /> : <CheckCircle2 size={17} />}
                </button>
              </div>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <p className={styles.securityNote}>Your token is sent only to this app&apos;s backend for verification and is never displayed.</p>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
