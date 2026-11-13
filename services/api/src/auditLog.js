import { supabaseAnon, supabaseAs } from './supabase.js';

// VA-71: writes a sign-in event to audit_logs through log_auth_event()
// (migration 20261113000000). Events: SIGN_IN, SIGN_IN_FAILED, MFA_FAILED,
// SIGN_OUT. Only the email is stored, never the password or the 6-digit code.
// With the person's token the database records who they are; without one
// (wrong password) only SIGN_IN_FAILED is accepted.
// Never throws: if the log cannot be written, signing in still works.
export async function logAuthEvent(event, { email, token } = {}) {
  try {
    const db = token ? supabaseAs({ token }) : supabaseAnon();
    const { error } = await db.rpc('log_auth_event', { p_event: event, p_email: email ?? '' });
    if (error) console.warn(`audit log: ${event} not written: ${error.message}`);
  } catch (err) {
    console.warn(`audit log: ${event} not written: ${err.message}`);
  }
}
