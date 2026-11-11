// GENERATED from src/sharing.ts by scripts/sync-domain.mjs — do not edit here, edit src/sharing.ts and re-run.
import type { ShareInvite } from './types';

/*
 * Invite codes.
 *
 * A code looks like MP-7KQ2-XH9D: 8 random characters from a 32-letter alphabet (40 bits) taken
 * from a cryptographically secure generator. The invite document id is SHA-256(normalized code),
 * so the plaintext code is never stored and an invite can only be fetched by someone who has the
 * code. Invites expire after INVITE_TTL_MS and can be accepted exactly once (enforced by
 * firestore.rules).
 */

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 chars → byte & 31 has no modulo bias
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type RandomSource = (n: number) => Uint8Array;

let randomBytes: RandomSource = (n: number) => {
  const c = (globalThis as { crypto?: { getRandomValues?: <T extends ArrayBufferView>(a: T) => T } }).crypto;
  if (!c?.getRandomValues) throw new Error('No secure random number generator available');
  return c.getRandomValues(new Uint8Array(n));
};

/** Platforms without crypto.getRandomValues (React Native) inject a CSPRNG here at startup. */
export function setRandomSource(fn: RandomSource) {
  randomBytes = fn;
}

/** Random string from the code alphabet (5 bits of entropy per char) */
export function randomToken(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_CHARS[bytes[i] & 31];
  return out;
}

/** Random id for shared items: 20 chars ≈ 100 bits */
export const randomId = (length = 20) => randomToken(length).toLowerCase();

/** New human-friendly invite code, e.g. MP-7KQ2-XH9D */
export function generateInviteCode(): string {
  const r = randomToken(8);
  return `MP-${r.slice(0, 4)}-${r.slice(4)}`;
}

/** Normalize what a user typed: "mp 7kq2-xh9d" → "MP7KQ2XH9D" */
export function normalizeInviteCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.startsWith('MP') ? clean : `MP${clean}`;
}

/** Invite document id for a code */
export async function inviteIdForCode(code: string): Promise<string> {
  return sha256Hex(normalizeInviteCode(code));
}

/** SHA-256 of an ASCII string as lowercase hex (WebCrypto when available, pure JS otherwise) */
export async function sha256Hex(str: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: { digest?: (a: string, d: Uint8Array) => Promise<ArrayBuffer> } } }).crypto?.subtle;
  if (subtle?.digest) {
    try {
      const buf = await subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fall through to the JS implementation
    }
  }
  return sha256HexJs(str);
}

/** Pure-JS SHA-256 for ASCII input (used on React Native, where WebCrypto is unavailable) */
export function sha256HexJs(ascii: string): string {
  const rightRotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));
  const maxWord = Math.pow(2, 32);
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let msg = ascii + '\x80';
  while (msg.length % 64 !== 56) msg += '\x00';
  for (let i = 0; i < msg.length; i++) {
    const j = msg.charCodeAt(i);
    words[i >> 2] = (words[i >> 2] || 0) | (j << ((3 - (i % 4)) * 8));
  }
  words.push((asciiBitLength / maxWord) | 0);
  words.push(asciiBitLength | 0);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice();
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15] || 0;
      const w2 = w[i - 2] || 0;
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = i < 16 ? w[i] || 0 : ((w[i - 16] || 0) + s0 + (w[i - 7] || 0) + s1) | 0;
      const a = hash[0];
      const e = hash[4];
      const t2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0;
      const t1 = (hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] + w[i]) | 0;
      hash.splice(0, 8, (t1 + t2) | 0, a, hash[1], hash[2], (hash[3] + t1) | 0, e, hash[5], hash[6]);
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  return hash.map(h => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

/** Basic email sanity check */
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** mailto: link the inviter can use to send the code */
export function buildShareEmailDraft(invite: Pick<ShareInvite, 'targetType' | 'targetEmoji' | 'targetName' | 'inviteeEmail'>, code: string, appUrl: string): string {
  const what = invite.targetType === 'pot' ? 'spending pot' : 'savings stash';
  const subject = encodeURIComponent(`Invitation to share "${invite.targetEmoji} ${invite.targetName}" on Moneypot`);
  const body = encodeURIComponent(
    `Hi,\n\n` +
    `I've invited you to share the ${what} "${invite.targetEmoji} ${invite.targetName}" in Moneypot.\n\n` +
    `Your one-time invite code (valid for 7 days):\n${code}\n\n` +
    `Open ${appUrl}?code=${encodeURIComponent(code)} — or enter the code under "Join shared" in the app.\n` +
    `Sign in with this email address to accept.\n\nCheers!`
  );
  return `mailto:${encodeURIComponent(invite.inviteeEmail)}?subject=${subject}&body=${body}`;
}
