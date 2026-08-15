import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
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
  /** Persist the user's display name. */
  saveName: (name: string) => Promise<void>;
};

const PROFILE_COLUMNS = 'id, email, display_name, avatar_url';

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
    // Hydrate from any persisted session, then subscribe to future changes.
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session ?? null;
      const profile = session ? await fetchProfile(session.user.id) : null;
      set({
        session,
        user: session?.user ?? null,
        profile,
        status: session ? 'signedIn' : 'signedOut',
      });
    });

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
}));
