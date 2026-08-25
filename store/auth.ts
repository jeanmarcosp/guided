import { FunctionsHttpError, type Session, type User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
};

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Load the current session on boot and start listening for auth changes. */
  init: () => () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Persist the user's display name. */
  saveName: (name: string) => Promise<void>;
  /** Patch profile columns (e.g. avatar_url / avatar_color) and update state. */
  updateProfile: (patch: Partial<Pick<Profile, 'avatar_url' | 'avatar_color'>>) => Promise<void>;
};

const PROFILE_COLUMNS = 'id, email, display_name, avatar_url, avatar_color';

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  return (data as Profile) ?? null;
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: 'loading',
  session: null,
  user: null,
  profile: null,

  init: () => {
    // onAuthStateChange alone covers both cases: it fires once immediately with
    // the resolved persisted session (event 'INITIAL_SESSION') and again on every
    // later change. A separate getSession() call here would race it — both
    // resolve the same session independently and each call set(), which could
    // flip `status` more than once per real transition (e.g. bootstrapSignedIn,
    // and so startRealtime(), firing twice — see lib/sync/realtime.ts).
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const profile = session ? await fetchProfile(session.user.id) : null;
      set({
        session: session ?? null,
        user: session?.user ?? null,
        profile,
        status: session ? 'signedIn' : 'signedOut',
      });
    });

    return () => sub.subscription.unsubscribe();
  },

  signOut: async () => {
    await supabase.auth.signOut();
    // onAuthStateChange will flip status to 'signedOut'.
  },

  deleteAccount: async () => {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.clone().json();
          if (typeof body?.error === 'string') detail = body.error;
        } catch {
          // body wasn't JSON — stick with the generic message
        }
      }
      throw new Error(detail);
    }
    await supabase.auth.signOut();
  },

  saveName: async (name) => {
    const userId = get().user?.id;
    if (!userId) return;
    const display_name = name.trim();
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name })
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    set({ profile: data as Profile });
  },

  updateProfile: async (patch) => {
    const userId = get().user?.id;
    if (!userId) return;
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    set({ profile: data as Profile });
  },
}));
