import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT,
  calculateAndSelectPreviewB313Wall,
  resolvePreviewB313FactorBasis,
  resolvePreviewB313MaterialIdentity,
} from '../converters/xml-cii2019-core/b313-preview-wall-update.js';
import {
  resolveMaterialCodeFromLineMaterial,
  resolveXmlCiiB313ClassMaterialEvidence,
  resolveXmlCiiB313MaterialCodeClassConflict,
} from '../converters/xml-cii2019-core/branch-process-resolver.js';
import {
  resolvePreviewB313MaterialFromRow,
  buildPreviewB313WallUpdateReport,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';

const base = {
  dn: 250,
  outsideDiameterMm: 273,
  designPressure: 51.1,
  pressureUnit: 'barg',
  corrosionAllowanceMm: 6,
  allowableStress: 20000,
  stressUnit: 'psi',
  qualityFactorE: 1,
  weldStrengthReductionW: 1,
  coefficientY: 0.4,
  dimensionStandard: 'ASME B36.10M',
};

assert.equal(B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT, 12.5);

const exactMaterial = resolvePreviewB313MaterialIdentity({ material: 'ASTM A106-B', materialSource: 'piping-class-fallback' });
assert.equal(exactMaterial.ok, true, JSON.stringify(exactMaterial, null, 2));
assert.equal(exactMaterial.material.materialId, 'CS-A106-B');
assert.equal(exactMaterial.resolutionSource, 'PREVIEW_MATERIAL');

const corroboratedCs = resolvePreviewB313MaterialIdentity({
  material: 'CS',
  materialSource: 'process-linelist-material',
  corroboratingMaterial: 'A106-B',
  corroboratingSource: 'process-material-map',
  corroboratingNeedsReview: false,
});
assert.equal(corroboratedCs.ok, true, JSON.stringify(corroboratedCs, null, 2));
assert.equal(corroboratedCs.material.materialId, 'CS-A106-B');
assert.equal(corroboratedCs.corroborationStatus, 'MATCHED');

const ambiguousSs = resolvePreviewB313MaterialIdentity({ material: 'SS', materialSource: 'process-linelist-material' });
assert.equal(ambiguousSs.ok, false);
assert.equal(ambiguousSs.code, 'B313_PREVIEW_MATERIAL_AMBIGUOUS');

const disambiguatedSs = resolvePreviewB313MaterialIdentity({
  material: 'SS',
  materialSource: 'process-linelist-material',
  corroboratingMaterial: 'A312-TP316',
  corroboratingSource: 'process-material-map',
  corroboratingNeedsReview: false,
});
assert.equal(disambiguatedSs.ok, true, JSON.stringify(disambiguatedSs, null, 2));
assert.equal(disambiguatedSs.material.materialId, 'SS-A312-TP316');
assert.equal(disambiguatedSs.resolutionSource, 'PREVIEW_MATERIAL_CODE_CORROBORATION');
assert.equal(disambiguatedSs.corroborationStatus, 'DISAMBIGUATED');

const materialConflict = resolvePreviewB313MaterialIdentity({
  material: 'ASTM A106-B',
  corroboratingMaterial: 'A312-TP316',
  corroboratingSource: 'process-material-map',
  corroboratingNeedsReview: false,
});
assert.equal(materialConflict.ok, false);
assert.equal(materialConflict.code, 'B313_PREVIEW_MATERIAL_CONFLICT');

// The active master currently contains A106 benchmark-only factors. Preview must
// not silently enable them: strict resolution fails until controlled rows exist.
const strictUnavailable = resolvePreviewB313FactorBasis({
  materialIdentity: exactMaterial,
  designTemperatureC: 0,
  manualBasis: {},
});
assert.equal(strictUnavailable.ok, false);
assert.equal(strictUnavailable.code, 'B313_PREVIEW_FACTOR_BASIS_UNAVAILABLE');
assert.equal(strictUnavailable.details.strictResult.code, 'B313_FACTOR_DATA_INCOMPLETE');

const explicitFallback = resolvePreviewB313FactorBasis({
  materialIdentity: exactMaterial,
  designTemperatureC: 0,
  manualBasis: {
    allowableStress: 20000,
    stressUnit: 'psi',
    qualityFactorE: 1,
    weldStrengthReductionW: 1,
    coefficientY: 0.4,
    sourceReference: 'CONTROLLED-PROJECT-BASIS-001',
  },
});
assert.equal(explicitFallback.ok, true, JSON.stringify(explicitFallback, null, 2));
assert.equal(explicitFallback.mode, 'MANUAL_EXPLICIT_FALLBACK');
assert.equal(explicitFallback.designAuthority, false);
assert.equal(explicitFallback.strictResult.code, 'B313_FACTOR_DATA_INCOMPLETE');

const dn250 = calculateAndSelectPreviewB313Wall(base);
assert.equal(dn250.ok, true, JSON.stringify(dn250, null, 2));
assert.ok(Math.abs(dn250.calculation.requiredNominalThicknessMm - 12.5536) < 0.0001);
assert.ok(Math.abs(dn250.selectedNominalWallMm - 12.7) < 1e-9);
assert.equal(dn250.selectedSchedule, '60');
assert.deepEqual(dn250.equivalentSchedules, ['60', 'XS']);
assert.ok(Math.abs(dn250.selectionMarginMm - (12.7 - dn250.calculation.requiredNominalThicknessMm)) < 1e-10);
assert.equal(dn250.calculation.manufacturingTolerance.basis, 'percent');
assert.equal(dn250.calculation.manufacturingTolerance.percent, 12.5);
assert.equal(dn250.calculation.manufacturingTolerance.inputValue, 12.5);
assert.equal(dn250.authority, 'EXPLICIT_PREVIEW_ACTION_NOT_AUTOMATIC_WALL_AUTHORITY');

const missingOd = calculateAndSelectPreviewB313Wall({ ...base, outsideDiameterMm: undefined });
assert.equal(missingOd.ok, false);
assert.equal(missingOd.code, 'B313_PREVIEW_OD_REQUIRED');

const missingPressureUnit = calculateAndSelectPreviewB313Wall({ ...base, pressureUnit: '' });
assert.equal(missingPressureUnit.ok, false);
assert.equal(missingPressureUnit.code, 'B313_PREVIEW_PRESSURE_UNIT_REQUIRED');

const missingStress = calculateAndSelectPreviewB313Wall({ ...base, allowableStress: '' });
assert.equal(missingStress.ok, false);
assert.equal(missingStress.code, 'B313_PREVIEW_ALLOWABLE_STRESS_REQUIRED');

const missingStressUnit = calculateAndSelectPreviewB313Wall({ ...base, stressUnit: '' });
assert.equal(missingStressUnit.ok, false);
assert.equal(missingStressUnit.code, 'B313_PREVIEW_STRESS_UNIT_REQUIRED');

const blankCorrosion = calculateAndSelectPreviewB313Wall({ ...base, corrosionAllowanceMm: '' });
assert.equal(blankCorrosion.ok, false);
assert.equal(blankCorrosion.code, 'B313_PREVIEW_CORROSION_REQUIRED');

const blankE = calculateAndSelectPreviewB313Wall({ ...base, qualityFactorE: '' });
assert.equal(blankE.ok, false);
assert.equal(blankE.code, 'B313_PREVIEW_QUALITY_FACTOR_E_REQUIRED');

const blankW = calculateAndSelectPreviewB313Wall({ ...base, weldStrengthReductionW: '' });
assert.equal(blankW.ok, false);
assert.equal(blankW.code, 'B313_PREVIEW_WELD_FACTOR_W_REQUIRED');

const blankY = calculateAndSelectPreviewB313Wall({ ...base, coefficientY: '' });
assert.equal(blankY.ok, false);
assert.equal(blankY.code, 'B313_PREVIEW_COEFFICIENT_Y_REQUIRED');

// Explicit zero is a valid Y input and must not be confused with blank.
const explicitZeroY = calculateAndSelectPreviewB313Wall({ ...base, coefficientY: 0 });
assert.equal(explicitZeroY.ok, true, JSON.stringify(explicitZeroY, null, 2));
assert.equal(explicitZeroY.calculation.inputs.coefficientY, 0);


// An exact Step 8 material mapping must reach B31.3 without being inferred
// afresh from a generic material family.
const step8Ltcs = resolveMaterialCodeFromLineMaterial({
  lineRow: {}, materialMap: [], pipingClassRow: null,
  pipingClass: '11472', overrides: {},
  config: { useDefaultPipingClassMaterialCodeMap: true },
});
assert.equal(step8Ltcs.materialCode, '177');
assert.equal(step8Ltcs.matchedRow.materialName, 'ASTM A333-6');
assert.equal(step8Ltcs.needsReview, false);
// Process Line List 'LTCS' remains the governing material. The exact class
// specification is attached as corroborating evidence only; it does NOT set a
// previously unresolved Material Code.
const processLtcs = resolveMaterialCodeFromLineMaterial({
  lineRow: { Material: 'LTCS' }, materialMap: [], pipingClassRow: null,
  pipingClass: '11472', overrides: {},
  config: { useDefaultPipingClassMaterialCodeMap: true },
});
assert.equal(processLtcs.material, 'LTCS');
assert.equal(processLtcs.materialCode, '');
const class11472 = JSON.parse(fs.readFileSync(new URL('../docs/Masters/SpecwisePipingClass/11472.json', import.meta.url), 'utf8'));
const class13831 = JSON.parse(fs.readFileSync(new URL('../docs/Masters/SpecwisePipingClass/13831.json', import.meta.url), 'utf8'));
const pickSize = (cls, dn) => cls.rows.find((row) => Number(row.convertedBore) === dn);
const classEvidence = resolveXmlCiiB313ClassMaterialEvidence({
  pipingClass: '11472', config: { useDefaultPipingClassMaterialCodeMap: true },
  pipingClassRow: pickSize(class11472, 150), sizeMm: 150,
});
assert.equal(classEvidence.materialCodeCorroborationCandidate, 'ASTM A333-6');
assert.equal(classEvidence.materialCodeCorroborationNeedsReview, false);
assert.equal(classEvidence.materialCodeCorroborationMethod, 'size-exact');
assert.equal(classEvidence.materialCodeCorroborationSizeMm,150);
// The class switches product from ASTM A333 to ASTM A671 at DN750;
// class-wide A333 factor approval would be a severe source-identity error.
const class11472Dn750 = resolveXmlCiiB313ClassMaterialEvidence({
  pipingClass:'11472', config: {useDefaultPipingClassMaterialCodeMap:true},
  pipingClassRow:pickSize(class11472,750),sizeMm:750,
});
assert.equal(class11472Dn750.materialCodeCorroborationCandidate,'ASTM A671-CC65 cl 22');
assert.equal(class11472Dn750.materialCodeCorroborationNeedsReview,false,
  'Exact DN establishes an identity candidate but not factor qualification');
const wrongFamilyMaterial = resolveXmlCiiB313MaterialCodeClassConflict({
  materialCodeMatchedMaterial:'ASTM A333-6',classEvidence:class11472Dn750,
});
assert.equal(wrongFamilyMaterial.code,'B313_MATERIAL_CODE_VS_CLASS_DN_CONFLICT');
assert.equal(wrongFamilyMaterial.sizeMm,750);
assert.equal(resolveXmlCiiB313MaterialCodeClassConflict({
  materialCodeMatchedMaterial:'ASTM A671-CC65 cl 22',classEvidence:class11472Dn750,
}),null);
const rowConflict=resolvePreviewB313MaterialFromRow({
  material:'LTCS',materialCodeMatchedMaterial:'ASTM A333-6',
  materialCodeConflict:wrongFamilyMaterial,t1:'82',
}, {});
assert.equal(rowConflict.ok,false);
assert.equal(rowConflict.code,'B313_PREVIEW_MATERIAL_CODE_CONFLICT');
const class11472Unscoped = resolveXmlCiiB313ClassMaterialEvidence({
  pipingClass:'11472',config:{useDefaultPipingClassMaterialCodeMap:true},
});
assert.equal(class11472Unscoped.materialCodeCorroborationNeedsReview,true,
  'A class-wide mapping is never a qualified exact pipe product');
const dssDn200 = resolveXmlCiiB313ClassMaterialEvidence({
  pipingClass:'13831',pipingClassRow:pickSize(class13831,200),sizeMm:200,
});
assert.equal(dssDn200.materialCodeCorroborationCandidate,'ASTM A790 UNS S31803');
assert.equal(dssDn200.materialCodeCorroborationNeedsReview,false);
const dssDn250 = resolveXmlCiiB313ClassMaterialEvidence({
  pipingClass:'13831',pipingClassRow:pickSize(class13831,250),sizeMm:250,
});
assert.match(dssDn250.materialCodeCorroborationCandidate,/A790\/A928/i);
assert.equal(dssDn250.materialCodeCorroborationNeedsReview,true,
  'A790/A928 alternative manufacturing specs require review');
const mismatchedDn = resolveXmlCiiB313ClassMaterialEvidence({
  pipingClass:'13831',pipingClassRow:pickSize(class13831,200),sizeMm:250,
});
assert.equal(mismatchedDn.materialCodeCorroborationNeedsReview,true,
  'Wrong-size class row cannot qualify material designation');
const weakClassEvidence = resolveXmlCiiB313ClassMaterialEvidence({
  pipingClass: '31148', config: { useDefaultPipingClassMaterialCodeMap: true },
});
if (weakClassEvidence.materialCodeCorroborationCandidate) {
  assert.equal(weakClassEvidence.materialCodeCorroborationNeedsReview, true);
}
const invalidDnClass = resolvePreviewB313MaterialFromRow({
  material:'LTCS',
  materialCodeCorroborationCandidate:class11472Unscoped.materialCodeCorroborationCandidate,
  materialCodeCorroborationNeedsReview:class11472Unscoped.materialCodeCorroborationNeedsReview,
}, {});
assert.equal(invalidDnClass.b313IdentityNeedsReview,true);
const processLtcsB313 = resolvePreviewB313MaterialFromRow({
  material: processLtcs.material, materialSource: processLtcs.source,
  materialCode: processLtcs.materialCode,
  materialCodeNeedsReview: true,
  materialCodeCorroborationCandidate: classEvidence.materialCodeCorroborationCandidate,
  materialCodeCorroborationSource: classEvidence.materialCodeCorroborationSource,
  materialCodeCorroborationNeedsReview: false,
  pipingClassNeedsReview: false,
}, {});
assert.equal(processLtcsB313.ok, true, JSON.stringify(processLtcsB313));
assert.equal(processLtcsB313.material.materialId, 'LTCS-A333-6');
assert.equal(processLtcsB313.b313IdentityNeedsReview, false);
const unresolvedClassConflict = resolvePreviewB313MaterialFromRow({
  material: 'LTCS', materialCodeCorroborationCandidate: 'ASTM A333-6',
  materialCodeCorroborationNeedsReview: false,
  pipingClassConflict: 'FORMAT1_FORMAT2_DIFFER',
}, {});
assert.equal(unresolvedClassConflict.ok, false);
assert.equal(unresolvedClassConflict.code, 'B313_PREVIEW_PIPING_CLASS_AUTHORITY_UNRESOLVED',
  'An unreviewed class source conflict must HOLD rather than silently accept a family grade');
const unreviewedWildcard = resolvePreviewB313MaterialFromRow({
  material: 'LTCS', materialCodeCorroborationCandidate: 'ASTM A333-6',
  materialCodeCorroborationNeedsReview: true,
}, {});
assert.equal(unreviewedWildcard.b313IdentityNeedsReview, true);

const ltcsIdentity = resolvePreviewB313MaterialIdentity({
  material: 'LTCS',
  corroboratingMaterial: step8Ltcs.matchedRow.materialName,
  corroboratingSource: 'piping-class-fallback',
  corroboratingNeedsReview: step8Ltcs.needsReview,
});
assert.equal(ltcsIdentity.ok, true, JSON.stringify(ltcsIdentity));
assert.equal(ltcsIdentity.material.materialId, 'LTCS-A333-6');
assert.equal(ltcsIdentity.b313IdentityNeedsReview, false);

const genericDss = resolvePreviewB313MaterialIdentity({ material: 'DSS' });
assert.equal(genericDss.ok, true);
assert.equal(genericDss.material.materialId, 'DSS-A790-S31803');
assert.equal(genericDss.b313IdentityNeedsReview, true, 'Family defaults are candidates, not proven exact grades');
const corroboratedDss = resolvePreviewB313MaterialIdentity({
  material: 'DSS', corroboratingMaterial: 'ASTM A790 UNS S31803',
  corroboratingSource: 'reviewed-step8-exact', corroboratingNeedsReview: false,
});
assert.equal(corroboratedDss.ok, true, JSON.stringify(corroboratedDss));
assert.equal(corroboratedDss.b313IdentityNeedsReview, false);
const unreviewedDss = resolvePreviewB313MaterialIdentity({
  material: 'DSS', corroboratingMaterial: 'ASTM A790 UNS S31803',
  corroboratingNeedsReview: true,
});
assert.equal(unreviewedDss.b313IdentityNeedsReview, true);
const crossFamilyConflict = resolvePreviewB313MaterialIdentity({
  material: 'DSS', corroboratingMaterial: 'ASTM A312-TP316',
  corroboratingSource: 'reviewed-step8-exact', corroboratingNeedsReview: false,
});
assert.equal(crossFamilyConflict.ok, false);
assert.equal(crossFamilyConflict.code, 'B313_PREVIEW_MATERIAL_CONFLICT');
const exactGradeConflict = resolvePreviewB313MaterialIdentity({
  material: 'ASTM A312-TP304', corroboratingMaterial: 'ASTM A312-TP316',
  corroboratingSource: 'reviewed-step8-exact', corroboratingNeedsReview: false,
});
assert.equal(exactGradeConflict.ok, false);
assert.equal(exactGradeConflict.code, 'B313_PREVIEW_MATERIAL_CONFLICT');

// No Line List design T1 may be fabricated by material CS fallback, a
// configuration default, or a neighboring temperature record. These are
// row-level holds, not batch-wide exceptions.
const tempRow = { branchName:'BR-1', lineKey:'L-1', material:'LTCS',
  t1:'', t1Source:'none', p1:'10', p1Source:'linelist', corrosion:'1.5' };
function reported(row) {
  const r=buildPreviewB313WallUpdateReport({rows:[row],config:{b313WallUpdate:{bases:{},proposalsByBranch:{}}}});
  assert.equal(r.summary.calculatedRows,0);
  assert.equal(r.summary.skippedRows,1);
  return r.rows[0];
}
const missingT1=reported(tempRow);
assert.equal(missingT1.code,'B313_PREVIEW_T1_REQUIRED');
assert.equal(missingT1.details.nextAction,'EDIT_STEP4_T1_AND_REBUILD');
const defaultT1=reported({...tempRow,t1:'120',t1Source:'default'});
assert.equal(defaultT1.code,'B313_PREVIEW_T1_SOURCE_UNVERIFIED');
assert.equal(reported({...tempRow,t1:'-100000',t1Source:'linelist'}).code,'B313_PREVIEW_T1_REQUIRED');
const defaultP1=reported({...tempRow,t1:'82',t1Source:'linelist',p1Source:'default'});
assert.equal(defaultP1.code,'B313_PREVIEW_P1_SOURCE_UNVERIFIED');
const actual82=reported({...tempRow,t1:'82',t1Source:'linelist'});
assert.equal(actual82.code,'B313_PREVIEW_FACTOR_BASIS_UNAVAILABLE',
  'Qualified factors still required at actual T1; no screening or neighboring data promoted');

console.log('XML/CII Preview B31.3 material-factor and wall API composition checks passed.');
