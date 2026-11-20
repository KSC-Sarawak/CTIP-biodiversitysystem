import { z } from 'zod';
import { supabaseAs, supabaseService } from './supabase.js';
import { parseBody, fail, dbError, UUID } from './validate.js';
import { emailProblem } from './accountRules.js';
import { recordEmailSent, isEmailRateLimit, emailLimitInfo, emailLimitMessage } from './emailLimit.js';
import { linkTarget } from './resetRedirect.js';

// RBAC D14: an admin corrects a user's email, and it changes only after the
// person clicks a link sent to the NEW address.
//
// Supabase cannot do this for us: its own email change needs the person's
// two-step (aal2) session, and an admin change applies at once. So:
//   1. POST /profiles/:id/email (admin) saves a request and sends a Supabase
//      invitation to the new address. The invitation makes a short-lived
//      placeholder sign-in account, which holds the new address until the link
//      is used, and carries the request id. Its profile row is removed so it
//      never shows on the Users page.
//   2. The link opens the website, which sends its token to
//      POST /auth/email-change/confirm. The API checks the token with
//      Supabase, removes the placeholder, moves the address onto the real
//      account (confirmed) and updates profiles.email.
// Needs SUPABASE_SECRET_KEY on the server. The request table is not readable
// by anyone signed in (migration 20261120060000).

export const EMAIL_CHANGE_HOURS = 24;

const reasonOf = (check) => (value, ctx) => {
  const problem = check(value);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
};
const NewEmail = z.strictObject({ email: z.string().trim().toLowerCase().superRefine(reasonOf(emailProblem)) });
const Confirm = z.strictObject({ access_token: z.string().min(20).max(5000) });

const noService = (res) => fail(res, 503, 'NOT_CONFIGURED', 'Email correction needs SUPABASE_SECRET_KEY on the server.');

// Drops a user's unfinished requests and their placeholder accounts.
async function cancelPending(svc, userId) {
  const old = await svc.from('email_change_requests').select('id, placeholder_id').eq('user_id', userId).is('done_at', null);
  if (old.error) return old.error;
  for (const row of old.data) {
    if (row.placeholder_id) await svc.auth.admin.deleteUser(row.placeholder_id);
    await svc.from('email_change_requests').delete().eq('id', row.id);
  }
  return null;
}

export const emailChangeHandlers = {
  'post /profiles/:id/email': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found');
    const body = parseBody(NewEmail, req, res);
    if (!body) return;
    const svc = supabaseService();
    if (!svc) return noService(res);

    const db = supabaseAs(req.user);
    const target = await db.from('profiles').select('id, email, deleted_at').eq('id', req.params.id).maybeSingle();
    if (target.error) return dbError(res, target.error);
    if (!target.data) return fail(res, 404, 'NOT_FOUND', 'User not found');
    if (target.data.deleted_at) return fail(res, 409, 'USER_DELETED', 'This account is deleted. Restore it first.');
    if (target.data.email?.toLowerCase() === body.email) return fail(res, 422, 'VALIDATION_ERROR', 'This is already their email');
    const taken = await db.from('profiles').select('id').eq('email', body.email).limit(1);
    if (taken.error) return dbError(res, taken.error);
    if (taken.data.length) return fail(res, 409, 'EMAIL_TAKEN', 'This email already has an account');

    const cancelError = await cancelPending(svc, req.params.id);
    if (cancelError) return dbError(res, cancelError);

    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_HOURS * 3600 * 1000).toISOString();
    const saved = await svc.from('email_change_requests')
      .insert({ user_id: req.params.id, new_email: body.email, requested_by: req.user.id, expires_at: expiresAt })
      .select('id').single();
    if (saved.error) return dbError(res, saved.error);
    const requestId = saved.data.id;

    const invited = await svc.auth.admin.inviteUserByEmail(body.email, {
      data: { email_change_request: requestId },
      redirectTo: linkTarget(req),
    });
    if (invited.error) {
      await svc.from('email_change_requests').delete().eq('id', requestId);
      if (isEmailRateLimit(invited.error)) {
        const info = emailLimitInfo();
        return res.status(429).json({ code: 'EMAIL_RATE_LIMIT', message: `${emailLimitMessage(info)} No confirmation email was sent.`, details: info });
      }
      if (invited.error.code === 'email_exists' || /already (been )?registered/i.test(invited.error.message)) {
        return fail(res, 409, 'EMAIL_TAKEN', 'This email already has a sign-in account');
      }
      return fail(res, 502, 'AUTH_ERROR', invited.error.message);
    }
    recordEmailSent();
    const placeholderId = invited.data.user.id;
    // The sign-up trigger made a profile for the placeholder: remove it so it
    // never appears as a new account on the Users page.
    await svc.from('profiles').delete().eq('id', placeholderId);
    const linked = await svc.from('email_change_requests').update({ placeholder_id: placeholderId }).eq('id', requestId);
    if (linked.error) return dbError(res, linked.error);

    res.status(202).json({ user_id: req.params.id, pending_email: body.email, expires_at: expiresAt });
  },

  // The link's token is the placeholder's, so no staff role or two-step code:
  // the token itself (checked by Supabase) is the proof.
  'post /auth/email-change/confirm': async (req, res) => {
    const body = parseBody(Confirm, req, res);
    if (!body) return;
    const svc = supabaseService();
    if (!svc) return noService(res);
    const invalid = () => fail(res, 410, 'LINK_INVALID', 'This link has expired or was already used. Ask an admin to send a new one.');

    const who = await svc.auth.getUser(body.access_token);
    const placeholder = who.data?.user;
    const requestId = placeholder?.user_metadata?.email_change_request;
    if (who.error || !placeholder || !UUID.test(String(requestId ?? ''))) return invalid();

    const row = await svc.from('email_change_requests').select('id, user_id, new_email, placeholder_id, expires_at, done_at')
      .eq('id', requestId).eq('placeholder_id', placeholder.id).maybeSingle();
    if (row.error) return dbError(res, row.error);
    if (!row.data || row.data.done_at) return invalid();
    // Either way the placeholder goes: it must stop holding the address.
    await svc.auth.admin.deleteUser(placeholder.id);
    if (new Date(row.data.expires_at) < new Date()) {
      await svc.from('email_change_requests').delete().eq('id', row.data.id);
      return invalid();
    }

    const moved = await svc.auth.admin.updateUserById(row.data.user_id, { email: row.data.new_email, email_confirm: true });
    if (moved.error) return fail(res, 502, 'AUTH_ERROR', moved.error.message);
    const profile = await svc.from('profiles').update({ email: row.data.new_email }).eq('id', row.data.user_id);
    if (profile.error) return dbError(res, profile.error);
    await svc.from('email_change_requests').update({ done_at: new Date().toISOString() }).eq('id', row.data.id);
    res.json({ email: row.data.new_email });
  },
};
