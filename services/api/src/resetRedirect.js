// Where an emailed link (password reset, lost-phone sign-in) sends the person:
// back to the website they asked from. Asked on the Cloudflare site, the link
// opens the Cloudflare site; asked on a local dev server, it opens that one.
//
// The browser's Origin header says which site asked. It is used only when it
// is one of ours, so the link can never send a session to someone else's site:
//   - https://ctip-biodiversitysystem.pages.dev, and its preview deployments
//     (https://<anything>.ctip-biodiversitysystem.pages.dev)
//   - http://localhost:<port> and http://127.0.0.1:<port> (local development)
//   - anything in CORS_ORIGINS
// Otherwise (the mobile app sends no Origin) it falls back to
// PASSWORD_RESET_REDIRECT_URL, and then to the Site URL set in Supabase.
//
// Supabase also checks the address against Authentication > URL Configuration >
// Redirect URLs, and silently uses the Site URL when it is not listed. So these
// must be listed there:
//   https://ctip-biodiversitysystem.pages.dev/**
//   https://*.ctip-biodiversitysystem.pages.dev/**
//   http://localhost:*/**
//   http://127.0.0.1:*/**

export const SITE_HOST = 'ctip-biodiversitysystem.pages.dev';

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const corsOrigins = () => (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);

export function isOurSite(origin) {
  if (typeof origin !== 'string' || !origin) return false;
  if (LOCAL.test(origin)) return true;
  if (corsOrigins().includes(origin)) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  // Only a bare origin: no path, user name, query or anything after it.
  if (url.origin !== origin || url.protocol !== 'https:') return false;
  return url.hostname === SITE_HOST || url.hostname.endsWith(`.${SITE_HOST}`);
}

// The address to put in the email, or undefined to let Supabase use its Site URL.
export function linkTarget(req, fallback = process.env.PASSWORD_RESET_REDIRECT_URL) {
  const origin = req.get('origin');
  if (isOurSite(origin)) return `${origin}/`;
  return fallback || undefined;
}
