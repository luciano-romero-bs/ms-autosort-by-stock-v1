import { getEnv } from "./env.js";

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Guards the panel routes. Returns true and lets the caller continue, or
 * writes a 401 response and returns false. Every /api handler except
 * cron/run calls this first.
 */
export function requireBasicAuth(req, res) {
  const env = getEnv();
  const header = req.headers.authorization || "";

  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);

    if (timingSafeEqual(user, env.panelUser) && timingSafeEqual(pass, env.panelPass)) {
      return true;
    }
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="collection-sorter"');
  res.status(401).json({ ok: false, error: "Autenticación requerida." });
  return false;
}

/**
 * Guards /api/cron/run. Accepts the header Vercel Cron Jobs sends
 * automatically (`Authorization: Bearer <CRON_SECRET>`, added by Vercel
 * whenever a CRON_SECRET env var exists on the project) as well as the
 * legacy `X-Cron-Secret` header, so the same endpoint can be triggered by
 * hand with curl while developing/testing.
 */
export function requireCronAuth(req, res) {
  const env = getEnv();
  const authHeader = req.headers.authorization || "";
  const bearerOk = authHeader.startsWith("Bearer ") && authHeader.slice("Bearer ".length) === env.cronSecret;
  const legacyOk = req.headers["x-cron-secret"] === env.cronSecret;

  if (bearerOk || legacyOk) return true;

  res.status(401).json({ ok: false, error: "Secreto de cron inválido o ausente." });
  return false;
}
