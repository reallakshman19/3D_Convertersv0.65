/**
 * Step 4 B31.3 Pull custody. A calculation is a proposal; only an explicit
 * branch/occurrence-scoped Pull becomes effective Preview wall authority.
 * Never key a pulled wall solely by shared piping class and nominal bore.
 */
const txt = (value) => value === undefined || value === null ? '' : String(value).trim();
const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

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
    p1: txt(row.p1),
    p1Source: txt(row.p1Source),
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
  const actual = (nodeRows || []).filter((n) => Number(n.branchOccurrenceIndex) === Number(branchOccurrenceIndex));
  if (!actual.length || !Array.isArray(record.nodeScope) || actual.length !== record.nodeScope.length) return null;
  for (let i = 0; i < actual.length; i += 1) {
    if (JSON.stringify(b313PreviewNodeSignature(actual[i])) !== JSON.stringify(record.nodeScope[i])) return null;
  }
  return record;
}
