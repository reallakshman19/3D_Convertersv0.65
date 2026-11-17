import assert from 'node:assert/strict';
import {
  b313PreviewInputSignature,
  b313PreviewNodeSignature,
  b313PullProposal,
  b313ReadAcceptedWall,
} from '../converters/xml-cii2019-core/b313-preview-pull-authority.js';
import { calculateAndSelectPreviewB313Wall, resolvePreviewB313FactorBasis } from '../converters/xml-cii2019-core/b313-preview-wall-update.js';
import { resolvePreviewB313MaterialFromRow, previewB313BasisKey, inferPreviewPressureUnit } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';

const src = {
  branchName: 'BRANCH-100', lineKey: 'LINE-100', sizeMm: 150,
  pipingClass: 'PC-A', material: 'ASTM A106-B',
  p1: '10', p1Source: 'linelist', p1Unit: 'MPA', p1UnitSource: 'line-list-column:P1 MPa',
  t1: '120', t1Source: 'linelist', corrosion: '1.5', corrosionSource: 'piping-class-master',
};
const node = {
  branchOccurrenceIndex: 0, nodeOrdinal: 0, componentType: 'PIPE',
  nodeNumber: '100', componentRefNo: 'REF01', endpoint: 'A',
  boreMm: 150, outsideDiameterMm: 168.3,
};
const other = { ...node, branchOccurrenceIndex: 1, nodeNumber: '200', componentRefNo: 'REF02' };
const nonPipe = { ...node, nodeOrdinal: 1, nodeNumber: '101', componentType: 'ELBO', componentRefNo: 'EL01', outsideDiameterMm: 0 };
const config = {
  b313WallUpdate: {
    millTolerance: { basis: 'percent', value: 12.5 },
    materialFallback: { enabled: true, family: 'CS' },
    bases: {},
    proposalsByBranch: {},
  },
};
const inputSignature = b313PreviewInputSignature(src, config);
config.b313WallUpdate.proposalsByBranch['0'] = {
  nominalWallMm: 8.18,
  selectedSchedule: '40',
  inputSignature,
  nodeScope: [b313PreviewNodeSignature(node)],
  factorBasisMode: 'ACTIVE_MASTER_STRICT',
  materialFallbackApplied: false,
  result: { selectedNominalWallMm: 8.18 },
};
assert.equal(b313PullProposal(config, src, 0, [node, other, nonPipe]).ok, true,
  'Zero-OD nodes must not be included in the accepted wall scope');
assert.equal(b313PullProposal(config, { ...src, p1: '14' }, 0, [node]).code, 'B313_PULL_STALE_PREVIEW');
assert.equal(b313PullProposal(config, src, 0, [{ ...node, outsideDiameterMm: 180 }]).code, 'B313_PULL_SCOPE_CHANGED');
assert.equal(b313PullProposal(config, src, 1, [node, other]).code, 'B313_PULL_PROPOSAL_REQUIRED');
const accepted = b313PullProposal(config, src, 0, [node]);
config.b313WallUpdate.acceptedWallByBranch = { '0': accepted.record };
assert.equal(b313ReadAcceptedWall(config, src, 0, [node, nonPipe])?.nominalWallMm, 8.18);
assert.equal(b313PullProposal(config, { ...src, wallThickness: '10.97' }, 0, [node, nonPipe]).code,
  'B313_PULL_WALL_REDUCTION_REVIEW_REQUIRED');
assert.equal(b313PullProposal(config, { ...src, p1Unit: 'KPA' }, 0, [node]).code,
  'B313_PULL_STALE_PREVIEW');
assert.equal(b313ReadAcceptedWall(config, { ...src, t1: '140' }, 0, [node]), null);
assert.equal(b313ReadAcceptedWall(config, { ...src, p1Unit: 'KPA' }, 0, [node]), null);
assert.equal(b313ReadAcceptedWall(config, src, 0, [{ ...node, outsideDiameterMm: 170 }]), null);

const proposal = config.b313WallUpdate.proposalsByBranch['0'];
proposal.factorBasisMode = 'MANUAL_EXPLICIT_FALLBACK';
proposal.manualFactorsReviewed = false;
assert.equal(b313PullProposal(config, src, 0, [node]).code, 'B313_PULL_MANUAL_FACTORS_REVIEW_REQUIRED');
proposal.manualFactorsReviewed = true;
proposal.materialFallbackApplied = true;
proposal.materialFallbackReviewed = false;
assert.equal(b313PullProposal(config, src, 0, [node]).code, 'B313_PULL_CS_FALLBACK_REVIEW_REQUIRED');
proposal.materialFallbackReviewed = true;
assert.equal(b313PullProposal(config, src, 0, [node]).ok, true);

