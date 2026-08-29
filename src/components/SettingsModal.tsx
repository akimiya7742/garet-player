"use client";

import React, { useState, useEffect } from "react";
import { 
  Settings, X, Trash2, Check, 
  Info, Server, CheckCircle2, RotateCcw
} from "lucide-react";
import { 
  getStoredCustomBackendUrl, 
  setStoredCustomBackendUrl, 
  clearStoredCustomBackendUrl,
  getEffectiveBackendUrl,
  isVideoBackgroundEnabled, 
  setVideoBackgroundEnabled 
} from "../utils/apiUrl";
import { clearAllLyricsCache } from "../utils/lyricsCache";
import styles from "./SettingsModal.module.css";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [videoBg, setVideoBg] = useState<boolean>(true);
  const [customBackendUrl, setCustomBackendUrl] = useState<string>("");
  const [hasCustomUrl, setHasCustomUrl] = useState<boolean>(false);
  const [effectiveUrl, setEffectiveUrl] = useState<string>("");
  const [lyricsCleared, setLyricsCleared] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Load preferences when modal opens
  useEffect(() => {
    if (isOpen) {
      setVideoBg(isVideoBackgroundEnabled());
      const stored = getStoredCustomBackendUrl();
      setCustomBackendUrl(stored);
      setHasCustomUrl(!!stored);
      setEffectiveUrl(getEffectiveBackendUrl());
      setLyricsCleared(false);
      setSavedSuccess(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleVideoBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.checked;
    setVideoBg(newVal);
    setVideoBackgroundEnabled(newVal);
  };

  const handleClearLyricsCache = () => {
    clearAllLyricsCache();
    setLyricsCleared(true);
    setTimeout(() => {
      setLyricsCleared(false);
    }, 2500);
  };

  const handleSaveBackendUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customBackendUrl.trim();
    if (trimmed) {
      setStoredCustomBackendUrl(trimmed);
      setHasCustomUrl(true);
    } else {
      clearStoredCustomBackendUrl();
      setHasCustomUrl(false);
    }
    setEffectiveUrl(getEffectiveBackendUrl());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 2500);
  };

  const handleResetBackendUrl = () => {
    clearStoredCustomBackendUrl();
    setCustomBackendUrl("");
    setHasCustomUrl(false);
    setEffectiveUrl(getEffectiveBackendUrl());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 2500);
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <Settings className={styles.titleIcon} />
            <h2 className={styles.title}>Player Settings</h2>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className={styles.closeBtn}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.content}>
          {/* Section: General & Display */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Appearance & Cache</span>
            </div>

            {/* Video Background Toggle */}
            <div className={styles.settingRow}>
              <div className={styles.settingMeta}>
                <span className={styles.settingLabel}>YouTube Video Background</span>
                <span className={styles.settingDesc}>
                  Stream muted, synchronized YouTube video behind the glass dashboard for active tracks.
                </span>
              </div>
              <label className={styles.switch}>
                <input 
                  type="checkbox" 
                  checked={videoBg} 
                  onChange={handleToggleVideoBg}
                  aria-label="Toggle YouTube video background" 
                />
                <span className={styles.slider} />
              </label>
            </div>

            {/* Clear Lyrics Cache */}
            <div className={styles.settingRow}>
              <div className={styles.settingMeta}>
                <span className={styles.settingLabel}>Lyrics & Romanization Cache</span>
                <span className={styles.settingDesc}>
                  Clear locally cached synchronized lyrics, Hiragana, Katakana, and Romaji conversions.
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearLyricsCache}
                className={`${styles.actionBtn} ${styles.clearBtn} ${lyricsCleared ? styles.successBtn : ""}`}
                disabled={lyricsCleared}
              >
                {lyricsCleared ? (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Cache Cleared!</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Clear Cache</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Section: Advanced Settings */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Connection Endpoint</span>
              <span className={styles.advancedBadge}>Advanced</span>
            </div>

            <form onSubmit={handleSaveBackendUrl} className={styles.overrideCard}>
              <div className={styles.inputGroup}>
                <label htmlFor="custom-backend-input" className={styles.inputLabel}>
                  Override Backend URL
                </label>
                <input
                  id="custom-backend-input"
                  type="url"
                  placeholder="e.g. https://your-server.ngrok-free.app"
                  value={customBackendUrl}
                  onChange={(e) => setCustomBackendUrl(e.target.value)}
                  className={styles.urlInput}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Status and Active Source */}
              <div className={styles.statusRow}>
                <span>Active Target: {effectiveUrl ? <code style={{ fontSize: "0.74rem", opacity: 0.85 }}>({effectiveUrl})</code> : null}</span>
                <span 
                  className={`${styles.activeSourceBadge} ${hasCustomUrl ? styles.customBadge : styles.defaultBadge}`}
                >
                  <span className={`${styles.statusDot} ${hasCustomUrl ? styles.customDot : styles.defaultDot}`} />
                  {hasCustomUrl ? "Custom Override" : "Default (.env)"}
                </span>
              </div>

              <div className={styles.overrideNote}>
                <Info className={styles.noteIcon} />
                <span>
                  This setting is only saved locally in your browser (<code>localStorage</code>) and will not modify environment variables or cloud deployments.
                </span>
              </div>

              {/* Action Buttons */}
              <div className={styles.overrideActions}>
                {hasCustomUrl && (
                  <button
                    type="button"
                    onClick={handleResetBackendUrl}
                    className={`${styles.actionBtn} ${styles.resetBtn}`}
                  >
                    <RotateCcw size={14} />
                    <span>Reset to Default</span>
                  </button>
                )}
                
                <button
                  type="submit"
                  className={`${styles.actionBtn} ${styles.saveBtn} ${savedSuccess ? styles.successBtn : ""}`}
                >
                  {savedSuccess ? (
                    <>
                      <Check size={15} />
                      <span>Applied!</span>
                    </>
                  ) : (
                    <>
                      <Server size={15} />
                      <span>Save & Apply</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
