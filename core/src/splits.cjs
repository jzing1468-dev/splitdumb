"use strict";
const CATEGORIES = ['groceries', 'dining', 'transport', 'accommodation', 'entertainment', 'utilities', 'health'];

function calculateSplits(type, amount, splitMemberIds, opts = {}) {
  const {
    sharesInput, nightsInput, nightsMode, dateRangeStart, dateRangeEnd,
    numNights, calcMethod, exactAmounts, percentages,
  } = opts;

  const shares = {};
  const roundedAmount = Math.round(amount * 100) / 100;

  if (type === 'equal') {
    const sharePerPerson = Math.round((roundedAmount / splitMemberIds.length) * 100) / 100;
    const totalAllocated = Math.round(sharePerPerson * splitMemberIds.length * 100) / 100;
    const remainder = Math.round((roundedAmount - totalAllocated) * 100) / 100;
    splitMemberIds.forEach((mid, i) => {
      shares[mid] = sharePerPerson + (i < Math.round(remainder * 100) ? 0.01 : 0);
    });
  } else if (type === 'shares') {
    if (!sharesInput) return { shares: {}, error: 'shares required for shares split type' };
    const totalShares = Object.entries(sharesInput)
      .filter(([mid]) => splitMemberIds.includes(mid))
      .reduce((sum, [, s]) => sum + Number(s), 0);
    if (totalShares <= 0) return { shares: {}, error: 'Total shares must be greater than 0' };
    let totalAllocated = 0;
    const included = Object.entries(sharesInput).filter(([mid]) => splitMemberIds.includes(mid));
    included.forEach(([mid, s]) => {
      const shareAmt = Math.round((Number(s) / totalShares) * roundedAmount * 100) / 100;
      shares[mid] = shareAmt;
      totalAllocated += shareAmt;
    });
    const remainder = Math.round((roundedAmount - totalAllocated) * 100) / 100;
    if (remainder > 0) {
      const sortedByShareDesc = [...included].sort((a, b) => Number(b[1]) - Number(a[1]));
      for (let i = 0; i < Math.round(remainder * 100) && i < sortedByShareDesc.length; i++) {
        shares[sortedByShareDesc[i][0]] = Math.round((shares[sortedByShareDesc[i][0]] + 0.01) * 100) / 100;
      }
    }
  } else if (type === 'nights') {
    if (!nightsInput) return { shares: {}, error: 'nights required for nights split type' };
    const nMode = nightsMode || 'dates';
    let nightLabels = [];
    if (!dateRangeStart || !dateRangeEnd) {
      const nNights = numNights || parseInt(Object.keys(nightsInput).filter(k => k.startsWith('Night ')).length) || 0;
      if (nNights <= 0) return { shares: {}, error: 'date range or num_nights required' };
      nightLabels = Array.from({ length: nNights }, (_, i) => `Night ${i + 1}`);
    } else {
      const startDate = new Date(dateRangeStart);
      const endDate = new Date(dateRangeEnd);
      const nNights = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
      if (nNights <= 0) return { shares: {}, error: 'date range must span at least 1 night' };
      for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
        nightLabels.push(d.toISOString().split('T')[0]);
      }
    }
    let occupiedDayCount = 0;
    nightLabels.forEach(label => {
      for (const [mid, labels] of Object.entries(nightsInput)) {
        if (splitMemberIds.includes(mid) && labels.includes(label)) { occupiedDayCount++; break; }
      }
    });
    if (occupiedDayCount === 0) return { shares: {}, error: 'At least one person must be present on at least one day' };
    const nightShares = {};
    const calc = calcMethod || 'proportional';
    if (calc === 'daily') {
      const perDayCost = roundedAmount / occupiedDayCount;
      nightLabels.forEach(label => {
        const presentIds = [];
        for (const [mid, labels] of Object.entries(nightsInput)) {
          if (splitMemberIds.includes(mid) && labels.includes(label)) { presentIds.push(mid); }
        }
        if (presentIds.length === 0) return;
        const sharePerPerson = perDayCost / presentIds.length;
        presentIds.forEach(mid => { nightShares[mid] = (nightShares[mid] || 0) + sharePerPerson; });
      });
      for (const mid of Object.keys(nightShares)) { nightShares[mid] = Math.round(nightShares[mid] * 100) / 100; }
    } else {
      let totalOccupiedDays = 0;
      nightLabels.forEach(label => {
        for (const [mid, labels] of Object.entries(nightsInput)) {
          if (splitMemberIds.includes(mid) && labels.includes(label)) { totalOccupiedDays++; }
        }
      });
      if (totalOccupiedDays === 0) return { shares: {}, error: 'At least one person must be present on at least one day' };
      const perOccupiedDay = roundedAmount / totalOccupiedDays;
      splitMemberIds.forEach(mid => {
        const personDays = (nightsInput[mid] || []).filter(d => nightLabels.includes(d)).length;
        if (personDays > 0) { nightShares[mid] = Math.round(personDays * perOccupiedDay * 100) / 100; }
      });
    }
    let sumShares = Object.values(nightShares).reduce((s, v) => s + v, 0);
    let remainderCents = Math.round((roundedAmount - sumShares) * 100);
    if (remainderCents !== 0) {
      const sorted = splitMemberIds.map(mid => [mid, (nightsInput[mid] || []).length]).sort((a, b) => b[1] - a[1]);
      const dir = remainderCents > 0 ? 1 : -1;
      const steps = Math.abs(remainderCents);
      for (let i = 0; i < steps && i < sorted.length; i++) {
        nightShares[sorted[i][0]] = Math.round((nightShares[sorted[i][0]] + dir * 0.01) * 100) / 100;
      }
    }
    Object.assign(shares, nightShares);
  } else if (type === 'exact') {
    if (!exactAmounts) return { shares: {}, error: 'exact_amounts required for exact split type' };
    const total = Object.values(exactAmounts).reduce((sum, v) => sum + v, 0);
    if (Math.abs(total - roundedAmount) > 0.01) {
      return { shares: {}, error: `Split amounts must equal the total ($${roundedAmount.toFixed(2)}). Got $${total.toFixed(2)}` };
    }
    for (const [mid, val] of Object.entries(exactAmounts)) {
      if (!splitMemberIds.includes(mid)) return { shares: {}, error: `Member ${mid} not in split` };
      shares[mid] = val;
    }
  } else if (type === 'percentage') {
    if (!percentages) return { shares: {}, error: 'percentages required for percentage split type' };
    const totalPct = Object.values(percentages).reduce((sum, v) => sum + v, 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      return { shares: {}, error: `Split percentages must add up to 100%. Got ${totalPct.toFixed(1)}%` };
    }
    for (const [mid, pct] of Object.entries(percentages)) {
      if (!splitMemberIds.includes(mid)) return { shares: {}, error: `Member ${mid} not in split` };
      shares[mid] = Math.round(roundedAmount * pct / 100 * 100) / 100;
    }
  } else {
    return { shares: {}, error: `Unknown split type: ${type}` };
  }
  return { shares, error: null };
}

function buildNightsData(nightsInput, opts = {}) {
  const { nightsMode, dateRangeStart, dateRangeEnd, numNights, calcMethod } = opts;
  if (!dateRangeStart || !dateRangeEnd) {
    const nNights = numNights || parseInt(Object.keys(nightsInput).filter(k => k.startsWith('Night ')).length) || 0;
    return {
      json: JSON.stringify({ ...nightsInput, _num_nights: nNights, _mode: 'count', _calc: calcMethod || 'proportional' }),
      drStart: null, drEnd: null,
      nightLabels: Array.from({ length: nNights }, (_, i) => `Night ${i + 1}`),
    };
  }
  const startDate = new Date(dateRangeStart);
  const endDate = new Date(dateRangeEnd);
  const nNights = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
  const nightLabels = [];
  for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
    nightLabels.push(d.toISOString().split('T')[0]);
  }
  return {
    json: JSON.stringify({ ...nightsInput, _num_nights: nNights, _mode: 'dates', _calc: calcMethod || 'proportional' }),
    drStart: dateRangeStart, drEnd: dateRangeEnd, nightLabels,
  };
}

module.exports = { calculateSplits, buildNightsData, CATEGORIES };
