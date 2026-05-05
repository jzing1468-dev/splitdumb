"use strict";
const CATEGORIES = ['groceries','dining','transport','accommodation','entertainment','utilities','health'];
const CATEGORY_MAP = {
  groceries: { label: '🛒 Groceries', color: 'var(--green)' },
  dining: { label: '🍽 Dining', color: 'var(--amber)' },
  transport: { label: '🚗 Transport', color: '#3b82f6' },
  accommodation: { label: '🏠 Accommodation', color: 'var(--primary)' },
  entertainment: { label: '🎉 Entertainment', color: 'var(--pink)' },
  utilities: { label: '⚡ Utilities', color: 'var(--cyan)' },
  health: { label: '💊 Health', color: 'var(--red)' },
};
module.exports = { CATEGORIES, CATEGORY_MAP };
