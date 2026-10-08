import { useState } from 'react';
import { collectionGroup, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
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
  const { user, invites, categories, save } = useData();
  const [email, setEmail] = useState('');
  const [createdInvite, setCreatedInvite] = useState<ShareInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const stashItem = type === 'stash' ? (item as Stash) : null;
  const expenseCats = categories.filter(c => c.kind === 'expense');
  const savingCats = categories.filter(c => c.kind === 'saving');
  const [selectedPotId, setSelectedPotId] = useState<string>(
    stashItem?.categoryId && stashItem.categoryId !== 'savings'
      ? stashItem.categoryId
      : (expenseCats[0]?.id || savingCats[0]?.id || '')
  );

  const members = item.sharedWith ?? [];
  const myEmail = user?.email ?? 'you';

  const handleInvite = async () => {
    setErr('');
    if (type === 'stash' && !selectedPotId) {
      setErr('Please select an associated pot for this shared stash before inviting collaborators.');
      return;
    }
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

    // If sharing a stash, ensure isInstantAccess is false and associated pot is saved
    let targetItemData = item;
    if (type === 'stash' && stashItem) {
      const updatedStash: Stash = {
        ...stashItem,
        isInstantAccess: false,
        categoryId: selectedPotId,
        subcategory: stashItem.subcategory || stashItem.name,
      };
      save('stashes', updatedStash);
      targetItemData = updatedStash;
    }

    const maskedCode = generateMaskedCode();
    const codeHash = await hashAccessCode(maskedCode);
    const codeKey = maskedCode.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const invite: ShareInvite = {
      id: uid(),
      ownerId: user?.uid ?? 'local',
      targetType: type,
      targetId: item.id,
      targetName: item.name,
      targetEmoji: item.emoji,
      targetData: targetItemData,
      inviterEmail: user?.email ?? 'anonymous',
      inviterName: user?.displayName ?? undefined,
      inviteeEmail: cleanEmail,
      maskedCode,
      codeKey,
      codeHash,
      status: 'pending',
      createdAt: Date.now(),
    };

    save('invites', invite);

    // Save to shared root invites collection for instant cross-user code lookup
    if (db) {
      try {
        await setDoc(doc(db, 'invites', codeKey), invite);
        await setDoc(doc(db, 'invites', maskedCode), invite);
        await setDoc(doc(db, 'invites', invite.id), invite);
      } catch (e) {
        console.warn('Could not write to root invites:', e);
      }
    }

    try {
      const stored = JSON.parse(localStorage.getItem('moneypot-shared-invites') || '[]');
      stored.push(invite);
      localStorage.setItem('moneypot-shared-invites', JSON.stringify(stored));
    } catch {}

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
            {type === 'stash' && (
              <div style={{ marginBottom: 14, background: '#F8FAFC', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  Associated Pot (Required for Shared Stash)
                </span>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--mute)' }}>
                  Shared stashes cannot be general instant access stashes. Select which Pot expenses from this stash will belong to:
                </p>
                <select
                  value={selectedPotId}
                  onChange={e => setSelectedPotId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }}
                >
                  <optgroup label="💸 Expense Pots">
                    {expenseCats.map(c => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🌱 Savings Pots">
                    {savingCats.map(c => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

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
  const { user, invites, categories, stashes, accounts, settings, save } = useData();
  const [code, setCode] = useState(initialCode ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const submit = async () => {
    setStatus('idle');
    setMsg('');
    const raw = code.trim().toUpperCase();
    const stripped = raw.replace(/[^A-Z0-9]/g, '');
    if (!stripped) {
      setMsg('Please enter the masked access code.');
      setStatus('error');
      return;
    }

    setLoading(true);

    try {
      // Reconstruct standard masked format if prefixed with MP
      const standardMasked = stripped.startsWith('MP') && stripped.length >= 8
        ? `MP-${stripped.slice(2, 6)}-${stripped.slice(6)}`
        : raw;

      let found: ShareInvite | undefined = undefined;

      // 1. Search current user's locally synced invites
      for (const inv of invites) {
        const invStripped = (inv.maskedCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (invStripped === stripped || (await verifyAccessCode(stripped, inv.codeHash, inv.maskedCode))) {
          found = inv;
          break;
        }
      }

      // 2. Query Firestore root /invites collection
      if (!found && db) {
        try {
          const keysToTry = [stripped, standardMasked, raw];
          if (initialInviteId) keysToTry.push(initialInviteId);
          for (const key of keysToTry) {
            const snap = await getDoc(doc(db, 'invites', key));
            if (snap.exists()) {
              found = snap.data() as ShareInvite;
              break;
            }
          }
        } catch (e) {
          console.warn('Error reading root invites:', e);
        }
      }

      // 3. Fallback: Search all invites across collections in Firestore
      if (!found && db) {
        try {
          const snap = await getDocs(collectionGroup(db, 'invites'));
          for (const d of snap.docs) {
            const inv = d.data() as ShareInvite;
            const invStripped = (inv.maskedCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (invStripped === stripped || (await verifyAccessCode(stripped, inv.codeHash, inv.maskedCode))) {
              found = inv;
              break;
            }
          }
        } catch (e) {
          console.warn('Error querying collectionGroup invites:', e);
        }
      }

      // 4. LocalStorage demo fallback
      if (!found) {
        try {
          const localList: ShareInvite[] = JSON.parse(localStorage.getItem('moneypot-shared-invites') || '[]');
          for (const inv of localList) {
            const invStripped = (inv.maskedCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (invStripped === stripped || (await verifyAccessCode(stripped, inv.codeHash, inv.maskedCode))) {
              found = inv;
              break;
            }
          }
        } catch {}
      }

      // Validate candidate email is provided
      const candidateEmail = (user?.email || email).trim().toLowerCase();
      if (!candidateEmail) {
        setMsg('Please provide your email address to verify this invite code.');
        setStatus('error');
        setLoading(false);
        return;
      }

      const genericError = 'Invite code not found, already used, or not valid for this email address. Please double-check with the sender.';

      if (!found) {
        setMsg(genericError);
        setStatus('error');
        setLoading(false);
        return;
      }

      // 1. One-time use validation
      if (found.status === 'accepted') {
        setMsg(genericError);
        setStatus('error');
        setLoading(false);
        return;
      }

      // 2. Strict email pairing validation (generic error to prevent email enumeration)
      if (found.inviteeEmail) {
        const expectedEmail = found.inviteeEmail.trim().toLowerCase();
        if (candidateEmail !== expectedEmail) {
          setMsg(genericError);
          setStatus('error');
          setLoading(false);
          return;
        }
      }

      const acceptedEmail = candidateEmail;
      const now = Date.now();
      const updatedInvite: ShareInvite = {
        ...found,
        status: 'accepted',
        acceptedByEmail: acceptedEmail,
        acceptedByUid: user?.uid ?? 'local',
        acceptedAt: now,
      };

      // Save accepted status in current user store
      save('invites', updatedInvite);

      // Invalidate/consume code in root invites doc and owner's invites doc
      if (db) {
        try {
          await setDoc(doc(db, 'invites', stripped), updatedInvite, { merge: true });
          await setDoc(doc(db, 'invites', standardMasked), updatedInvite, { merge: true });
          if (found.ownerId) {
            await setDoc(doc(db, 'users', found.ownerId, 'invites', found.id), updatedInvite, { merge: true });
          }
        } catch (e) {
          console.warn('Could not update invite in firestore:', e);
        }
      }

      // Fetch latest target data from master doc if available
      let masterData: any = found.targetData ?? null;
      if (db && found.ownerId && found.targetId) {
        try {
          const coll = found.targetType === 'pot' ? 'categories' : 'stashes';
          const snap = await getDoc(doc(db, 'users', found.ownerId, coll, found.targetId));
          if (snap.exists()) {
            masterData = snap.data();
          }
        } catch (e) {
          console.warn('Could not read master doc from owner:', e);
        }
      }

      const currentShared = Array.isArray(masterData?.sharedWith) ? masterData.sharedWith : [];
      const nextShared = Array.from(new Set([...currentShared, acceptedEmail, found.inviterEmail]));

      // Update master doc on the creator/owner account with nextShared
      if (db && found.ownerId && found.targetId) {
        try {
          const coll = found.targetType === 'pot' ? 'categories' : 'stashes';
          await setDoc(doc(db, 'users', found.ownerId, coll, found.targetId), {
            ...(masterData ?? {}),
            sharedWith: nextShared,
            ownerEmail: found.inviterEmail,
          }, { merge: true });
        } catch (e) {
          console.warn('Could not update owner doc with collaborator:', e);
        }
      }

      // Add the shared item into the invitee's own library
      if (found.targetType === 'pot') {
        const newCat: Category = {
          id: found.targetId,
          name: masterData?.name ?? found.targetName,
          emoji: masterData?.emoji ?? found.targetEmoji,
          color: masterData?.color ?? '#2FA36B',
          kind: masterData?.kind ?? 'expense',
          hints: masterData?.hints,
          subcategories: masterData?.subcategories,
          sharedWith: nextShared,
          ownerEmail: found.inviterEmail,
          ownerId: found.ownerId,
        };
        save('categories', newCat);
      } else {
        const newStash: Stash = {
          id: found.targetId,
          name: masterData?.name ?? found.targetName,
          emoji: masterData?.emoji ?? found.targetEmoji,
          target: masterData?.target ?? 0,
          currency: masterData?.currency ?? settings.currency,
          startAmount: masterData?.startAmount ?? 0,
          deadline: masterData?.deadline,
          accountId: accounts[0]?.id,
          sharedWith: nextShared,
          ownerEmail: found.inviterEmail,
          ownerId: found.ownerId,
          categoryId: masterData?.categoryId,
          subcategory: masterData?.subcategory,
          isInstantAccess: false,
        };
        save('stashes', newStash);
      }

      setStatus('success');
      setMsg(`🎉 You have successfully joined the shared ${found.targetType} "${found.targetEmoji} ${found.targetName}"!`);
    } catch (e: any) {
      setMsg(e.message || 'Failed to accept invite. Please try again.');
      setStatus('error');
    } finally {
      setLoading(false);
    }
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

          {user?.email ? (
            <div style={{ fontSize: 13, background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', padding: '10px 14px', borderRadius: 12 }}>
              🔒 Signed in as: <b>{user.email}</b><br />
              <span style={{ fontSize: 11, color: '#2563EB' }}>Codes are paired to specific email addresses and can only be used once.</span>
            </div>
          ) : (
            <Field label="Your email address" hint="🔒 Must match the exact email address the invite was sent to">
              <input
                type="email"
                value={email}
                placeholder="partner@example.com"
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

          <button
            type="button"
            className="btn primary wide"
            disabled={!code || (!user?.email && !email) || loading}
            onClick={submit}
          >
            {loading ? 'Verifying code...' : '✓ Confirm and accept'}
          </button>
        </div>
      )}
    </Modal>
  );
}
