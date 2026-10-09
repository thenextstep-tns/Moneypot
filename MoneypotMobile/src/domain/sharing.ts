import type { ShareInvite } from './types';

/** Generate a formatted, human-friendly one-off masked access code (e.g. MP-8492-31) */
export function generateMaskedCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const rand = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `MP-${rand(4)}-${rand(2)}`;
}

// Fallback sha256 in pure JS if crypto.subtle is not present
function fallbackSha256(str: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const maxWord = Math.pow(2, 32);
  let i = 0, j = 0;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = str.length * 8;
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let strMod = str;
  strMod += '\x80';
  while (strMod.length % 64 !== 56) strMod += '\x00';
  for (i = 0; i < strMod.length; i++) {
    j = strMod.charCodeAt(i);
    words[i >> 2] = (words[i >> 2] || 0) | (j << ((3 - (i % 4)) * 8));
  }
  words.push((asciiBitLength / maxWord) | 0);
  words.push(asciiBitLength | 0);

  for (j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = [...hash];
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15] || 0, w2 = w[i - 2] || 0;
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = (i < 16) ? (w[i] || 0) : ((w[i - 16] || 0) + s0 + (w[i - 7] || 0) + s1) | 0;

      const a = hash[0], e = hash[4];
      const sA = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]);
      const t2 = (sA + maj) | 0;
      const sE = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & hash[5]) ^ ((~e) & hash[6]);
      const t1 = (hash[7] + sE + ch + k[i] + w[i]) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + t1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (t1 + t2) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/** Compute SHA-256 hash of a code for secure verification */
export async function hashAccessCode(code: string): Promise<string> {
  const clean = code.trim().toUpperCase().replace(/\s+/g, '');
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    try {
      const data = new TextEncoder().encode(clean);
      const hashBuf = await crypto.subtle.digest('SHA-256', data);
      const hashArr = Array.from(new Uint8Array(hashBuf));
      return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {}
  }
  return fallbackSha256(clean);
}

/** Verify if an entered code matches the stored code hash and optional email pairing */
export async function verifyAccessCode(
  enteredCode: string,
  codeHash: string,
  maskedCode?: string,
  enteredEmail?: string,
  inviteeEmail?: string
): Promise<boolean> {
  const cleanEntered = enteredCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanMasked = (maskedCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  const codeMatches = (cleanMasked && cleanEntered === cleanMasked);
  if (!codeMatches) {
    const enteredHash = await hashAccessCode(cleanEntered);
    if (enteredHash !== codeHash) return false;
  }

  if (inviteeEmail && enteredEmail) {
    if (enteredEmail.trim().toLowerCase() !== inviteeEmail.trim().toLowerCase()) {
      return false;
    }
  }

  return true;
}

/** Construct a mailto: link for the inviter to send the email containing the masked access code */
export function buildShareEmailDraft(invite: ShareInvite): string {
  const subject = encodeURIComponent(`Invitation to share "${invite.targetEmoji} ${invite.targetName}" on Moneypot`);
  const body = encodeURIComponent(
    `Hi,\n\n` +
    `I've invited you to collaborate on the ${invite.targetType === 'pot' ? 'spending pot' : 'savings stash'} "${invite.targetEmoji} ${invite.targetName}" in Moneypot.\n\n` +
    `Your one-off masked access code is:\n` +
    `${invite.maskedCode}\n\n` +
    `To accept and view this shared ${invite.targetType}:\n` +
    `1. Open Moneypot: moneypot://invite?code=${invite.maskedCode}\n` +
    `2. Confirm with your email and code.\n\n` +
    `Cheers!`
  );
  return `mailto:${encodeURIComponent(invite.inviteeEmail)}?subject=${subject}&body=${body}`;
}
