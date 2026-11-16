import { errors } from 'jose';
import { EMAIL_LINK_MAX_AGE_S, signedInWith } from './emailLink.js';

export const STAFF_ROLES = ['botanist', 'officer', 'admin'];

// 401 unless the request carries a valid, unexpired Supabase access token.
// The role comes from the user_role claim, which the Supabase access token
// hook copies from public.profiles. Never read the role from the request body.
export function requireAuth(verify) {
  return async (req, res, next) => {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required. Provide a valid access token using the Authorization: Bearer <token> header.' });
    }
    try {
      const claims = await verify(token);
      req.user = {
        id: claims.sub, email: claims.email, role: claims.user_role ?? null, aal: claims.aal ?? 'aal1', amr: claims.amr ?? [], token,
        // F-16: an admin made this account with a temporary password.
        mustChangePassword: claims.user_metadata?.must_change_password === true,
      };
      next();
    } catch (err) {
      if (err instanceof errors.JWTExpired) {
        return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Access token expired. Refresh the session and retry.' });
      }
      return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Access token is not valid.' });
    }
  };
}

// 403 unless the signed-in user's role is one of `roles`.
export function allow(...roles) {
  return (req, res, next) => {
    if (!STAFF_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ code: 'ACCOUNT_NOT_ACTIVE', message: 'Your account has no active role yet. Ask an Admin to approve it.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Your role is not allowed to do this!' });
    }
    next();
  };
}

// 403 unless an officer or admin finished the second sign-in step (VA-70): their
// token must say aal2. `roles` are the roles that need it; `setupRoute` lets the
// two MFA routes through so the step can be done at all.
// `resetLinkRoute` also lets through a session opened from a password-reset
// email in the last 15 minutes, so the new password can be set (POST /me/password).
// Supabase itself still asks that session for the 6-digit code when the person has
// an authenticator app (see the MFA_CODE_NEEDED answer there).
// Supabase marks a session from a reset link as amr method "otp" (checked against
// the real Auth server on 16 Nov 2026), the same as the lost-phone email link;
// "recovery" and "magiclink" are accepted too, as older Auth versions used them.
export const RESET_LINK_MAX_AGE_S = EMAIL_LINK_MAX_AGE_S;
const RESET_LINK_METHODS = ['otp', 'recovery', 'magiclink'];
export function fromResetLink(amr, now = Date.now()) {
  return signedInWith(amr, RESET_LINK_METHODS, { now }) != null;
}

export function requireMfa(roles, setupRoute = false, resetLinkRoute = false) {
  return (req, res, next) => {
    if (setupRoute || !roles.includes(req.user?.role) || req.user.aal === 'aal2') return next();
    if (resetLinkRoute && fromResetLink(req.user.amr)) return next();
    return res.status(403).json({ code: 'MFA_REQUIRED', message: 'Sign in again and enter the 6-digit code from your authenticator app.' });
  };
}

// F-16: 403 until a person whose admin typed their temporary password has chosen
// their own. `exempt` lets the sign-in steps through (the MFA routes and
// POST /me/password), so the change can be made at all.
export function requirePasswordChanged(exempt = false) {
  return (req, res, next) => {
    if (exempt || !req.user?.mustChangePassword) return next();
    return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Choose your own password first. Your admin gave you a temporary one.' });
  };
}
