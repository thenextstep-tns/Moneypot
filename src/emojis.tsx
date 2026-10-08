import { useState } from 'react';

export interface EmojiGroup {
  name: string;
  icon: string;
  emojis: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: 'Popular',
    icon: '⭐',
    emojis: ['🏠', '🍎', '🛒', '☕', '🍕', '🚇', '🚗', '💊', '📺', '🎉', '💻', '📱', '💼', '✈️', '🏋️', '🐶', '🪴', '🎁', '👕', '📚', '🎯', '🐷', '🌱', '📈'],
  },
  {
    name: 'Money & Finance',
    icon: '💰',
    emojis: ['💰', '💵', '💶', '💷', '🪙', '💳', '🏦', '🏧', '📈', '📉', '📊', '🏷️', '🧾', '💸', '💎', '👛', '👜', '🧮', '⚖️', '🔐'],
  },
  {
    name: 'Food & Drinks',
    icon: '🍎',
    emojis: ['🍎', '🥑', '🍕', '🍔', '🍣', '🥗', '☕', '🍵', '🍺', '🍷', '🥪', '🥐', '🍜', '🥩', '🛒', '🍩', '🍦', '🌮', '🍛', '🍰', '🍪', '🍫', '🧃', '🍾'],
  },
  {
    name: 'Bills & Living',
    icon: '🏠',
    emojis: ['🏠', '🏡', '🏢', '🔑', '💡', '💧', '⚡', '🔥', '🛋️', '🚿', '🧹', '📦', '🛠️', '🔌', '🚪', '🪟', '🪴', '🛏️', '🧺', '🧼', '🪑', '🕯️', '🧯'],
  },
  {
    name: 'Travel & Commute',
    icon: '🚗',
    emojis: ['🚗', '🚕', '🚌', '🚇', '✈️', '🚲', '🛵', '🚂', '⛽', '🎫', '🧳', '🚢', '🅿️', '🛴', '🚁', '🚤', '🛳️', '🗺️'],
  },
  {
    name: 'Health & Care',
    icon: '💊',
    emojis: ['💊', '🩺', '🏥', '🦷', '🏋️', '🧘', '💈', '🧴', '🧖', '👓', '🏃', '🧼', '🩹', '🌡️', '💆', '🏊'],
  },
  {
    name: 'Fun & Treats',
    icon: '🎉',
    emojis: ['🎉', '📺', '🎮', '🎧', '🎬', '🍿', '🎨', '📚', '🎸', '⚽', '🏖️', '🎟️', '🎲', '🎣', '🎳', '⛺', '🎢', '🎤', '🎹', '🏀'],
  },
  {
    name: 'Sports & Fitness',
    icon: '🏋️',
    emojis: ['🏋️', '⚽', '🏀', '🎾', '🏐', '🏃', '🏊', '🚴', '🧘', '🧗', '🥊', '⛳', '🥋', '🛹', '🎿', '🏸'],
  },
  {
    name: 'Work & Tech',
    icon: '💼',
    emojis: ['💼', '💻', '📱', '🖥️', '⌨️', '⌚', '📷', '🖨️', '🎓', '📄', '🪙', '💳', '📊', '📎', '🖋️', '📁', '🗂️'],
  },
  {
    name: 'Shopping & Style',
    icon: '🛍️',
    emojis: ['🛍️', '👕', '👗', '👟', '💍', '💄', '🎁', '🕶️', '🎒', '👒', '👠', '🩳', '🧥', '🧦', '👜', '💎'],
  },
  {
    name: 'Pets & Family',
    icon: '🐾',
    emojis: ['🐾', '🐱', '🐶', '🐕', '🐈', '🦜', '🐠', '🐹', '🐰', '👶', '🧒', '👧', '👦', '🧑‍🤝‍🧑', '🍼'],
  },
  {
    name: 'Goals & Life',
    icon: '🎯',
    emojis: ['🎯', '🐷', '🛟', '📈', '💎', '🏆', '🌟', '🚀', '🏰', '💍', '✨', '🎓', '🌱', '☀️'],
  },
];

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [activeGroup, setActiveGroup] = useState<string>('Popular');
  const [custom, setCustom] = useState('');

  const currentEmojis = EMOJI_GROUPS.find(g => g.name === activeGroup)?.emojis ?? EMOJI_GROUPS[0].emojis;

  const handleCustom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setCustom(val);
    if (val) {
      onChange(val);
    }
  };

  return (
    <div className="emoji-picker-box">
      {/* Category selector in clear text — wrapping cleanly without horizontal scroll */}
      <div className="emoji-category-pills">
        {EMOJI_GROUPS.map(g => (
          <button
            key={g.name}
            type="button"
            className={`emoji-cat-pill ${activeGroup === g.name ? 'active' : ''}`}
            onClick={() => setActiveGroup(g.name)}
          >
            <span className="emoji-cat-icon">{g.icon}</span>
            <span className="emoji-cat-text">{g.name}</span>
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="emoji-grid-select">
        {currentEmojis.map(e => (
          <button
            key={e}
            type="button"
            className={`emoji-chip-btn ${value === e ? 'active' : ''}`}
            onClick={() => {
              setCustom('');
              onChange(e);
            }}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Custom emoji input */}
      <div className="emoji-custom-row">
        <span className="muted" style={{ fontSize: 12 }}>Or type any emoji:</span>
        <input
          type="text"
          className="emoji-custom-input"
          placeholder="e.g. 🥐"
          value={custom}
          onChange={handleCustom}
          maxLength={4}
        />
        {value && <span style={{ fontSize: 20, marginLeft: 6 }}>{value}</span>}
      </div>
    </div>
  );
}
