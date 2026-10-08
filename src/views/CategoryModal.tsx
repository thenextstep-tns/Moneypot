import { useState } from 'react';
import { uid, useData } from '../store';
import type { Category, Kind } from '../types';
import { Field, Modal, Seg } from '../ui';
import { EmojiPicker } from '../emojis';
import { SharingModal } from './SharingModal';

export function CategoryModal({ category, defaultKind = 'expense', onClose }: { category?: Category; defaultKind?: Kind; onClose: () => void }) {
  const { save, remove, plans } = useData();
  const [showSharing, setShowSharing] = useState(false);
  const [c, setC] = useState<Category>(category ?? {
    id: uid(),
    name: '',
    emoji: '🫙',
    color: '#6C8EF5',
    kind: defaultKind,
    subcategories: [],
  });
  const [newSub, setNewSub] = useState('');


  const set = (patch: Partial<Category>) => setC(x => ({ ...x, ...patch }));

  const addSub = () => {
    const val = newSub.trim();
    if (!val) return;
    const existing = c.subcategories ?? [];
    if (!existing.includes(val)) {
      set({ subcategories: [...existing, val] });
    }
    setNewSub('');
  };

  const removeSub = (sub: string) => {
    set({ subcategories: (c.subcategories ?? []).filter(s => s !== sub) });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSub();
    }
  };

  const submit = () => {
    if (!c.name.trim()) return;
    save('categories', { ...c, name: c.name.trim() });
    onClose();
  };

  const hasPlans = plans.some(p => p.categoryId === c.id);

  return (
    <Modal title={category ? `Edit pot “${c.name}”` : 'Create a new pot'} onClose={onClose}>
      <Seg
        value={c.kind}
        onChange={k => set({ kind: k })}
        options={[['expense', '💸 Expense'], ['income', '💰 Income'], ['saving', '🌱 Saving']]}
      />

      <Field label="Pot name">
        <input
          autoFocus
          value={c.name}
          placeholder="e.g. Food, Subscriptions, Wellness…"
          onChange={e => set({ name: e.target.value })}
        />
      </Field>

      <Field label="Icon">
        <EmojiPicker value={c.emoji} onChange={emoji => set({ emoji })} />
      </Field>

      <div className="row">
        <Field label="Colour">
          <input type="color" value={c.color} onChange={e => set({ color: e.target.value })} />
        </Field>
      </div>

      <Field label="Subcategories" hint="Break this pot down into specific things (press Enter to add)">
        <div className="subcat-input-row">
          <input
            value={newSub}
            placeholder="e.g. Groceries, Coffee, Deliveries…"
            onChange={e => setNewSub(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="btn" onClick={addSub}>+ Add</button>
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {(c.subcategories ?? []).map(s => (
            <span key={s} className="chip subcat-chip">
              {s}
              <button type="button" className="subcat-del" onClick={() => removeSub(s)}>✕</button>
            </span>
          ))}
          {(!c.subcategories || c.subcategories.length === 0) && (
            <small className="muted">No subcategories yet. Add some above!</small>
          )}
        </div>
      </Field>

      <button className="btn primary wide" disabled={!c.name.trim()} onClick={submit}>
        {category ? 'Save changes' : 'Create pot'}
      </button>

      {category && (
        <button
          type="button"
          className="btn dashed wide"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={() => setShowSharing(true)}
        >
          <span>👥</span>
          <span>Share pot with others {c.sharedWith?.length ? `(${c.sharedWith.length})` : ''}</span>
        </button>
      )}

      {category && (
        <button
          className="btn ghost wide danger"
          onClick={() => {
            if (hasPlans && !confirm(`This pot is used by planned expenses. Delete anyway?`)) return;
            remove('categories', category.id);
            onClose();
          }}
        >
          Delete pot
        </button>
      )}

      {showSharing && (
        <SharingModal type="pot" item={c} onClose={() => setShowSharing(false)} />
      )}
    </Modal>
  );
}

