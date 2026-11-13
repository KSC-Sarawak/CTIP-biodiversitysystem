import { z } from 'zod';
import { parseBody, fail } from './validate.js';
import { tooMany as overLimit } from './rateLimit.js';
import { ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS, toSession } from './session.js';
import { logAuthEvent } from './auditLog.js';
import { supabaseFresh, supabaseService } from './supabase.js';
import { isEmailRateLimit, emailLimitInfo, emailLimitMessage, recordEmailSent } from './emailLimit.js';

// Two-step sign-in with an authenticator app (VA-70, lecturer feedback; CTIP-50).
// Every signed-in role (botanist, officer, admin) must use it: an access token
// only works for the rest of the API once it says aal2 ("signed in with
// password AND a 6-digit code"). Visitors do not sign in. The apps never call Supabase Auth themselves:
// these routes call its MFA endpoints with the person's own access token.
//
// Flow, after POST /auth/sign-in (which answers mfa: "none" | "verify" | "setup"):
//   setup:  POST /auth/mfa/enroll  -> QR code and set-up key for the authenticator app
//           POST /auth/mfa/verify  -> { code } -> new session (aal2)
//   verify: POST /auth/mfa/verify  -> { code } -> new session (aal2)
//
// Lost phone (lecturer, 13 Nov 2026: "through Gmail"). Needs the password AND
// the staff member's email inbox:
//   POST /auth/mfa/recovery (password-only session) -> emails a sign-in link
//   the link opens the website with a new session made from the email
//   POST /auth/mfa/reset    (that email session)    -> the old app is removed
//   then the normal set-up: enroll + verify with the new phone

// The roles that must use a second step (Tan, 5 Nov 2026: every staff account).
export const MFA_ROLES = ['botanist', 'officer', 'admin'];

// Routes an officer or admin may call before the second step: only the two below.
export const MFA_SETUP_ROUTES = new Set(['post /auth/mfa/enroll', 'post /auth/mfa/verify', 'post /auth/mfa/recovery', 'post /auth/mfa/reset']);

// How long the session from the email link may be used to reset the app.
export const EMAIL_LINK_MAX_AGE_S = 15 * 60;
// Supabase names the email-link sign-in "otp" or "magiclink" in the token's amr list.
const EMAIL_LINK_METHODS = ['otp', 'magiclink'];

// True when this session was made from an email link in the last 15 minutes.
export function fromEmailLink(amr, now = Date.now()) {
  return (amr ?? []).some((a) => EMAIL_LINK_METHODS.includes(a?.method) && now / 1000 - Number(a.timestamp) <= EMAIL_LINK_MAX_AGE_S);
}