const explicitMaterialCodeConflict = resolvePreviewB313MaterialFromRow({
  material: 'ASTM A106-B', materialCode: '177',
  materialCodeConflict: { overrideCode: '177', resolvedCode: '106' }, t1: '120',
}, config);
assert.equal(explicitMaterialCodeConflict.ok, false);
assert.equal(explicitMaterialCodeConflict.code, 'B313_PREVIEW_MATERIAL_CODE_CONFLICT');
const familyGradeProposal = config.b313WallUpdate.proposalsByBranch['0'];
familyGradeProposal.materialIdentityNeedsReview = true;
familyGradeProposal.materialIdentityReviewed = false;
assert.equal(b313PullProposal(config, src, 0, [node]).code, 'B313_PULL_MATERIAL_GRADE_REVIEW_REQUIRED');
familyGradeProposal.materialIdentityReviewed = true;
assert.equal(b313PullProposal(config, src, 0, [node]).ok, true);
assert.notEqual(b313PreviewInputSignature(src, config),
  b313PreviewInputSignature({ ...src, materialCodeMatchedMaterial: 'ASTM A333-6' }, config));
assert.notEqual(b313PreviewInputSignature(src, config),
  b313PreviewInputSignature({ ...src, materialCodeNeedsReview: true }, config));
assert.notEqual(b313PreviewInputSignature(src, config),
  b313PreviewInputSignature({ ...src, materialCodeCorroborationCandidate: 'ASTM A333-6' }, config));
assert.notEqual(b313PreviewInputSignature(src, config),
  b313PreviewInputSignature({ ...src, pipingClassConflict: 'CLASS_AMBIGUOUS' }, config));

const missing = resolvePreviewB313MaterialFromRow({ material: '', t1: '120' }, config);
assert.equal(missing.ok, true);
assert.equal(missing.material.materialId, 'CS-A106-B');
assert.equal(missing.b313FallbackApplied, true);
assert.equal(previewB313BasisKey({ material: '', t1: '120' }, config), 'MATID:CS-A106-B|T1=120');
const ss = resolvePreviewB313MaterialFromRow({ material: 'SS316L', t1: '120' }, config);
assert.equal(ss.ok, false, 'Known stainless must not silently become CS');
const disabled = resolvePreviewB313MaterialFromRow({ material: '', t1: '120' }, { b313WallUpdate: { materialFallback: { enabled: false } } });
assert.equal(disabled.ok, false);
assert.equal(inferPreviewPressureUnit({ p1Unit: 'KPA', p1UnitSource: 'preview-line-list' }, {}, null, {}, true).unit, 'KPA');
assert.equal(inferPreviewPressureUnit({ p1Unit: 'KPA' }, {}, null, { pressureUnit: 'BARG' }, true).unit, '');

const base = {
  dn: 250, outsideDiameterMm: 273, designPressure: 51.1, pressureUnit: 'barg',
  corrosionAllowanceMm: 6, allowableStress: 20000, stressUnit: 'psi',
  qualityFactorE: 1, weldStrengthReductionW: 1, coefficientY: 0.4, dimensionStandard: 'ASME B36.10M',
};
const percent = calculateAndSelectPreviewB313Wall(base);
const absolute = calculateAndSelectPreviewB313Wall({
  ...base, negativeMillTolerance: { basis: 'absolute', value: 1.5, unit: 'mm' },
});
assert.equal(percent.ok, true);
assert.equal(absolute.ok, true);
assert.equal(percent.calculation.manufacturingTolerance.basis, 'percent');
assert.equal(absolute.calculation.manufacturingTolerance.basis, 'absolute');
assert.ok(Math.abs(absolute.calculation.requiredNominalThicknessMm -
  (absolute.calculation.requiredMinimumThicknessMm + 1.5)) < 1e-8);
assert.notEqual(absolute.calculation.requiredNominalThicknessMm, percent.calculation.requiredNominalThicknessMm);
assert.equal(resolvePreviewB313FactorBasis({materialIdentity: missing, designTemperatureC: '', manualBasis: {}}).code,
  'B313_PREVIEW_T1_REQUIRED');

console.log('PASS v0.65 B31.3 Pull custody, CS fallback, mm tolerance, T1 and pressure-unit validation');
