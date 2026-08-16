import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import type { GuideRole } from '@/lib/types';

export type ShareRow = {
  id: string;
  guide_id: string;
  token: string;
  role: GuideRole;
  shared_with: string | null;
  status: 'pending' | 'accepted';
  created_at: string;
};

/** Create a reusable share link for a guide and return its deep link URL. */
export async function createShareLink(
  guideId: string,
  role: Exclude<GuideRole, 'owner'> = 'viewer',
): Promise<{ token: string; url: string }> {
  const { data, error } = await supabase
    .from('guide_shares')
    .insert({ guide_id: guideId, role, shared_with: null, status: 'pending' })
    .select('token')
    .single();
  if (error) throw error;
  const token = (data as { token: string }).token;
  return { token, url: Linking.createURL(`share/${token}`) };
}

export type GuideMember = {
  userId: string;
  name: string;
  role: GuideRole;
  avatarUrl?: string | null;
  avatarColor?: string | null;
};

/** A resolved profile for rendering an avatar + name. */
export type ProfileCard = {
  name: string;
  avatarUrl: string | null;
  avatarColor: string | null;
};

/**
 * Resolve a set of user ids to name + avatar, keyed by user id; ids without a
 * readable profile are omitted. RLS: the owner can read their members' profiles
 * (0007) and members can read the owner's (0006), so callers only get people
 * they're entitled to see.
 */
export async function resolveProfiles(userIds: string[]): Promise<Map<string, ProfileCard>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Map();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, email, avatar_url, avatar_color')
    .in('id', ids);
  const byId = new Map<string, ProfileCard>();
  for (const p of (profiles ?? []) as {
    id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    avatar_color: string | null;
  }[]) {
    const name = p.display_name?.trim() || p.email;
    if (name) byId.set(p.id, { name, avatarUrl: p.avatar_url, avatarColor: p.avatar_color });
  }
  return byId;
}

/**
 * List the people a guide has been shared with, resolved to names/avatars.
 * Owner-only in practice: RLS lets the owner read every membership row and (via
 * 0007) those members' profiles, while a non-owner only ever sees their own row.
 */
export async function fetchGuideMembers(guideId: string): Promise<GuideMember[]> {
  const { data, error } = await supabase
    .from('guide_shares')
    .select('shared_with, role, status, created_at')
    .eq('guide_id', guideId)
    .eq('status', 'accepted')
    .not('shared_with', 'is', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { shared_with: string; role: GuideRole }[];
  if (rows.length === 0) return [];

  const cardById = await resolveProfiles(rows.map((r) => r.shared_with));
  return rows.map((r) => {
    const card = cardById.get(r.shared_with);
    return {
      userId: r.shared_with,
      name: card?.name ?? 'Member',
      role: r.role,
      avatarUrl: card?.avatarUrl,
      avatarColor: card?.avatarColor,
    };
  });
}

/** List a guide's share links + accepted members (owner only, per RLS). */
export async function listShares(guideId: string): Promise<ShareRow[]> {
  const { data, error } = await supabase
    .from('guide_shares')
    .select('*')
    .eq('guide_id', guideId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ShareRow[];
}

/** Change a member's role (owner only, per RLS). Propagates to them via Realtime. */
export async function updateShareRole(
  shareId: string,
  role: Exclude<GuideRole, 'owner'>,
): Promise<void> {
  const { error } = await supabase.from('guide_shares').update({ role }).eq('id', shareId);
  if (error) throw error;
}

export async function revokeShare(shareId: string): Promise<void> {
  const { error } = await supabase.from('guide_shares').delete().eq('id', shareId);
  if (error) throw error;
}

/** Redeem a share token; returns the guide_id the caller now has access to. */
export async function acceptShareToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_share_token', { p_token: token });
  if (error) throw error;
  return data as string;
}
