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
  role: Exclude<GuideRole, 'owner'> = 'viewer'
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
};

/**
 * Resolve a set of user ids to display names (falling back to email).
 * Returns a Map keyed by user id; ids without a readable profile are omitted.
 * RLS: the owner can read their members' profiles (0007) and members can read
 * the owner's (0006), so callers only get names they're entitled to see.
 */
export async function resolveProfileNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Map();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .in('id', ids);
  const nameById = new Map<string, string>();
  for (const p of (profiles ?? []) as { id: string; display_name: string | null; email: string | null }[]) {
    const name = p.display_name?.trim() || p.email;
    if (name) nameById.set(p.id, name);
  }
  return nameById;
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

  const nameById = await resolveProfileNames(rows.map((r) => r.shared_with));
  return rows.map((r) => ({
    userId: r.shared_with,
    name: nameById.get(r.shared_with) ?? 'Member',
    role: r.role,
  }));
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
