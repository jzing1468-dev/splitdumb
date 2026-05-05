// @splitdumb/core — colors.js

const NAME_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#78716c', '#0ea5e9', '#84cc16'
];

const GROUP_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f97316',
  '#8b5cf6', '#eab308', '#06b6d4', '#ec4899',
  '#14b8a6', '#d946ef', '#84cc16', '#f43f5e',
  '#6366f1', '#a855f7', '#0ea5e9', '#78716c'
];

export function nameToColor(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return NAME_COLORS[hash % NAME_COLORS.length];
}

export function nextColorForGroup(currentMemberCount) {
  return GROUP_COLORS[currentMemberCount % GROUP_COLORS.length];
}