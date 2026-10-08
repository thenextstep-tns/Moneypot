import { useState } from 'react';
import { useData, uid } from '../store';
import { buildShareEmailDraft, generateMaskedCode, hashAccessCode, verifyAccessCode } from '../sharing';
import type { Category, ShareInvite, Stash } from '../types';
import { Field, Modal } from '../ui';

interface SharingModalProps {
  type: 'pot' | 'stash';
  item: Category | Stash;
  onClose: () => void;
}

export function SharingModal({ type, item, onClose }: { type: 'pot' | 'stash'; item: Category | Stash; onClose: () => void }) {
  const { user, invites, save } = useData();
  const [email, setEmail] = useState('');
  const [createdInvite, setCreatedInvite] = useState<ShareInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const members = item.sharedWith ?? [];
  const myEmail = user?.email ?? 'you';

  const handleInvite = async () => {
    setErr('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErr('Please enter a valid email address.');
      return;
    }
    if (user?.email && cleanEmail === user.email.toLowerCase()) {
      setErr("You can't invite your own email address.");
      return;
    }
    if (members.map(m => m.toLowerCase()).includes(cleanEmail)) {
      setErr(`${cleanEmail} is already a member.`);
      return;
    }

    const maskedCode = generateMaskedCode();
    const codeHash = await hashAccessCode(maskedCode);

    const invite: ShareInvite = {
      id: uid(),
      ownerId: user?.uid ?? 'local',
      targetType: type,
      targetId: item.id,
      targetName: item.name,
      targetEmoji: item.emoji,
      inviterEmail: user?.email ?? 'anonymous',
      inviterName: user?.displayName ?? undefined,
      inviteeEmail: cleanEmail,
      maskedCode,
      codeHash,
      status: 'pending',
      createdAt: Date.now(),
    };

    save('invites', invite);
    setCreatedInvite(invite);
    setEmail('');
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Modal title={`Share ${item.emoji} ${item.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--mute)' }}>
            Share this {type === 'pot' ? 'pot' : 'stash'} with another person. They will see its progress and transactions in their Moneypot.
          </p>
        </div>

        {/* Current members */}
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase' }}>
            Active Collaborators
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            <div className="item" style={{ margin: 0, padding: '8px 12px' }}>
              <div className="emoji" style={{ width: 28, height: 28, fontSize: 14 }}>👤</div>
              <div className="grow">
                <div className="title" style={{ fontSize: 13 }}>{item.ownerEmail ?? myEmail}</div>
                <div className="sub" style={{ fontSize: 11 }}>Owner (Creator)</div>
              </div>
            </div>
            {members.map(m => (
              <div key={m} className="item" style={{ margin: 0, padding: '8px 12px' }}>
                <div className="emoji" style={{ width: 28, height: 28, fontSize: 14 }}>👥</div>
                <div className="grow">
                  <div className="title" style={{ fontSize: 13 }}>{m}</div>
                  <div className="sub" style={{ fontSize: 11 }}>Collaborator</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite section */}
        {!createdInvite ? (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase' }}>
              Invite a new collaborator
            </span>
            <Field label="Specific email address" hint="🔒 Auto-fill is disabled to prevent griefing. Type the full address.">
              <input
                type="email"
                value={email}
                placeholder="partner@example.com"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                onChange={e => setEmail(e.target.value)}
              />
            </Field>

            {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 4 }}>{err}</div>}

            <button
              type="button"
              className="btn primary wide"
              style={{ marginTop: 10 }}
              disabled={!email || !email.includes('@')}
              onClick={handleInvite}
            >
              Generate secure invite code
            </button>
          </div>
        ) : (
          <div style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontWeight: 600 }}>
              <span>✉️</span>
              <span>Invite generated for {createdInvite.inviteeEmail}</span>
            </div>

            <p style={{ margin: '8px 0 12px', fontSize: 13, color: '#15803D' }}>
              Your collaborator must confirm using this one-off masked access code in their email:
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '10px 14px', borderRadius: 10, border: '1px solid #86EFAC' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: 2, color: '#166534' }}>
                {createdInvite.maskedCode}
              </span>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 13, fontWeight: 600 }}
                onClick={() => copyCode(createdInvite.maskedCode)}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <a
                href={buildShareEmailDraft(createdInvite)}
                className="btn primary"
                style={{ flex: 1, textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                ✉️ Send via email
              </a>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setCreatedInvite(null)}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Modal to accept a shared pot or stash using a one-off masked access code */
export function AcceptInviteModal({ initialInviteId, initialCode, onClose }: { initialInviteId?: string; initialCode?: string; onClose: () => void }) {
  const { user, invites, categories, stashes, save } = useData();
  const [code, setCode] = useState(initialCode ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const submit = async () => {
    setStatus('idle');
    setMsg('');
    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanCode) {
      setMsg('Please enter the masked code.');
      setStatus('error');
      return;
    }

    // Find invite matching code
    let found: ShareInvite | undefined = undefined;
    for (const inv of invites) {
      if (inv.status !== 'accepted' && (await verifyAccessCode(cleanCode, inv.codeHash, inv.maskedCode))) {
        found = inv;
        break;
      }
    }

    if (!found) {
      // Check if code itself starts with MP-
      if (!cleanCode.startsWith('MP-') && !cleanCode.startsWith('MP')) {
        setMsg('Invalid code format. Codes look like MP-XXXX-XX.');
        setStatus('error');
        return;
      }
      setMsg('Invite code not found or already used. Please double-check with the sender.');
      setStatus('error');
      return;
    }

    // Accept invite
    const acceptedEmail = email.trim().toLowerCase() || user?.email?.toLowerCase() || 'collaborator';
    save('invites', { ...found, status: 'accepted' });

    // Link target pot or stash
    if (found.targetType === 'pot') {
      const cat = categories.find(c => c.id === found?.targetId);
      if (cat) {
        const nextShared = Array.from(new Set([...(cat.sharedWith ?? []), acceptedEmail]));
        save('categories', { ...cat, sharedWith: nextShared });
      }
    } else {
      const s = stashes.find(x => x.id === found?.targetId);
      if (s) {
        const nextShared = Array.from(new Set([...(s.sharedWith ?? []), acceptedEmail]));
        save('stashes', { ...s, sharedWith: nextShared });
      }
    }

    setStatus('success');
    setMsg(`🎉 You have successfully joined the shared ${found.targetType} "${found.targetEmoji} ${found.targetName}"!`);
  };

  return (
    <Modal title="Accept Shared Pot or Stash" onClose={onClose}>
      {status === 'success' ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <h3 style={{ margin: '12px 0 6px' }}>Welcome aboard!</h3>
          <p style={{ color: 'var(--mute)', fontSize: 14 }}>{msg}</p>
          <button type="button" className="btn primary wide" style={{ marginTop: 14 }} onClick={onClose}>
            Open Moneypot
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: 'var(--mute)', fontSize: 13, margin: 0 }}>
            Enter the one-off masked access code received from your collaborator in your email.
          </p>

          {!user?.email && (
            <Field label="Your email address" hint="🔒 Without autofill for security">
              <input
                type="email"
                value={email}
                placeholder="your.email@example.com"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                onChange={e => setEmail(e.target.value)}
              />
            </Field>
          )}

          <Field label="One-off masked access code" hint="e.g. MP-8492-31">
            <input
              type="text"
              value={code}
              placeholder="MP-XXXX-XX"
              style={{ textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 1.5, fontSize: 16 }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              onChange={e => setCode(e.target.value)}
            />
          </Field>

          {status === 'error' && (
            <div style={{ color: 'var(--bad)', fontSize: 13, background: '#FDECEC', padding: '8px 12px', borderRadius: 8 }}>
              {msg}
            </div>
          )}

          <button type="button" className="btn primary wide" disabled={!code} onClick={submit}>
            ✓ Confirm and accept
          </button>
        </div>
      )}
    </Modal>
  );
}
