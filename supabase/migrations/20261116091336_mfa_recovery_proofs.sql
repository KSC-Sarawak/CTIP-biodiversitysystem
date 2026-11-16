-- =====================================================================
-- Lost phone (CTIP-50): proof that the password step happened.
--
-- "Lost your phone?" needs the password AND the staff member's email:
--   1. POST /auth/mfa/recovery, with a password sign-in, emails a sign-in link
--   2. POST /auth/mfa/reset, with the session from that link, removes the app
-- Supabase marks a password-reset link's session the same way as that link's
-- (amr "otp"), so step 2 could not tell them apart: someone with only the
-- mailbox could ask for a password reset, open it, and remove the app (found
-- while reviewing PR #83). Step 1 now leaves a row here; step 2 takes it, once,
-- and only for a link opened after it, within 15 minutes.
--
-- Only the API (secret key) reads or writes this table: RLS is on and there are
-- no policies, so signed-in users and visitors cannot see or change it.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.mfa_recovery_proofs (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  proven_at  timestamptz not null default now()
);

alter table public.mfa_recovery_proofs enable row level security;
revoke all on table public.mfa_recovery_proofs from anon, authenticated;
