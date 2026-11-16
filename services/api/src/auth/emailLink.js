// How a session was opened, from its token's amr list (Supabase Auth). Shared by
// the lost-phone reset (mfa.js) and the password-reset page (middleware.js), so
// both read sessions the same way.
//
// Supabase marks a session opened from an email link with amr method "otp"
// (seen on the real Auth server on 16 Nov 2026), whether the link was a
// password reset or the lost-phone sign-in; older versions used "magiclink"
// or "recovery". So the method alone cannot say which email it was: the
// lost-phone reset also checks that its password step happened (mfa.js).

export const EMAIL_LINK_MAX_AGE_S = 15 * 60;
export const PASSWORD_MAX_AGE_S = 15 * 60;

// The newest sign-in time (seconds) of one of `methods` within `maxAgeS`, or null.
export function signedInWith(amr, methods, { now = Date.now(), maxAgeS = EMAIL_LINK_MAX_AGE_S } = {}) {
  const times = (amr ?? [])
    .filter((a) => methods.includes(a?.method) && now / 1000 - Number(a.timestamp) <= maxAgeS)
    .map((a) => Number(a.timestamp));
  return times.length ? Math.max(...times) : null;
}
