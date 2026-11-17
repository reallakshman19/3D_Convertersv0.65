/**
 * Step 4 B31.3 Pull custody. A calculation is a proposal; only an explicit
 * branch/occurrence-scoped Pull becomes effective Preview wall authority.
 * Never key a pulled wall solely by shared piping class and nominal bore.
 */
const txt = (value) => value === undefined || value === null ? '' : String(value).trim();
const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const isApplicableWallNode = (node) => txt(node?.outsideDiameterMm) !== ''
  && Number.isFinite(Number(node?.outsideDiameterMm)) && Number(node?.outsideDiameterMm) > 0;

export function b313PreviewInputSignature(row = {}, config = {}) {
  const basis = config?.b313WallUpdate || {};
  return JSON.stringify({
    branchName: txt(row.branchName),
    lineKey: txt(row.lineKey),
    sizeMm: txt(row.sizeMm),
    pipingClass: txt(row.pipingClass),
    material: txt(row.material),
    materialCode: txt(row.materialCode),
    materialCodeMatchedMaterial: txt(row.materialCodeMatchedMaterial),
    materialCodeNeedsReview: row.materialCodeNeedsReview === true,
    materialCodeSource: txt(row.materialCodeSource),
    materialCodeResolutionMethod: txt(row.materialCodeResolutionMethod),
    materialCodeConfidence: txt(row.materialCodeConfidence),
    materialCodeConflict: row.materialCodeConflict || null,
    p1: txt(row.p1),
    p1Source: txt(row.p1Source),
    p1Unit: txt(row.p1Unit),
    p1UnitSource: txt(row.p1UnitSource),
    t1: txt(row.t1),
    t1Source: txt(row.t1Source),
    corrosion: txt(row.corrosion),
    corrosionSource: txt(row.corrosionSource),
    millTolerance: basis.millTolerance || { basis: 'percent', value: 12.5 },
    materialFallback: basis.materialFallback || null,
    factorBases: basis.bases || {},
  });
}

export function b313PreviewNodeSignature(node = {}) {
  return {
    branchOccurrenceIndex: Number(node.branchOccurrenceIndex),
    nodeOrdinal: Number(node.nodeOrdinal),
    nodeNumber: txt(node.nodeNumber),
    componentRefNo: txt(node.componentRefNo),
    endpoint: txt(node.endpoint),
    boreMm: txt(node.boreMm),
    outsideDiameterMm: txt(node.outsideDiameterMm),
  };
}

export function b313ReadAcceptedWall(config = {}, branchRow = {}, branchOccurrenceIndex, nodeRows = []) {
  const record = config?.b313WallUpdate?.acceptedWallByBranch?.[String(branchOccurrenceIndex)];
  if (!record || !finitePositive(record.nominalWallMm)) return null;
  if (record.inputSignature !== b313PreviewInputSignature(branchRow, config)) return null;
  const actual = (nodeRows || []).filter((n) => Number(n.branchOccurrenceIndex) === Number(branchOccurrenceIndex) && isApplicableWallNode(n));
  if (!actual.length || !Array.isArray(record.nodeScope) || actual.length !== record.nodeScope.length) return null;
  for (let i = 0; i < actual.length; i += 1) {
    if (JSON.stringify(b313PreviewNodeSignature(actual[i])) !== JSON.stringify(record.nodeScope[i])) return null;
  }
  return record;
}

/**
 * Validate a saved calculation proposal against the exact current Step 4
 * snapshot and promote it only after the caller obtains explicit confirmation.
 * This does not modify class/DN-wide legacy overrides or global Fill-Down. The physical scope is the verified same-OD group in this Preview branch; AVEVA nodes need not have a PIPE component type.
 */
export function b313PullProposal(config = {}, branchRow = {}, branchOccurrenceIndex, nodeRows = []) {
  const basis = config?.b313WallUpdate || {};
  const proposal = basis.proposalsByBranch?.[String(branchOccurrenceIndex)];
  if (!proposal) return { ok: false, code: 'B313_PULL_PROPOSAL_REQUIRED' };
  if (!finitePositive(proposal.nominalWallMm)) return { ok: false, code: 'B313_PULL_WALL_INVALID' };
  if (proposal.inputSignature !== b313PreviewInputSignature(branchRow, config)) {
    return { ok: false, code: 'B313_PULL_STALE_PREVIEW' };
  }
  const actual = (nodeRows || []).filter((n) =>
    Number(n.branchOccurrenceIndex) === Number(branchOccurrenceIndex) && isApplicableWallNode(n));
  if (!actual.length || actual.length !== proposal.nodeScope?.length) {
    return { ok: false, code: 'B313_PULL_SCOPE_CHANGED' };
  }
  for (let i = 0; i < actual.length; i += 1) {
    if (JSON.stringify(b313PreviewNodeSignature(actual[i])) !== JSON.stringify(proposal.nodeScope[i])) {
      return { ok: false, code: 'B313_PULL_SCOPE_CHANGED' };
    }
  }
  // Do not silently reduce a source-specified wall, even when a thinner
  // schedule satisfies the pressure-only calculation.
  const existingWall = txt(branchRow?.wallThickness);
  const existingNominal = existingWall === '' ? NaN : Number(existingWall);
  if (Number.isFinite(existingNominal) && existingNominal > Number(proposal.nominalWallMm) + 1e-9
      && proposal.reductionReviewed !== true) {
    return { ok: false, code: 'B313_PULL_WALL_REDUCTION_REVIEW_REQUIRED',
      existingWallMm: existingNominal, proposedWallMm: proposal.nominalWallMm };
  }
  if (proposal.materialIdentityNeedsReview === true && proposal.materialIdentityReviewed !== true) {
    return { ok: false, code: 'B313_PULL_MATERIAL_GRADE_REVIEW_REQUIRED' };
  }
  if (proposal.materialFallbackApplied && proposal.materialFallbackReviewed !== true) {
    return { ok: false, code: 'B313_PULL_CS_FALLBACK_REVIEW_REQUIRED' };
  }
  if (proposal.factorBasisMode !== 'ACTIVE_MASTER_STRICT' && proposal.manualFactorsReviewed !== true) {
    return { ok: false, code: 'B313_PULL_MANUAL_FACTORS_REVIEW_REQUIRED' };
  }
  return {
    ok: true,
    code: 'B313_PULL_READY',
    record: {
      schema: 'xml-cii-b313-pull-acceptance/v1',
      inputSignature: proposal.inputSignature,
      nodeScope: proposal.nodeScope,
      nominalWallMm: proposal.nominalWallMm,
      selectedSchedule: proposal.selectedSchedule,
      factorBasisMode: proposal.factorBasisMode,
      materialIdentityNeedsReview: proposal.materialIdentityNeedsReview === true,
      materialIdentityReviewed: proposal.materialIdentityReviewed === true,
      materialFallbackApplied: proposal.materialFallbackApplied === true,
      calculation: proposal.result,
      status: 'USER_ACCEPTED_PENDING_OUTPUT_VERIFICATION',
    },
  };
}
