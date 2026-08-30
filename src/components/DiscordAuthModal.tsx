"use client";

import React, { useState, useEffect } from "react";
import { 
  X, 
  Loader2, 
  ExternalLink, 
  KeyRound, 
  Clipboard, 
  AlertCircle, 
  LogIn,
  CheckCircle2
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import styles from "./DiscordAuthModal.module.css";

interface DiscordAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiscordAuthModal: React.FC<DiscordAuthModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { setAuthToken, authError, setAuthError, reopenPopup } = useAuth();
  const [manualToken, setManualToken] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAuthError(null);
      setManualToken("");
      setIsVerifying(false);
    }
  }, [isOpen, setAuthError]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          // If the text is a URL with ?token=... or code=... extract the token parameter
          let cleanToken = text.trim();
          try {
            if (cleanToken.includes("http://") || cleanToken.includes("https://") || cleanToken.includes("?token=")) {
              const urlObj = new URL(cleanToken);
              const tokenParam = urlObj.searchParams.get("token") || urlObj.searchParams.get("jwt");
              if (tokenParam) cleanToken = tokenParam;
            }
          } catch {}
          setManualToken(cleanToken);
          setCopiedSuccess(true);
          setTimeout(() => setCopiedSuccess(false), 2000);
        }
      }
    } catch (err) {
      console.warn("Could not read clipboard:", err);
    }
  };

  const handleManualSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const tokenToSubmit = manualToken.trim();
    if (!tokenToSubmit) {
      setAuthError("Please enter or paste your session/JWT token.");
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      // Clean possible url wrappers or prefix "Bearer "
      let clean = tokenToSubmit;
      if (clean.toLowerCase().startsWith("bearer ")) {
        clean = clean.substring(7).trim();
      }
      try {
        if (clean.includes("?token=") || clean.includes("http")) {
          const url = new URL(clean);
          const t = url.searchParams.get("token") || url.searchParams.get("jwt");
          if (t) clean = t;
        }
      } catch {}

      await setAuthToken(clean);
      // If validation succeeds, AuthContext will set user & close modal via page state
    } catch (err: any) {
      setAuthError(err.message || "Failed to validate session token.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <div className={styles.discordIconWrapper}>
              <LogIn style={{ width: "20px", height: "20px" }} />
            </div>
            <div>
              <h2 className={styles.headerTitle}>Connecting to Discord</h2>
              <p className={styles.headerSubtitle}>Authorize your bot music session</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className={styles.closeBtn}
            title="Close modal"
            aria-label="Close"
          >
            <X style={{ width: "18px", height: "18px" }} />
          </button>
        </div>

        {/* Modal Content */}
        <div className={styles.content}>
          {/* Status Card: Waiting for popup */}
          <div className={styles.statusCard}>
            <div className={styles.statusMain}>
              <div className={styles.pulseRing}>
                <Loader2 className={styles.spinLoader} />
              </div>
              <div className={styles.statusTexts}>
                <div className={styles.statusHeading}>Waiting for Discord authorization...</div>
                <div className={styles.statusDesc}>
                  A popup window has been opened to sign into Discord. Once approved, this dashboard will automatically sync.
                </div>
              </div>
            </div>

            <div className={styles.reopenAction}>
              <button
                type="button"
                onClick={reopenPopup}
                className={styles.reopenBtn}
                title="Reopen Discord authorization window"
              >
                <ExternalLink style={{ width: "13px", height: "13px" }} />
                <span>Reopen Login Popup</span>
              </button>
            </div>
          </div>

          {/* OR Divider */}
          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerText}>or enter session token manually</span>
            <div className={styles.dividerLine} />
          </div>

          {/* Manual Session Token Input Form */}
          <form onSubmit={handleManualSubmit} className={styles.tokenSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <KeyRound className={styles.sectionTitleIcon} />
                <span>Session / JWT Token</span>
              </div>
            </div>

            <p className={styles.tokenInstructions}>
              If the backend does not redirect back automatically (e.g. cross-origin or tunnel connection), copy the token from the popup window and paste it here:
            </p>

            <div className={styles.inputWrapper}>
              <textarea
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste your token here (e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)"
                className={styles.tokenInput}
                rows={3}
                disabled={isVerifying}
                spellCheck={false}
              />
              <div className={styles.inputBar}>
                <span className={styles.tokenLengthInfo}>
                  {manualToken.length > 0 ? `${manualToken.length} characters` : ""}
                </span>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className={styles.pasteBtn}
                  title="Paste from clipboard"
                >
                  {copiedSuccess ? (
                    <>
                      <CheckCircle2 style={{ width: "12px", height: "12px", color: "var(--accent-success)" }} />
                      <span>Pasted!</span>
                    </>
                  ) : (
                    <>
                      <Clipboard style={{ width: "12px", height: "12px" }} />
                      <span>Paste Token</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error message alert */}
            {authError && (
              <div className={styles.errorBanner}>
                <AlertCircle className={styles.errorIcon} />
                <div>{authError}</div>
              </div>
            )}

            {/* Modal Actions */}
            <div className={styles.actions}>
              <button
                type="button"
                onClick={onClose}
                className={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!manualToken.trim() || isVerifying}
                className={styles.submitBtn}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className={styles.spinLoader} style={{ width: "16px", height: "16px" }} />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <KeyRound style={{ width: "16px", height: "16px" }} />
                    <span>Authenticate Token</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DiscordAuthModal;
