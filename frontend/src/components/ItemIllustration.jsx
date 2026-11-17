import React from 'react';

/**
 * Brand-consistent SVG fallbacks used when a report has no photograph.
 * The palette mirrors the design system (forest + terracotta).
 */
export function ItemIllustration({ iconType = 'generic', imageUrl, alt = '' }) {
  if (imageUrl) {
    return (
      <div className="item-media">
        <img src={imageUrl} alt={alt || 'Reported item photograph'} loading="lazy" />
      </div>
    );
  }

  const art = {
    laptop: (
      <svg width="96" height="68" viewBox="0 0 96 68" fill="none" aria-hidden="true">
        <rect x="14" y="8" width="68" height="44" rx="5" fill="#142822" />
        <rect x="19" y="13" width="58" height="34" rx="2" fill="#1F3D34" />
        <circle cx="48" cy="30" r="6" fill="#D95D39" />
        <path d="M6 54H90L85 60H11L6 54Z" fill="#142822" />
      </svg>
    ),
    bag: (
      <svg width="86" height="72" viewBox="0 0 86 72" fill="none" aria-hidden="true">
        <path d="M30 22V16C30 11.58 33.58 8 38 8H48C52.42 8 56 11.58 56 16V22" stroke="#142822" strokeWidth="4" />
        <rect x="14" y="22" width="58" height="40" rx="8" fill="#B45309" />
        <path d="M14 34H72" stroke="#142822" strokeWidth="3" />
        <rect x="38" y="30" width="10" height="10" rx="2" fill="#FAF9F5" />
      </svg>
    ),
    glasses: (
      <svg width="96" height="54" viewBox="0 0 96 54" fill="none" aria-hidden="true">
        <circle cx="28" cy="28" r="15" stroke="#142822" strokeWidth="4" fill="#FFFFFF" />
        <circle cx="68" cy="28" r="15" stroke="#142822" strokeWidth="4" fill="#FFFFFF" />
        <path d="M43 26C46 23 50 23 53 26" stroke="#D95D39" strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
    headphones: (
      <svg width="84" height="74" viewBox="0 0 84 74" fill="none" aria-hidden="true">
        <path d="M18 42V34C18 20.75 28.75 10 42 10C55.25 10 66 20.75 66 34V42" stroke="#142822" strokeWidth="5" strokeLinecap="round" />
        <rect x="12" y="38" width="12" height="22" rx="6" fill="#D95D39" />
        <rect x="60" y="38" width="12" height="22" rx="6" fill="#D95D39" />
      </svg>
    ),
    keys: (
      <svg width="84" height="68" viewBox="0 0 84 68" fill="none" aria-hidden="true">
        <circle cx="28" cy="28" r="12" stroke="#142822" strokeWidth="4" />
        <path d="M38 34L66 52M56 46L62 40M62 50L68 44" stroke="#D95D39" strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
    book: (
      <svg width="86" height="70" viewBox="0 0 86 70" fill="none" aria-hidden="true">
        <rect x="16" y="10" width="54" height="50" rx="5" fill="#1F3D34" />
        <rect x="24" y="18" width="38" height="6" rx="3" fill="#D95D39" />
        <rect x="24" y="30" width="30" height="4" rx="2" fill="#EFECE4" />
        <rect x="24" y="40" width="34" height="4" rx="2" fill="#EFECE4" />
      </svg>
    ),
    bottle: (
      <svg width="66" height="74" viewBox="0 0 66 74" fill="none" aria-hidden="true">
        <rect x="24" y="6" width="18" height="10" rx="3" fill="#142822" />
        <path d="M20 20H46V62C46 66.42 42.42 70 38 70H28C23.58 70 20 66.42 20 62V20Z" fill="#2A7B6F" />
        <rect x="20" y="38" width="26" height="6" fill="#D95D39" />
      </svg>
    ),
    generic: (
      <svg width="78" height="70" viewBox="0 0 78 70" fill="none" aria-hidden="true">
        <rect x="12" y="14" width="54" height="44" rx="8" stroke="#142822" strokeWidth="4" fill="#EFECE4" />
        <circle cx="30" cy="32" r="5" fill="#D95D39" />
        <path d="M18 52L32 38L44 50L52 42L62 52" stroke="#142822" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  };

  return <div className="item-media">{art[iconType] || art.generic}</div>;
}

export function iconForCategory(category = '') {
  const value = category.toLowerCase();
  if (value.includes('electronic')) return 'laptop';
  if (value.includes('bag') || value.includes('luggage')) return 'bag';
  if (value.includes('accessor') || value.includes('eyewear')) return 'glasses';
  if (value.includes('key') || value.includes('card')) return 'keys';
  if (value.includes('book') || value.includes('lab')) return 'book';
  if (value.includes('cloth') || value.includes('sport')) return 'bag';
  return 'generic';
}
