import crypto from "node:crypto";

const SECRET = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? "") + "-deskmate-2fa-secret-key-2026";

/**
 * Signs a trusted device token valid for 30 days.
 */
export function signTrustedDevice(userId: string): string {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const payload = `${userId}:${expiresAt}`;
  const hmac = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

/**
 * Verifies if a trusted device token is valid and unexpired for the specified userId.
 */
export function verifyTrustedDevice(token: string | undefined | null, userId: string): boolean {
  if (!token) return false;
  try {
    const parts = token.split(":");
    if (parts.length !== 3) return false;
    const [tokenUserId, expiresAtStr, tokenHmac] = parts;
    if (tokenUserId !== userId) return false;

    const expiresAt = Number(expiresAtStr);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

    const expectedHmac = crypto.createHmac("sha256", SECRET).update(`${tokenUserId}:${expiresAtStr}`).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(tokenHmac), Buffer.from(expectedHmac));
  } catch (err) {
    return false;
  }
}

/**
 * Creates a short-lived pending 2FA token (valid for 5 minutes).
 */
export function signPending2FA(data: { email: string; userId: string; trustDevice: boolean; next: string }): string {
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  const payload = Buffer.from(JSON.stringify({ ...data, expiresAt })).toString("base64url");
  const hmac = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

/**
 * Verifies a pending 2FA token and returns its payload if valid and unexpired.
 */
export function verifyPending2FA(token: string | undefined | null): { email: string; userId: string; trustDevice: boolean; next: string } | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, tokenHmac] = parts;

    const expectedHmac = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(tokenHmac), Buffer.from(expectedHmac))) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded.expiresAt || Date.now() > Number(decoded.expiresAt)) {
      return null;
    }

    return {
      email: String(decoded.email || "").toLowerCase(),
      userId: String(decoded.userId || ""),
      trustDevice: Boolean(decoded.trustDevice),
      next: String(decoded.next || ""),
    };
  } catch (err) {
    return null;
  }
}
