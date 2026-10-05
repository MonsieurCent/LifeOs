import fs from 'fs';
import path from 'path';
import { OAuth2Client, type Credentials } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), '.server_data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

function getUserTokensPath(userId: string = 'default'): string {
  const safeId = (userId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `tokens_${safeId}.json`);
}

// Memory cache for active OAuth states to prevent CSRF
interface OAuthStateRecord {
  userId?: string;
  timestamp: number;
}
const activeStates = new Map<string, OAuthStateRecord>();

export function generateOAuthState(userId?: string): string {
  const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
  activeStates.set(state, { userId, timestamp: Date.now() });
  // Clean states older than 10 minutes
  const now = Date.now();
  for (const [key, val] of activeStates.entries()) {
    if (now - val.timestamp > 600000) {
      activeStates.delete(key);
    }
  }
  return state;
}

export function validateOAuthState(state: string): { valid: boolean; userId?: string } {
  if (!state) return { valid: false };
  const record = activeStates.get(state);
  if (!record) return { valid: false };
  if (Date.now() - record.timestamp > 600000) {
    activeStates.delete(state);
    return { valid: false };
  }
  activeStates.delete(state);
  return { valid: true, userId: record.userId };
}

export const GOOGLE_HEALTH_V4_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly'
];

// Google Health API & Google Fit scopes (Fitbit cloud platform replacement) plus identity
export const HEALTH_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  // Google Health API v4
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
  // Google Fit REST API (for complete coverage across Google Fit, Health Connect & Fitbit sync)
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.nutrition.read',
  'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
  'https://www.googleapis.com/auth/fitness.blood_pressure.read',
  'https://www.googleapis.com/auth/fitness.body_temperature.read'
];

export function getOAuth2Client(customRedirectUri?: string): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = customRedirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/oauth/callback';

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in environment variables.');
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function getAuthorizationUrl(customRedirectUri?: string, scopes: string[] = HEALTH_SCOPES, state?: string): string {
  const client = getOAuth2Client(customRedirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    include_granted_scopes: true,
    state: state || generateOAuthState()
  });
}

export async function exchangeCodeForTokens(code: string, customRedirectUri?: string, userId: string = 'default'): Promise<Credentials> {
  const client = getOAuth2Client(customRedirectUri);
  const { tokens } = await client.getToken(code);
  saveTokens(tokens, userId);
  return tokens;
}

export function saveTokens(tokens: Credentials & { expires_in?: number }, userId: string = 'default'): void {
  const tokenPath = getUserTokensPath(userId);
  let existingTokens: Partial<Credentials> = {};
  if (fs.existsSync(tokenPath)) {
    try {
      const raw = fs.readFileSync(tokenPath, 'utf-8');
      existingTokens = JSON.parse(raw);
    } catch {
      existingTokens = {};
    }
  }

  // Preserve refresh_token if new token response doesn't include one
  const calculatedExpiry = tokens.expiry_date ||
    (tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : undefined) ||
    (existingTokens.expiry_date && existingTokens.expiry_date > Date.now() ? existingTokens.expiry_date : (tokens.access_token ? Date.now() + 3500 * 1000 : undefined));

  const mergedTokens: Credentials = {
    ...existingTokens,
    ...tokens,
    scope: tokens.scope || existingTokens.scope,
    refresh_token: tokens.refresh_token || existingTokens.refresh_token,
    expiry_date: calculatedExpiry
  };

  try {
    fs.writeFileSync(tokenPath, JSON.stringify(mergedTokens, null, 2), 'utf-8');
  } catch (err) {
    console.error("Failed to write user token file:", err);
  }

  // Also maintain tokens_default.json as active fallback so background tasks find current valid token
  if (userId !== 'default') {
    try {
      const defaultPath = getUserTokensPath('default');
      fs.writeFileSync(defaultPath, JSON.stringify(mergedTokens, null, 2), 'utf-8');
    } catch {}
  }
}

export function loadTokens(userId: string = 'default'): Credentials | null {
  const tokenPath = getUserTokensPath(userId);
  if (!fs.existsSync(tokenPath)) {
    // Check fallback default if custom userId had no separate file yet
    if (userId !== 'default') {
      const defaultPath = getUserTokensPath('default');
      if (fs.existsSync(defaultPath)) {
        try {
          const raw = fs.readFileSync(defaultPath, 'utf-8');
          const tokens = JSON.parse(raw) as Credentials;
          if (tokens && (tokens.access_token || tokens.refresh_token)) return tokens;
        } catch {}
      }
    }
    return null;
  }
  try {
    const raw = fs.readFileSync(tokenPath, 'utf-8');
    const tokens = JSON.parse(raw) as Credentials;
    if (tokens && (tokens.access_token || tokens.refresh_token)) {
      return tokens;
    }
  } catch {
    return null;
  }
  return null;
}

export function isAuthenticated(userId: string = 'default'): boolean {
  const tokens = loadTokens(userId);
  return Boolean(tokens && (tokens.access_token || tokens.refresh_token));
}

export function clearTokens(userId: string = 'default'): void {
  const tokenPath = getUserTokensPath(userId);
  if (fs.existsSync(tokenPath)) {
    try {
      fs.unlinkSync(tokenPath);
    } catch {}
  }
}

/**
 * Direct RFC 6749 refresh request to oauth2.googleapis.com
 * Bypasses library constraints to ensure permanent session retention
 */
