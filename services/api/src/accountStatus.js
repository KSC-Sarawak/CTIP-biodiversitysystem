import { supabaseAs } from './supabase.js';

// Says why an account cannot be used, so the apps can tell the person
// ("Your account has been disabled") instead of failing quietly.
//
// Read as the user: everyone can read their own profile, even when an admin
// has turned it off ("profiles: read own"). Returns null when the account is
// fine, or when the profile cannot be read. Access does not rely on this check
// alone: a turned-off account gets no role in its next token and RLS blocks its
// data. This mainly decides what message the person sees.
export const DISABLED_MESSAGE = 'Your account has been disabled. Contact an administrator if you think this is a mistake.';
export const DELETED_MESSAGE = 'Your account has been deleted. Contact an administrator if you think this is a mistake.';

export async function accountBlock(user) {
  if (!user?.id || !user?.token) return null;
  const { data, error } = await supabaseAs(user).from('profiles').select('is_active, deleted_at').eq('id', user.id).maybeSingle();
  if (error || !data) return null;
  if (data.deleted_at) return DELETED_MESSAGE;
  if (data.is_active === false) return DISABLED_MESSAGE;
  return null;
}
