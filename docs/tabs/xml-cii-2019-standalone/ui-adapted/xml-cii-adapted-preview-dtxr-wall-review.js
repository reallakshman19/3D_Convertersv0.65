// Read-only, physical-key-scoped DTXR wall candidate planner.
// No source evidence in this module authorizes a pressure-design B31.3 Pull.
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const txt = (value) => value === undefined || value === null ? '' : String(value).trim();

export function buildDtxrWallReview({
  rows = [], existingWalls = {}, acceptedWallByBranch = {},
  candidateIndex, candidateForRow, keyForRow,
} = {}) {
  if (typeof candidateIndex !== 'function' || typeof candidateForRow !== 'function' || typeof keyForRow !== 'function') {
    throw new TypeError('DTXR review requires source candidate and physical-key resolvers');
  }
  const physicalRows = Array.isArray(rows) ? rows : [];
  const source = candidateIndex(physicalRows) || {};
  const grouped = new Map();
  let matchedRows = 0;
  for (let ri = 0; ri < physicalRows.length; ri++) {
    const row = physicalRows[ri];
    const candidate = candidateForRow(row, source.index);
    if (!candidate) continue;
    const key = txt(keyForRow(row));
    const value = Number(candidate.value);
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    matchedRows++;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key, value, schedule: txt(candidate.schedule), dtxr: txt(candidate.dtxr),
        branchNames: [], rowIndices: [], acceptanceKeys: [], collision: false,
      });
    }
    const item = grouped.get(key);
    if (Math.abs(item.value - value) > 1e-6 || item.schedule !== txt(candidate.schedule)) {
      item.collision = true;
    }
    item.rowIndices.push(ri);
    const occurrence = txt(row?.branchOccurrenceIndex);
    item.acceptanceKeys.push(/^\\d+$/.test(occurrence) ? String(Number(occurrence)) : String(ri));
    item.branchNames.push(txt(row?.branchName) || ('Preview row ' + (ri + 1)));
  }
  const items = [...grouped.values()].map(item => {
    const hasAcceptedWall = item.acceptanceKeys.some(key =>
      own(acceptedWallByBranch, key) &&
      Number(acceptedWallByBranch[key]?.nominalWallMm) > 0);
    const hasExisting = own(existingWalls, item.key) && txt(existingWalls[item.key]) !== '';
    const existingValue = hasExisting ? txt(existingWalls[item.key]) : '';
    const same = hasExisting && Number.isFinite(Number(existingValue)) &&
      Math.abs(Number(existingValue) - item.value) <= 1e-6;
    const status = item.collision ? 'SOURCE_CONFLICT_HOLD'
      : hasAcceptedWall ? 'B313_ACCEPTED_WALL_HOLD'
      : same ? 'ALREADY_MATCHES'
      : hasExisting ? 'REPLACE_EXISTING_REQUIRES_APPROVAL'
      : 'REVIEW_REQUIRED';
    return { ...item, existingValue, status,
      eligible: status === 'REVIEW_REQUIRED' || status === 'REPLACE_EXISTING_REQUIRES_APPROVAL' };
  });
  return {
    inputRows: physicalRows.length, matchedRows, availableSourceRows: Number(source.available) || 0,
    items, eligibleKeys: items.filter(x=>x.eligible).length,
  };
}

export function validateDtxrWallSelection({ review, selectedKeys = [], currentWalls = {}, acceptedWallByBranch = {} } = {}) {
  const selected = new Set(selectedKeys.map(txt));
  const approved = [];
  const skipped = [];
  for (const item of review?.items || []) {
    if (!selected.has(item.key)) continue;
    const approvedElsewhere = item.acceptanceKeys.some(key =>
      own(acceptedWallByBranch, key) &&
      Number(acceptedWallByBranch[key]?.nominalWallMm) > 0);
    const currentValue = own(currentWalls, item.key) ? txt(currentWalls[item.key]) : '';
    if (!item.eligible || approvedElsewhere || currentValue !== item.existingValue) {
      skipped.push({ key:item.key, reason:approvedElsewhere?'B313_ACCEPTED_WALL_HOLD':
        currentValue !== item.existingValue?'STALE_OVERRIDE_HOLD':item.status });
      continue;
    }
    approved.push(item);
  }
  return { approved, skipped };
}