export async function refreshGoogleOAuthTokenDirect(refreshToken: string, userId: string = 'default'): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken.trim(),
        grant_type: 'refresh_token'
      })
    });

    const data = await res.json();
    if (res.ok && data.access_token) {
      const updated: Credentials = {
        access_token: data.access_token,
        token_type: data.token_type || 'Bearer',
        scope: data.scope,
        refresh_token: refreshToken, // retain existing refresh token
        expiry_date: Date.now() + (Number(data.expires_in) || 3599) * 1000
      };
      saveTokens(updated, userId);
      return data.access_token;
    } else {
      console.warn('Direct Google OAuth token refresh returned non-OK status:', data);
    }
  } catch (err) {
    console.error('Direct Google OAuth token refresh network failure:', err);
  }
  return null;
}

export async function forceRefreshToken(customRedirectUri?: string, userId: string = 'default'): Promise<string | null> {
  const tokens = loadTokens(userId);
  if (!tokens || !tokens.refresh_token) return null;

  // 1. Direct standard refresh
  const directToken = await refreshGoogleOAuthTokenDirect(tokens.refresh_token, userId);
  if (directToken) return directToken;

  // 2. Google Auth Library refresh fallback
  try {
    const client = getOAuth2Client(customRedirectUri);
    client.setCredentials(tokens);
    const refreshRes = await client.refreshAccessToken();
    if (refreshRes.credentials?.access_token) {
      saveTokens(refreshRes.credentials, userId);
      return refreshRes.credentials.access_token;
    }
  } catch (err: any) {
    console.error('Failed to force refresh OAuth token via client:', err?.message || err);
  }
  return null;
}

export async function getValidAccessToken(customRedirectUri?: string, userId: string = 'default'): Promise<{ token: string; refreshed: boolean } | null> {
  const tokens = loadTokens(userId);
  if (!tokens) return null;

  // Proactively refresh if expiring within 120 seconds or if expiry_date is not known
  const isExpiring = !tokens.access_token || !tokens.expiry_date || tokens.expiry_date <= Date.now() + 120000;

  if (isExpiring && tokens.refresh_token) {
    const refreshed = await forceRefreshToken(customRedirectUri, userId);
    if (refreshed) {
      return { token: refreshed, refreshed: true };
    }
  }

  // If existing access token is still valid, return it
  if (tokens.access_token && (!tokens.expiry_date || tokens.expiry_date > Date.now())) {
    return { token: tokens.access_token, refreshed: false };
  }

  // Expired and needs refresh
  if (tokens.refresh_token) {
    const refreshed = await forceRefreshToken(customRedirectUri, userId);
    if (refreshed) {
      return { token: refreshed, refreshed: true };
    }
  }

  // Last resort fallback: if unexpired token exists without expiry metadata
  if (tokens.access_token) {
    return { token: tokens.access_token, refreshed: false };
  }

  return null;
}

function getGoogleHealthTokensPath(userId: string = 'default'): string {
  const safeId = (userId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `tokens_googlehealth_${safeId}.json`);
}

/**
 * Provides a downscoped OAuth access token strictly containing GOOGLE_HEALTH_V4_SCOPES.
 * health.googleapis.com rejects requests if fitness.* scopes are present on the token (403 Forbidden).
 * Downscoping allows using the same underlying Google account refresh token while satisfying the Health API constraint.
 */
export async function getValidGoogleHealthAccessToken(userId: string = 'default'): Promise<string | null> {
  const ghTokenPath = getGoogleHealthTokensPath(userId);
  if (fs.existsSync(ghTokenPath)) {
    try {
      const raw = fs.readFileSync(ghTokenPath, 'utf-8');
      const ghTokens = JSON.parse(raw) as Credentials;
      if (ghTokens.access_token && ghTokens.expiry_date && ghTokens.expiry_date > Date.now() + 60000) {
        return ghTokens.access_token;
      }
    } catch {}
  }

  // Load root user tokens
  const rootTokens = loadTokens(userId);
  if (!rootTokens?.refresh_token) {
    // If no userId tokens found, try 'default'
    if (userId !== 'default') {
      return getValidGoogleHealthAccessToken('default');
    }
    return null;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: rootTokens.refresh_token.trim(),
        grant_type: 'refresh_token',
        scope: GOOGLE_HEALTH_V4_SCOPES.join(' ')
      })
    });

    const data = await res.json();
    if (res.ok && data.access_token) {
      const updated: Credentials = {
        access_token: data.access_token,
        token_type: data.token_type || 'Bearer',
        scope: data.scope,
        refresh_token: rootTokens.refresh_token,
        expiry_date: Date.now() + (Number(data.expires_in) || 3599) * 1000
      };
      fs.writeFileSync(ghTokenPath, JSON.stringify(updated, null, 2));
      return data.access_token;
    } else {
      console.warn('Google Health downscoped token refresh failed:', data);
    }
  } catch (err) {
    console.error('Failed to get downscoped Google Health token:', err);
  }
  return null;
}

export async function getAuthenticatedClient(customRedirectUri?: string, userId: string = 'default'): Promise<OAuth2Client | null> {
  const tokens = loadTokens(userId);
  if (!tokens) return null;

  const client = getOAuth2Client(customRedirectUri);
  client.setCredentials(tokens);

  client.on('tokens', (updatedTokens) => {
    saveTokens(updatedTokens, userId);
  });

  return client;
}

export async function getGoogleUserInfo(userId: string = 'default'): Promise<{ name?: string; email?: string; picture?: string; sub?: string } | null> {
  try {
    const valid = await getValidAccessToken(undefined, userId);
    if (!valid?.token) return null;

    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${valid.token}` }
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch user info from Google:', err);
    return null;
  }
}
