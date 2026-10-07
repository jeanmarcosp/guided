/**
 * Decodes shared Apple Maps guide links into a guide name + Apple Place IDs.
 *
 * A shared guide's URL carries the ENTIRE guide, no API involved:
 *   https://maps.apple/ug/<token>                 (short link, 301-redirects)
 *   https://maps.apple.com/guides?user=<payload>  (canonical)
 *   https://guides.apple.com/?ug=<payload>        (older form)
 *
 * The payload is base64 protobuf: field 1 = guide name, repeated field 2 =
 * { field 1: constant, field 2: 64-bit place muid }. A muid rendered as
 * "I" + uppercase hex is exactly MKMapItem.Identifier's rawValue — the same
 * applePlaceId format this app already stores and resolves natively.
 *
 * The encoding is undocumented and could change under us, so every failure
 * path throws the same friendly error.
 */

export type DecodedAppleGuide = {
  name: string;
  /** MKMapItem.Identifier rawValues ("I" + hex muid). */
  placeIds: string[];
};

const LINK_ERROR = 'That link could not be read. Make sure it is a shared Apple Maps guide link.';

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Protobuf varint at `i`; BigInt because muids exceed Number.MAX_SAFE_INTEGER. */
function readVarint(bytes: Uint8Array, i: number): [bigint, number] {
  let value = 0n;
  let shift = 0n;
  for (;;) {
    if (i >= bytes.length) throw new Error(LINK_ERROR);
    const byte = bytes[i++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [value, i];
    shift += 7n;
  }
}

function decodePayload(payload: string): DecodedAppleGuide {
  const bytes = base64ToBytes(payload);
  let name = '';
  const placeIds: string[] = [];

  let i = 0;
  while (i < bytes.length) {
    let tag: bigint;
    [tag, i] = readVarint(bytes, i);
    const field = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (wire === 2) {
      let length: bigint;
      [length, i] = readVarint(bytes, i);
      const end = i + Number(length);
      if (end > bytes.length) throw new Error(LINK_ERROR);
      if (field === 1) {
        // UTF-8 decode without TextDecoder (not guaranteed on Hermes).
        let bin = '';
        for (let k = i; k < end; k++) bin += String.fromCharCode(bytes[k]);
        try {
          name = decodeURIComponent(escape(bin));
        } catch {
          name = bin;
        }
      } else if (field === 2) {
        // Nested place entry: { 1: constant varint, 2: muid varint }.
        let j = i;
        while (j < end) {
          let entryTag: bigint;
          [entryTag, j] = readVarint(bytes, j);
          let value: bigint;
          [value, j] = readVarint(bytes, j);
          if (Number(entryTag >> 3n) === 2) {
            placeIds.push(`I${value.toString(16).toUpperCase()}`);
          }
        }
      }
      i = end;
    } else if (wire === 0) {
      [, i] = readVarint(bytes, i);
    } else {
      throw new Error(LINK_ERROR);
    }
  }

  if (placeIds.length === 0) throw new Error(LINK_ERROR);
  return { name: name || 'Imported Guide', placeIds };
}

function payloadFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const payload = parsed.searchParams.get('user') ?? parsed.searchParams.get('ug');
    // searchParams decodes '+' as space; the payload's '+' arrive %2B-encoded,
    // so any space here was a literal '+' in the base64.
    return payload ? payload.replace(/ /g, '+') : null;
  } catch {
    return null;
  }
}

/** Parse a pasted Apple Maps guide link, following the short-link redirect. */
export async function decodeAppleGuideLink(input: string): Promise<DecodedAppleGuide> {
  const link = input.trim();
  if (!/^https?:\/\/(maps\.apple|maps\.apple\.com|guides\.apple\.com)\//.test(link)) {
    throw new Error(LINK_ERROR);
  }

  let payload = payloadFromUrl(link);
  if (!payload) {
    // Short link — Apple 301s to the canonical URL that carries the payload.
    // fetch follows redirects; response.url is the final URL.
    const response = await fetch(link, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    payload = payloadFromUrl(response.url);
  }
  if (!payload) throw new Error(LINK_ERROR);

  try {
    return decodePayload(payload);
  } catch {
    throw new Error(LINK_ERROR);
  }
}
