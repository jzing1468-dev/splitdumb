// @splitdumb/core — barrel export
export { calculateSplits, buildNightsData, CATEGORIES as SPLIT_CATEGORIES } from './splits.js';
export { calculateSimplifiedDebts } from './debts.js';
export { nameToColor, nextColorForGroup } from './colors.js';
export { validateGroupName, validateMemberName, validateExpense, validateSettlement } from './validators.js';
export { CATEGORIES, CATEGORY_MAP } from './categories.js';