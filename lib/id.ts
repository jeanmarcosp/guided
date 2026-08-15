import * as Crypto from 'expo-crypto';

/**
 * Globally-unique v4 UUID. Client-issued UUIDs double as the server primary key,
 * so optimistic local writes and their backend rows share one id — no temp-id
 * reconciliation needed on sync.
 */
export function uid(): string {
  return Crypto.randomUUID();
}
