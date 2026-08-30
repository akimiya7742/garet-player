"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useMusicWS } from "../contexts/MusicWSContext";
import PlayerControls from "../components/PlayerControls";
import QueueList from "../components/QueueList";
import SearchPanel from "../components/SearchPanel";
import LyricsPanel from "../components/LyricsPanel";
import RelatedPanel from "../components/RelatedPanel";
import Visualizer from "../components/Visualizer";
import YouTubeBackground from "../components/YouTubeBackground";
import SettingsModal from "../components/SettingsModal";
import DiscordConnectModal from "../components/DiscordConnectModal";
import { 
  LogIn, LogOut, Search, ListMusic, FileText, 
  Coins, Trophy, RefreshCw, AlertTriangle, ShieldCheck, Sparkles,
  Loader2, ExternalLink, Play, Pause, SkipForward, Disc,
  Settings
} from "lucide-react";
import styles from "./page.module.css";

export default function Home() {
  const { user, isAuthenticated, loading, isActivity, isConnectModalOpen, authError, login, beginLogin, closeConnectModal, submitToken, logout, setAuthToken } = useAuth();
  const { 
    isConnected, 
    isWSAuthenticated, 
    voiceConnection, 
    getVoiceConnection, 
    statistics, 
    errorMsg, 
    joinVoice,
    togglePlay,
    skipTrack
  } = useMusicWS();
  
  // Tab states for managing views: on mobile includes "player"
  const [activeTab, setActiveTab] = useState<"player" | "search" | "queue" | "lyrics" | "related">("search");

  // Mobile bottom player expansion drawer state
  const [mobilePlayerExpanded, setMobilePlayerExpanded] = useState(false);

  // Settings modal open state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Local state to track and display active toasts/errors
  const [activeError, setActiveError] = useState<string | null>(null);

  // Local state to track join voice API loading
  const [isJoining, setIsJoining] = useState(false);

  // Detect iframe embedding
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsInIframe(window.self !== window.top && !isActivity);
    }
  }, [isActivity]);

  const handleJoinVoice = async () => {
    setIsJoining(true);
    await joinVoice();
    setIsJoining(false);
  };

  // Intercept the Discord auth callback hash de-opt redirect (/#/login-success)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleHashChange = () => {
        const hash = window.location.hash;
        if (hash && hash.includes("login-success")) {
          const queryPart = hash.split("?")[1];
          if (queryPart) {
            const urlParams = new URLSearchParams(queryPart);
            const token = urlParams.get("token");
            if (token) {
              console.log("[Auth] Token intercepted from hash routing redirect.");
              setAuthToken(token);
              window.location.hash = "";
              if (window.history && window.history.replaceState) {
                window.history.replaceState(null, "", "/");
              }
            }
          }
        }
      };

      handleHashChange();
      window.addEventListener("hashchange", handleHashChange);
      return () => window.removeEventListener("hashchange", handleHashChange);
    }
  }, [setAuthToken]);

  // Listen for WebSocket error messages and display them
  useEffect(() => {
    if (errorMsg) {
      setActiveError(errorMsg);
      const timer = setTimeout(() => {
        setActiveError(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Helper for user avatar (returns discord template or nice fallback)
  const getUserAvatar = () => {
    if (user?.avatar && user?.id) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    }
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || "garret"}`;
  };

  // 1. Loading State
  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className="glass-panel" style={{ padding: "40px", textAlign: "center" }}>
          <div className={styles.pulseSpinner} />
          <h2 style={{ fontFamily: "var(--font-title)", marginTop: "20px" }}>
            {isActivity ? "Authorizing with Discord..." : "Loading Music System..."}
          </h2>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated View (Gorgeous Futuristic Landing Page)
  if (!isAuthenticated || !user) {
    return (
      <main className={styles.landingWrapper}>
        <div className="ambient-glow" />
        
        {/* Floating Decorative Vinyl Elements */}
        <div className={styles.decorVinyl1} />
        <div className={styles.decorVinyl2} />

        <div className={styles.landingHero}>
          <div className={styles.heroBadge}>
            <ShieldCheck style={{ width: "16px", height: "16px", color: "var(--accent-primary)" }} />
            <span>Next-Gen Discord Bot Control</span>
          </div>
          
          <h1 className={styles.heroTitle}>
            Control Your Discord <br />
            <span className="glow-text">Music Stream</span> Seamlessly
          </h1>
          
          <p className={styles.heroSubtitle}>
            A premium, glassmorphism web console dashboard. Stream synced statistics, manage active play queues, view lyrics, and support OS media buttons with active silent audio loop integration.
          </p>

          <div className={styles.actionBlock} style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
            <button 
              type="button"
              onClick={login} 
              className="glass-btn glass-btn-primary"
              style={{ padding: "14px 32px", fontSize: "1.05rem", borderRadius: "30px" }}
            >
              <LogIn style={{ width: "20px", height: "20px" }} />
              {isActivity ? "Authorize Activity" : "Connect with Discord"}
            </button>
            {isInIframe && (
              <button
                type="button"
                onClick={() => window.open(window.location.href, "_blank")}
                className="glass-btn"
                style={{ padding: "14px 24px", fontSize: "0.95rem", borderRadius: "30px" }}
                title="Open app in full window"
              >
                <ExternalLink style={{ width: "18px", height: "18px" }} />
                Open in Full Window
              </button>
            )}
          </div>

          {/* Quick Mock Card Preview */}
          <div className={`${styles.previewCard} glass-panel pulse-glow`}>
            <div className={styles.previewHeader}>
              <div className={styles.previewDot} style={{ backgroundColor: "var(--accent-success)" }} />
              <span>Preview Node Connection • Offline</span>
            </div>
            <div className={styles.previewInfo}>
              <p className={styles.previewTitle}>Waiting for Stream Session</p>
              <p className={styles.previewArtist}>Join voice channel & press play</p>
            </div>
          </div>
        </div>

        {/* Floating Advanced Settings in Bottom Corner */}
        <div className={styles.landingBottomCorner}>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={styles.landingAdvancedBtn}
            title="Configure Backend URL and settings"
          >
            <Settings className={styles.settingsIcon} />
            <span>Advanced settings</span>
          </button>
        </div>

        {/* Settings Modal on Login Screen */}
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
        />
        <DiscordConnectModal
          isOpen={isConnectModalOpen}
          isActivity={isActivity}
          onClose={closeConnectModal}
          onConnect={beginLogin}
          onPasteToken={submitToken}
          error={authError}
        />
      </main>
    );
  }

  const isTrackActive = !!statistics?.track;

  // 3. Authenticated View (Complete Glassmorphic Console Dashboard)
  return (
    <main className={styles.dashboardWrapper}>
      <YouTubeBackground />
      <div className="ambient-glow" />

      <div className="app-container">
        {/* Navigation / Header Area */}
        <header className={`glass-panel ${styles.header}`}>
          {/* User Profile Metrics */}
          <div className={styles.userCard}>
            <img 
              src={getUserAvatar()} 
              alt={user.username} 
              className={styles.userAvatar} 
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${user.username}`;
              }}
            />
            <div className={styles.userInfo}>
              <div className={styles.userMeta}>
                <span className={styles.username}>{user.username}</span>
                <div className={styles.levelBadge}>
                  <Trophy className={styles.statIcon} style={{ color: "var(--accent-warning)" }} />
                  <span>Lvl {user.level}</span>
                </div>
                <div className={styles.coinBadge}>
                  <Coins className={styles.statIcon} style={{ color: "#fbbf24" }} />
                  <span>{user.coin}</span>
                </div>
              </div>
              <div className={styles.xpBarWrapper}>
                <div className={styles.xpBar} style={{ width: `${user.xp % 100}%` }} />
                <span className={styles.xpText}>{user.xp % 100}/100 XP</span>
              </div>
            </div>
          </div>

          {/* Diagnostics WS Connection and Settings badges */}
          <div className={styles.headerControls}>
            <div 
              className={`${styles.connectionBadge} ${isConnected && isWSAuthenticated ? styles.connected : styles.disconnected}`}
              onClick={isConnected ? undefined : getVoiceConnection}
              title={isConnected ? "WebSocket Connection Synced" : "Connection dropped. Click to retry sync."}
            >
              <span className={styles.dot} />
              <span>{isConnected && isWSAuthenticated ? "WS Connected" : "Sync Dropped"}</span>
              {!isConnected && <RefreshCw className={styles.syncIcon} />}
            </div>

            <button 
              type="button"
              onClick={() => setIsSettingsOpen(true)} 
              className={`glass-btn ${styles.settingsBtn}`}
              title="Open player & backend settings"
              aria-label="Settings"
            >
              <Settings className={styles.settingsIcon} />
              <span className={styles.settingsText}>Settings</span>
            </button>

            <button 
              type="button"
              onClick={logout} 
              className={`glass-btn ${styles.logoutBtn}`}
              title="Log out of session"
              aria-label="Logout"
            >
              <LogOut className={styles.logoutIcon} />
              <span className={styles.logoutText}>Logout</span>
            </button>
          </div>
        </header>

        {/* Dashboard Main Console Area */}
        <div className={styles.contentGrid}>
          
          {/* Desktop Left Column: Player Controller Screen */}
          <section className={styles.playerColumn}>
            <PlayerControls />
          </section>

          {/* Dynamic tab sections (Mobile & Desktop) */}
          <section className={styles.actionColumn}>
            {/* Warning when active Voice Connection is missing */}
            {!voiceConnection ? (
              <div className={`glass-panel ${styles.voiceWarning}`}>
                <AlertTriangle className={styles.warningIcon} />
                <h3 className={styles.warningTitle}>Not Connected to Voice</h3>
                <p className={styles.warningText}>
                  Please connect to any voice channel in Discord and query a track with the music bot. The dashboard will automatically sync and unlock playback.
                </p>
                <div className={styles.warningActions}>
                  <button 
                    type="button"
                    onClick={handleJoinVoice}
                    disabled={isJoining}
                    className={`glass-btn ${styles.joinVoiceBtn}`}
                    title="Automatically join voice"
                  >
                    {isJoining ? (
                      <Loader2 className={styles.spinIcon} />
                    ) : (
                      <Sparkles style={{ width: "14px", height: "14px" }} />
                    )}
                    <span>Automatically Join Voice</span>
                    <span className={styles.betaLabel}>Beta</span>
                  </button>

                  <button 
                    type="button"
                    onClick={getVoiceConnection} 
                    className={`glass-btn ${styles.retryVoiceBtn}`}
                    title="Sync voice state"
                  >
                    <RefreshCw style={{ width: "14px", height: "14px" }} />
                    <span>Sync Voice Node</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.tabSection}>
                {/* Custom Glass Tabs Selector */}
                <nav className={`glass-panel ${styles.tabsNav}`} aria-label="Music control panels">
                  <button
                    type="button"
                    onClick={() => setActiveTab("player")}
                    className={`${styles.tabBtn} ${styles.mobileOnlyTab} ${activeTab === "player" ? styles.activeTab : ""}`}
                    aria-selected={activeTab === "player"}
                    role="tab"
                  >
                    <Disc className={styles.tabIcon} />
                    <span>Player</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("search")}
                    className={`${styles.tabBtn} ${activeTab === "search" ? styles.activeTab : ""}`}
                    aria-selected={activeTab === "search"}
                    role="tab"
                  >
                    <Search className={styles.tabIcon} />
                    <span>Search</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("queue")}
                    className={`${styles.tabBtn} ${activeTab === "queue" ? styles.activeTab : ""}`}
                    aria-selected={activeTab === "queue"}
                    role="tab"
                  >
                    <ListMusic className={styles.tabIcon} />
                    <span>Queue</span>
                    {(statistics?.queue?.length ?? 0) > 0 && (
                      <span className={styles.tabBadge}>{statistics!.queue.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("lyrics")}
                    className={`${styles.tabBtn} ${activeTab === "lyrics" ? styles.activeTab : ""}`}
                    aria-selected={activeTab === "lyrics"}
                    role="tab"
                  >
                    <FileText className={styles.tabIcon} />
                    <span>Lyrics</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("related")}
                    className={`${styles.tabBtn} ${activeTab === "related" ? styles.activeTab : ""}`}
                    aria-selected={activeTab === "related"}
                    role="tab"
                  >
                    <Sparkles className={styles.tabIcon} />
                    <span>Related</span>
                    {(statistics?.related?.length ?? 0) > 0 && (
                      <span className={styles.tabBadge}>{statistics!.related.length}</span>
                    )}
                  </button>
                </nav>

                {/* Scoped Tab Content Views */}
                <div className={styles.tabContent}>
                  {activeTab === "player" && (
                    <div className={styles.mobilePlayerWrapper}>
                      <PlayerControls />
                    </div>
                  )}
                  {activeTab === "search" && <SearchPanel />}
                  {activeTab === "queue" && <QueueList />}
                  {activeTab === "lyrics" && <LyricsPanel />}
                  {activeTab === "related" && <RelatedPanel />}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* MOBILE PREMIUM FLOATING COMPACT PLAY BAR (Apple Music Style) */}
      {voiceConnection && statistics?.track && (
        <>
          <div 
            className={`glass-panel ${styles.mobilePlayBar} ${activeTab === "player" ? styles.mobilePlayBarHidden : ""}`}
          >
            <div 
              className={styles.mobilePlayBarMain}
              onClick={() => setMobilePlayerExpanded(true)}
              role="button"
              tabIndex={0}
              aria-label="Expand full screen player"
            >
              <img 
                src={statistics.track.thumbnail || "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=200"} 
                className={`${styles.mobileArt} ${isTrackActive && !statistics.paused ? styles.rotatingArt : ""}`}
                alt={statistics.track.title}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=200";
                }}
              />
              <div className={styles.mobileInfo}>
                <p className={styles.mobileTitle}>{statistics.track.title}</p>
                <p className={styles.mobileArtist}>{statistics.track.author || "Discord Player"}</p>
              </div>
              <div className={styles.mobileVisualizer}>
                <Visualizer isPlaying={isTrackActive && !statistics.paused} />
              </div>
            </div>

            <div className={styles.mobilePlayBarActions}>
              <button 
                type="button" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  togglePlay(); 
                }}
                className={styles.mobileBarBtn}
                title={statistics.paused ? "Play track" : "Pause track"}
                aria-label={statistics.paused ? "Play track" : "Pause track"}
              >
                {statistics.paused ? (
                  <Play className={styles.mobileBarIcon} />
                ) : (
                  <Pause className={styles.mobileBarIcon} />
                )}
              </button>
              <button 
                type="button" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  skipTrack(); 
                }}
                className={styles.mobileBarBtn}
                title="Skip to next track"
                aria-label="Skip to next track"
              >
                <SkipForward className={styles.mobileBarIcon} />
              </button>
            </div>
          </div>

          {/* Full Screen Sliding Player overlay for Mobile devices */}
          <div className={`${styles.mobileDrawer} ${mobilePlayerExpanded ? styles.drawerOpen : ""}`}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerHeaderTitle}>Now Playing</div>
              <button 
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setMobilePlayerExpanded(false)}
                aria-label="Minimize player console"
              >
                <div className={styles.closeLine} />
              </button>
            </div>
            <div className={styles.drawerContent}>
              <PlayerControls />
            </div>
          </div>
        </>
      )}

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      {/* Dynamic Glassmorphic Toast Notification */}
      {activeError && (
        <div className={`glass-panel ${styles.toastNotification}`}>
          <AlertTriangle className={styles.toastIcon} />
          <div className={styles.toastTextContainer}>
            <p className={styles.toastTitle}>System Alert</p>
            <p className={styles.toastMessage}>{activeError}</p>
          </div>
          <button 
            type="button" 
            className={styles.toastDismissBtn}
            onClick={() => setActiveError(null)}
            aria-label="Dismiss toast"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