const Verify = z.strictObject({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app') });

// Supabase Auth's REST API, called with the signed-in person's own token.
async function authRequest(path, { method = 'POST', token, body } = {}) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // Logged on the server only, so a failed set-up can be traced (no codes or keys).
  if (!res.ok) console.warn(`MFA: ${method} ${path} -> ${res.status} ${data.error_code ?? data.code ?? ''} ${data.msg ?? data.message ?? ''}`.trim());
  return { ok: res.ok, status: res.status, data };
}

// The person's authenticator-app factors, from GET /auth/v1/user.
async function totpFactors(token) {
  const r = await authRequest('/user', { method: 'GET', token });
  if (!r.ok) return null;
  return (r.data.factors ?? []).filter((f) => f.factor_type === 'totp');
}

// What the person has to do after a correct password. `user` is the Supabase
// user from the sign-in answer (it lists the factors); `role` is the user_role claim.
export function mfaStep(user, role) {
  const verified = (user?.factors ?? []).some((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (verified) return 'verify';
  return MFA_ROLES.includes(role) ? 'setup' : 'none';
}

// Supabase gives the QR code as an SVG: either raw ("<svg ...>") or as
// "data:image/svg+xml;utf-8,<svg ...>" with the SVG not encoded, so characters
// like # break it and browsers show no picture. Sent on as base64, which every
// browser and the website's CSP (data:) accept.
export function qrImage(qr) {
  const text = String(qr ?? '').trim();
  if (/^data:[^,]*;base64,/i.test(text)) return text;
  let svg = text;
  const m = /^data:image\/svg\+xml[^,]*,([\s\S]*)$/i.exec(text);
  if (m) svg = /^%3C/i.test(m[1]) ? decodeURIComponent(m[1]) : m[1];
  if (!/<svg[\s>]/i.test(svg)) return text;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

const tooMany = (req) => overLimit(req, 'mfa-verify', { limit: ATTEMPT_LIMIT, windowMs: ATTEMPT_WINDOW_MS });
const tooManyEmails = (req) => overLimit(req, 'mfa-recovery', { limit: 3, windowMs: 15 * 60 * 1000 });
const AUTH_DOWN = 'Two-step sign-in is not working right now. Please try again.';

export const mfaHandlers = {
  // A new authenticator-app factor, waiting for its first code. Refused when one
  // is already set up: a lost phone is reset through the email link below, so a
  // stolen password alone cannot replace the owner's app.
  'post /auth/mfa/enroll': async (req, res) => {
    const factors = await totpFactors(req.user.token);
    if (!factors) return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    if (factors.some((f) => f.status === 'verified')) {
      return fail(res, 409, 'MFA_ALREADY_SET_UP', 'Two-step sign-in is already set up. If you lost your phone, use "Lost your phone?" to reset it by email.');
    }
    // Earlier set-ups that were never finished: removed, so the new one can use the same name.
    for (const f of factors) await authRequest(`/factors/${f.id}`, { method: 'DELETE', token: req.user.token }).catch(() => {});
    const r = await authRequest('/factors', {
      token: req.user.token,
      body: { factor_type: 'totp', friendly_name: 'Daun Sense', issuer: 'Daun Sense' },
    });
    if (!r.ok || !r.data?.totp) return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    res.status(201).json({ factor_id: r.data.id, qr_code: qrImage(r.data.totp.qr_code), secret: r.data.totp.secret, uri: r.data.totp.uri });
  },

  // Checks the 6-digit code and answers with a new session that says aal2.
  // Uses the verified factor, or else the one just enrolled.
  'post /auth/mfa/verify': async (req, res) => {
    if (tooMany(req)) return fail(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many codes tried. Wait a few minutes and try again.');
    const body = parseBody(Verify, req, res);
    if (!body) return;
    const factors = await totpFactors(req.user.token);
    if (!factors) return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    const factor = factors.find((f) => f.status === 'verified') ?? factors.at(-1);
    if (!factor) return fail(res, 409, 'MFA_NOT_SET_UP', 'Set up two-step sign-in first.');
    const challenge = await authRequest(`/factors/${factor.id}/challenge`, { token: req.user.token });
    if (!challenge.ok || !challenge.data?.id) return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    const checked = await authRequest(`/factors/${factor.id}/verify`, {
      token: req.user.token,
      body: { challenge_id: challenge.data.id, code: body.code },
    });
    if (!checked.ok || !checked.data?.access_token) {
      if (checked.status === 400 || checked.status === 422) {
        await logAuthEvent('MFA_FAILED', { token: req.user.token });
        return fail(res, 401, 'WRONG_CODE', 'That code is not right. Check the time on your phone and try the newest code.');
      }
      return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    }
    res.json(toSession(checked.data));
  },
  // Lost phone, step 1: after the right password, email a sign-in link to the
  // account's own address (never one typed in). Only for someone who has an app set up.
  'post /auth/mfa/recovery': async (req, res) => {
    if (tooManyEmails(req)) return fail(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many emails asked for. Wait 15 minutes and try again.');
    const factors = await totpFactors(req.user.token);
    if (!factors) return fail(res, 502, 'AUTH_ERROR', AUTH_DOWN);
    if (!factors.some((f) => f.status === 'verified')) return fail(res, 409, 'MFA_NOT_SET_UP', 'Two-step sign-in is not set up yet, so there is nothing to reset.');
    const emailRedirectTo = process.env.MFA_RESET_REDIRECT_URL || process.env.PASSWORD_RESET_REDIRECT_URL || undefined;
    const { error } = await supabaseFresh().auth.signInWithOtp({ email: req.user.email, options: { shouldCreateUser: false, emailRedirectTo } });
    if (isEmailRateLimit(error)) {
      const info = emailLimitInfo();
      return res.status(429).json({ code: 'EMAIL_RATE_LIMIT', message: `${emailLimitMessage(info)} No email was sent.`, details: info });
    }
    if (error) {
      console.warn('MFA recovery email not sent:', error.message);
      return fail(res, 502, 'AUTH_ERROR', 'The email could not be sent. Please try again.');
    }
    recordEmailSent();
    res.status(202).json({ sent: true });
  },

  // Lost phone, step 2: called with the session the email link made. Removes
  // the old authenticator app with the secret key (a person can only remove a
  // set-up app with aal2, which they cannot reach without the phone). The page
  // then runs the normal set-up with the new phone.
  'post /auth/mfa/reset': async (req, res) => {
    if (!fromEmailLink(req.user.amr)) {
      return fail(res, 403, 'EMAIL_LINK_REQUIRED', 'Open the link in the email we sent you (it works for 15 minutes), then try again.');
    }
    const admin = supabaseService()?.auth.admin.mfa;
    if (!admin) return fail(res, 503, 'AUTH_ERROR', AUTH_DOWN);
    const listed = await admin.listFactors({ userId: req.user.id });
    if (listed.error) return fail(res, 502, 'AUTH_ERROR', AUTH_DOWN);
    for (const f of listed.data?.factors ?? []) {
      if (f.factor_type !== 'totp') continue;
      const removed = await admin.deleteFactor({ id: f.id, userId: req.user.id });
      if (removed.error) return fail(res, 502, 'AUTH_ERROR', AUTH_DOWN);
    }
    res.status(204).end();
  },
};
