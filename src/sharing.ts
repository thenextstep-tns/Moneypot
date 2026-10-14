import type { ShareInvite, Stash } from './types';

/** Determine if a stash is shared across users or collective */
export function isSharedStash(
  s?: Partial<Stash> | null,
  currentUserId?: string | null,
  currentUserEmail?: string | null
): boolean {
  if (!s) return false;
  if (s.name?.toLowerCase().trim() === 'kinky fund') return true;
  if (s.isShared) return true;
  if (Array.isArray(s.sharedWith) && s.sharedWith.length > 0) return true;
  if (Array.isArray(s.invitedEmails) && s.invitedEmails.length > 0) return true;
  if (s.ownerId && currentUserId && s.ownerId !== currentUserId && currentUserId !== 'local') return true;
  if (s.ownerEmail && currentUserEmail && s.ownerEmail.toLowerCase() !== currentUserEmail.toLowerCase()) return true;
  return false;
}

/** Generate a formatted, human-friendly one-off masked access code (e.g. MP-8492-31) */
export function generateMaskedCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const rand = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `MP-${rand(4)}-${rand(2)}`;
}

/** Compute SHA-256 hash of a code for secure verification */
export async function hashAccessCode(code: string): Promise<string> {
  const clean = code.trim().toUpperCase().replace(/\s+/g, '');
  const data = new TextEncoder().encode(clean);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
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
    `1. Open Moneypot: https://thenextstep-tns.github.io/Moneypot/?accept=${invite.id}&code=${invite.maskedCode}\n` +
    `2. Confirm with your email and code.\n\n` +
    `Cheers!`
  );
  return `mailto:${encodeURIComponent(invite.inviteeEmail)}?subject=${subject}&body=${body}`;
}
