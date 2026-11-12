import { useEffect, useState } from 'react';
import { useData } from '../store';
import { buildShareEmailDraft, isEmail } from '../sharing';
import type { Category, ShareInvite, Stash } from '../types';
import { Field, Modal } from '../ui';

const APP_URL = 'https://thenextstep-tns.github.io/Moneypot/';

const box = (kind: 'good' | 'bad' | 'info' | 'plain') => ({
  background: kind === 'plain' ? 'var(--surface-2)' : `var(--${kind}-bg)`,
  border: `1px solid ${kind === 'plain' ? 'var(--line)' : `var(--${kind}-line)`}`,
  color: kind === 'plain' ? 'var(--ink)' : `var(--${kind}-ink)`,
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 13,
});

/** Share a pot or stash: invite people by email with a one-time code, manage members */
export function SharingModal({ type, item, onClose }: { type: 'pot' | 'stash'; item: Category | Stash; onClose: () => void }) {
  const { user, canShare, categories, sharedItems, save, remove, inviteToShared, listInvites, revokeInvite, removeSharedMember } = useData();
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<{ code: string; invite: ShareInvite } | null>(null);
  const [pending, setPending] = useState<ShareInvite[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const shared = item.sharedId ? sharedItems.find(s => s.id === item.sharedId) : undefined;
  const isOwner = !item.isForeignOwned;
  const stashItem = type === 'stash' ? (item as Stash) : null;
  const expenseCats = categories.filter(c => c.kind === 'expense');
  const savingCats = categories.filter(c => c.kind === 'saving');
  const [selectedPotId, setSelectedPotId] = useState<string>(
    stashItem?.categoryId && stashItem.categoryId !== 'savings' ? stashItem.categoryId : expenseCats[0]?.id || savingCats[0]?.id || ''
  );

  const refreshInvites = () => {
    if (item.sharedId && isOwner && canShare) listInvites(item.sharedId).then(setPending).catch(() => setPending([]));
  };
  useEffect(refreshInvites, [item.sharedId, isOwner, canShare]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canShare) {
    return (
      <Modal title={`Share ${item.emoji} ${item.name}`} onClose={onClose}>
        <p style={{ color: 'var(--mute)', fontSize: 14 }}>
          Sharing needs a Moneypot account so that only the people you invite can see this {type}. Sign in (instead of demo mode) to share.
        </p>
      </Modal>
    );
  }

  const handleInvite = async () => {
    setErr('');
    const cleanEmail = email.trim().toLowerCase();
    if (type === 'stash' && !selectedPotId) return setErr('Please choose the pot that expenses from this shared stash belong to.');
    if (!isEmail(cleanEmail)) return setErr('Please enter a valid email address.');
    if (user?.email && cleanEmail === user.email.toLowerCase()) return setErr("You can't invite yourself.");
    if ((item.sharedWith ?? []).map(m => m.toLowerCase()).includes(cleanEmail)) return setErr(`${cleanEmail} is already a member.`);
    setBusy(true);
    try {
      let target: Category | Stash = item;
      if (type === 'stash' && stashItem && stashItem.categoryId !== selectedPotId) {
        target = { ...stashItem, categoryId: selectedPotId, subcategory: stashItem.subcategory || stashItem.name };
        save('stashes', target as Stash);
      }
      const res = await inviteToShared(type, target, cleanEmail);
      setCreated(res);
      setEmail('');
      refreshInvites();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the invite. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = (code: string) => {
    if (!navigator.clipboard) return setErr('Copy is not available here — select the code and copy it manually.');
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      },
      () => setErr('Copy failed — select the code and copy it manually.')
    );
  };

  const memberRows = shared
    ? shared.memberIds.map(uid => ({ uid, email: shared.members?.[uid]?.name || shared.members?.[uid]?.email || 'Member', isOwnerRow: uid === shared.ownerId }))
    : [{ uid: user?.uid ?? 'me', email: user?.email ?? 'You', isOwnerRow: true }];

  return (
    <Modal title={`Share ${item.emoji} ${item.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)' }}>
          People you invite see this {type === 'pot' ? 'pot' : 'stash'} and the records added to it. They never see your accounts or other pots.
        </p>

        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase' }}>Members</span>
          <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {memberRows.map(m => (
              <li key={m.uid} className="item" style={{ margin: 0, padding: '8px 12px' }}>
                <div className="emoji" aria-hidden="true" style={{ width: 28, height: 28, fontSize: 14 }}>{m.isOwnerRow ? '👤' : '👥'}</div>
                <div className="grow">
                  <div className="title" style={{ fontSize: 13 }}>{m.uid === user?.uid ? `${m.email} (you)` : m.email}</div>
                  <div className="sub" style={{ fontSize: 11 }}>{m.isOwnerRow ? 'Owner' : 'Member'}</div>
                </div>
                {isOwner && !m.isOwnerRow && shared && (
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => {
                      if (!confirm(`Remove ${m.email} from this ${type}? They will no longer see it.`)) return;
                      removeSharedMember(shared.id, m.uid).catch(e => setErr(e.message));
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
            {(shared?.invitedEmails ?? []).map(e => (
              <li key={e} className="item" style={{ margin: 0, padding: '8px 12px', opacity: 0.75 }}>
                <div className="emoji" aria-hidden="true" style={{ width: 28, height: 28, fontSize: 14 }}>⏳</div>
                <div className="grow">
                  <div className="title" style={{ fontSize: 13 }}>{e}</div>
                  <div className="sub" style={{ fontSize: 11 }}>Was shared before — joins automatically when they open the new version</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {isOwner && pending.length > 0 && (
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase' }}>Pending invites</span>
            <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pending.map(inv => (
                <li key={inv.id} style={{ ...box('plain'), display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1 }}>
                    {inv.inviteeEmail || 'Anyone with the code'} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </span>
                  <button type="button" className="btn ghost" style={{ fontSize: 12 }} onClick={() => revokeInvite(inv.id).then(refreshInvites).catch(e => setErr(e.message))}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isOwner ? (
          <div style={box('info')}>
            Only the owner can invite people. You can leave this {type} at any time.
            <button
              type="button"
              className="btn ghost wide danger"
              style={{ marginTop: 10 }}
              onClick={() => {
                if (!confirm(`Leave "${item.name}"? It will disappear from your Moneypot.`)) return;
                remove(type === 'pot' ? 'categories' : 'stashes', item.id);
                onClose();
              }}
            >
              Leave shared {type}
            </button>
          </div>
        ) : !created ? (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            {type === 'stash' && (
              <div style={{ ...box('plain'), marginBottom: 14 }}>
                <label htmlFor="share-pot" style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  Pot for expenses from this stash
                </label>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--mute)' }}>
                  Shared stashes can't be instant-access stashes. Choose which of your pots spending from this stash counts towards:
                </p>
                <select id="share-pot" value={selectedPotId} onChange={e => setSelectedPotId(e.target.value)} style={{ width: '100%' }}>
                  <optgroup label="💸 Expense pots">
                    {expenseCats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </optgroup>
                  <optgroup label="🌱 Savings pots">
                    {savingCats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </optgroup>
                </select>
              </div>
            )}

            <Field label="Invite by email" hint="Only someone signed in with exactly this email can use the code.">
              <input
                type="email"
                value={email}
                placeholder="partner@example.com"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleInvite(); }}
              />
            </Field>
            {err && <div role="alert" style={{ ...box('bad'), marginTop: 6 }}>{err}</div>}
            <button type="button" className="btn primary wide" style={{ marginTop: 10 }} disabled={busy || !email.trim()} onClick={handleInvite}>
              {busy ? 'Creating invite…' : 'Create invite code'}
            </button>
          </div>
        ) : (
          <div style={box('good')}>
            <div style={{ fontWeight: 600 }}>✉️ Invite created for {created.invite.inviteeEmail}</div>
            <p style={{ margin: '8px 0 12px' }}>
              Send them this code. It works once, only for that email address, and expires in 7 days. It is shown only now.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--good-line)' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: 2, color: 'var(--ink)' }}>{created.code}</span>
              <button type="button" className="btn ghost" style={{ fontSize: 13, fontWeight: 600 }} onClick={() => copyCode(created.code)}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            {err && <div role="alert" style={{ ...box('bad'), marginTop: 8 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <a href={buildShareEmailDraft(created.invite, created.code, APP_URL)} className="btn primary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>
                ✉️ Send via email
              </a>
              <button type="button" className="btn ghost" onClick={() => setCreated(null)}>Done</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Join a shared pot or stash with a one-time invite code */
export function AcceptInviteModal({ initialCode, onClose }: { initialCode?: string; onClose: () => void }) {
  const { user, canShare, accounts, acceptShareCode } = useData();
  const [code, setCode] = useState(initialCode ?? '');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const submit = async () => {
    setMsg('');
    if (!code.trim()) return setMsg('Please enter the invite code.');
    setLoading(true);
    try {
      const item = await acceptShareCode(code, accountId || undefined);
      setDone(`You joined the shared ${item.type} "${String(item.data.emoji ?? '')} ${String(item.data.name ?? '')}".`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not accept the invite. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Join a shared pot or stash" onClose={onClose}>
      {!canShare ? (
        <p style={{ color: 'var(--mute)', fontSize: 14 }}>Sign in with the email address the invite was sent to, then open the invite link again.</p>
      ) : done ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 48 }} aria-hidden="true">🎉</div>
          <h3 style={{ margin: '12px 0 6px' }}>Welcome aboard!</h3>
          <p style={{ color: 'var(--mute)', fontSize: 14 }}>{done}</p>
          <button type="button" className="btn primary wide" style={{ marginTop: 14 }} onClick={onClose}>Open Moneypot</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={box('info')}>
            🔒 Signed in as <b>{user?.email ?? user?.displayName ?? 'you'}</b>. Codes work once and only for the email they were sent to.
          </div>
          <Field label="Invite code" hint="e.g. MP-7KQ2-XH9D">
            <input
              type="text"
              value={code}
              placeholder="MP-XXXX-XXXX"
              style={{ textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 1.5, fontSize: 16 }}
              autoComplete="off"
              spellCheck={false}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            />
          </Field>
          {accounts.length > 0 && (
            <Field label="If it's a stash, keep my share in" hint="You can change this later in the stash settings.">
              <select value={accountId} onChange={e => setAccountId(e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </Field>
          )}
          {msg && <div role="alert" style={box('bad')}>{msg}</div>}
          <button type="button" className="btn primary wide" disabled={!code.trim() || loading} onClick={submit}>
            {loading ? 'Checking code…' : '✓ Join'}
          </button>
        </div>
      )}
    </Modal>
  );
}
