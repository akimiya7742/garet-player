/**
 * Utility to detect Discord activity and return the appropriate API URL
 * When running in Discord activity, use /api/ instead of backendUrl
 */

export const BACKEND_URL_STORAGE_KEY = "garret_custom_backend_url";
export const VIDEO_BG_STORAGE_KEY = "garret_video_bg_enabled";

export const isDiscordActivity = (): boolean => {
  if (typeof window === "undefined") return false;
  
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has("frame_id") || window.location.ancestorOrigins?.contains("https://discord.com") || false;
};

/**
 * Get custom backend URL from localStorage if defined
 */
export const getStoredCustomBackendUrl = (): string => {
  if (typeof window === "undefined") return "";
  try {
    const stored = localStorage.getItem(BACKEND_URL_STORAGE_KEY);
    return stored ? stored.trim().replace(/\/+$/, "") : "";
  } catch (e) {
    return "";
  }
};

/**
 * Set custom backend URL in localStorage
 */
export const setStoredCustomBackendUrl = (url: string): void => {
  if (typeof window === "undefined") return;
  try {
    const cleaned = url.trim().replace(/\/+$/, "");
    if (cleaned) {
      localStorage.setItem(BACKEND_URL_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent("backend-url-changed", { detail: { url: cleaned } }));
  } catch (e) {
    console.warn("[API] Failed to save custom backend URL:", e);
  }
};

/**
 * Clear custom backend URL and revert to default .env
 */
export const clearStoredCustomBackendUrl = (): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("backend-url-changed", { detail: { url: "" } }));
  } catch (e) {
    console.warn("[API] Failed to clear custom backend URL:", e);
  }
};

/**
 * Returns effective backend URL:
 * 1. Custom URL from localStorage (if set)
 * 2. Provided fallback (or process.env.NEXT_PUBLIC_BACKEND_API_URL)
 */
export const getEffectiveBackendUrl = (fallbackUrl?: string): string => {
  const custom = getStoredCustomBackendUrl();
  if (custom) return custom;
  
  const defaultEnv = fallbackUrl || process.env.NEXT_PUBLIC_BACKEND_API_URL || "";
  return defaultEnv.trim().replace(/\/+$/, "");
};

/**
 * Check if video background is enabled (default: true)
 */
export const isVideoBackgroundEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(VIDEO_BG_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch (e) {
    return true;
  }
};

/**
 * Save video background setting
 */
export const setVideoBackgroundEnabled = (enabled: boolean): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VIDEO_BG_STORAGE_KEY, enabled ? "true" : "false");
    window.dispatchEvent(new CustomEvent("video-bg-changed", { detail: { enabled } }));
  } catch (e) {
    console.warn("[VideoBG] Failed to save video background setting:", e);
  }
};

/**
 * Get the appropriate API endpoint URL
 * For Discord activity: uses /api/...
 * For regular: uses effective backendUrl/...
 */
export const getApiUrl = (backendUrl: string, endpoint: string): string => {
  if (isDiscordActivity()) {
    return `/api/${endpoint}`;
  }
  const effective = getEffectiveBackendUrl(backendUrl);
  return `${effective}/${endpoint}`;
};

/**
 * Get WebSocket URL
 * For Discord activity: uses /api
 * For regular: returns effective backendUrl
 */
export const getWSUrl = (backendUrl: string): string => {
  if (isDiscordActivity()) {
    return "/api";
  }
  
  const effective = getEffectiveBackendUrl(backendUrl);
  if (!effective) return "";
  return `${effective}`;
};
