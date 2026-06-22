/**
 * Utility to detect Discord activity and return the appropriate API URL
 * When running in Discord activity, use /api/ instead of backendUrl
 */

export const isDiscordActivity = (): boolean => {
  if (typeof window === "undefined") return false;
  
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has("frame_id") || window.location.ancestorOrigins?.contains("https://discord.com") || false;
};

/**
 * Get the appropriate API endpoint URL
 * For Discord activity: uses /api/...
 * For regular: uses backendUrl/...
 */
export const getApiUrl = (backendUrl: string, endpoint: string): string => {
  if (isDiscordActivity()) {
    return `/api/${endpoint}`;
  }
  return `${backendUrl}/${endpoint}`;
};

/**
 * Get WebSocket URL
 * For Discord activity: uses /api/ws
 * For regular: converts http/https to ws/wss
 */
export const getWSUrl = (backendUrl: string): string => {
  if (isDiscordActivity()) {
    return "/api/ws";
  }
  
  if (!backendUrl) return "";
  return backendUrl.replace(/^http/, "ws");
};
