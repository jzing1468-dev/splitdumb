"use strict";
function validateGroupName(name) { if (!name || name.trim().length === 0 || name.length > 50) return 'Group name must be 1-50 characters'; return null; }
function validateMemberName(name) { if (!name || name.trim().length === 0 || name.length > 30) return 'Member name must be 1-30 characters'; return null; }
function validateExpense(data) {
  if (!data.description || data.description.trim().length === 0) return 'Description is required';
  if (!data.amount || data.amount <= 0) return 'Amount must be greater than $0';
  if (!data.payer_id) return 'Payer is required';
  if (!data.split_type) return 'Split type is required';
  return null;
}
function validateSettlement(fromId, toId, amount) {
  if (!fromId || !toId) return 'Both parties are required';
  if (fromId === toId) return 'Cannot settle with yourself';
  if (!amount || amount <= 0) return 'Amount must be greater than $0';
  return null;
}
module.exports = { validateGroupName, validateMemberName, validateExpense, validateSettlement };
