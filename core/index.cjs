// @splitdumb/core — CJS entry for Node.js consumers (server)
"use strict";

const { calculateSplits, buildNightsData } = require("./src/splits.cjs");
const { calculateSimplifiedDebts } = require("./src/debts.cjs");
const { nameToColor, nextColorForGroup } = require("./src/colors.cjs");
const { validateGroupName, validateMemberName, validateExpense, validateSettlement, validateNote, validateNotePatch,
  validateStay, validateStayPatch, validateTravelPlan, validateTravelPlanPatch,
  validateList, validateListPatch, validateListItem, validateListItemPatch,
  LIST_KINDS, TRAVEL_STATUSES } = require("./src/validators.cjs");
const { CATEGORIES, CATEGORY_MAP } = require("./src/categories.cjs");

module.exports = {
  calculateSplits,
  buildNightsData,
  calculateSimplifiedDebts,
  nameToColor,
  nextColorForGroup,
  validateGroupName,
  validateMemberName,
  validateExpense,
  validateSettlement,
  validateNote,
  validateNotePatch,
  validateStay,
  validateStayPatch,
  validateTravelPlan,
  validateTravelPlanPatch,
  validateList,
  validateListPatch,
  validateListItem,
  validateListItemPatch,
  LIST_KINDS,
  TRAVEL_STATUSES,
  CATEGORIES,
  CATEGORY_MAP,
};