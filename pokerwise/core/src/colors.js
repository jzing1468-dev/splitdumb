// @pokerwise/core — colors.js

const PLAYER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#78716c', '#0ea5e9', '#84cc16'
];

export function nameToColor(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}

export function nextColor(count) {
  return PLAYER_COLORS[count % PLAYER_COLORS.length];
}