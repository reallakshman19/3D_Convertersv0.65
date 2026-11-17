import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  B313_MATERIAL_FACTOR_MASTER,
  normalizeB313MaterialFamily,
  resolveB313MaterialIdentity,
  resolveB313DesignFactors,
  resolveB313QualifiedTemperatureFactor,
  getB313MaterialFactorCoverage,
  calculateB313MaterialDesign,
} from '../converters/b313-material-factors/index.js';

const KSI_TO_MPA = 6.894757293168361;
const b = JSON.parse(fs.readFileSync(new URL('../Benchmarks/B313MaterialFactors/a106-grb-full-pipeline-benchmark.json', import.meta.url), 'utf8'));

test('family routing covers CS LT/LTCS SS DSS SDSS without inventing an SS grade default', () => {
  assert.equal(normalizeB313MaterialFamily('LT'), 'LTCS');
  for (const f of ['CS', 'LTCS', 'DSS', 'SDSS']) {
    const r = resolveB313MaterialIdentity({ material: { family: f }, allowProjectFamilyDefault: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.material.family, f);
  }
  const ss = resolveB313MaterialIdentity({ material: { family: 'SS' }, allowProjectFamilyDefault: true });
  assert.equal(ss.ok, false);
  assert.equal(ss.code, 'B313_MATERIAL_AMBIGUOUS');
  assert.deepEqual(ss.details.candidates.sort(), ['SS-A312-TP304', 'SS-A312-TP316']);
  assert.equal(resolveB313MaterialIdentity({ material: { spec: 'ASTM A312-TP304' } }).material.materialId, 'SS-A312-TP304');
  assert.equal(resolveB313MaterialIdentity({ material: { spec: 'ASTM A312-TP316' } }).material.materialId, 'SS-A312-TP316');
});

test('A106 benchmark factors resolve only in benchmark mode', () => {
  const strict = resolveB313DesignFactors({ ...b.input });
  assert.equal(strict.ok, false);
  assert.equal(strict.code, 'B313_FACTOR_DATA_INCOMPLETE');
  const r = resolveB313DesignFactors({ ...b.input, qualificationMode: 'benchmark' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert(Math.abs(r.factors.allowableStressMPa - b.expected.S_MPa) < 1e-12);
  assert.equal(r.factors.qualityFactorE, 1);
  assert.equal(r.factors.weldStrengthReductionW, 1);
  assert.equal(r.factors.coefficientY, .4);
  assert.equal(r.designAuthority, false);
});

test('LTCS remains fail-closed outside supplied exact screening temperatures', () => {
  const r = resolveB313DesignFactors({ material: { family: 'LT' }, allowProjectFamilyDefault: true, designTemperature: -46 });
  assert.equal(r.ok, false);
  assert.equal(r.details.material.materialId, 'LTCS-A333-6');
  assert.deepEqual(r.details.missing, ['S', 'E', 'W', 'Y']);
});

test('caller overrides require explicitly non-strict manual diagnostic mode', () => {
  const r = resolveB313DesignFactors({ material: { family: 'DSS' }, allowProjectFamilyDefault: true, designTemperature: 50, qualificationMode: 'manual', factorOverrides: { S: 170, E: 1, W: 1, Y: .4 } });
  assert.equal(r.ok, true);
  assert.equal(r.material.materialId, 'DSS-A790-S31803');
  assert.equal(r.factorSources.S.authority, 'CALLER_OVERRIDE');
});

test('screening basis resolves supplied material, temperature, and manufacturing-route values', () => {
  const cases = [
    ['LTCS-A333-6', 20, 'SEAMLESS', 20.0, 1.0],
    ['SS-A312-TP304', 300, 'SEAMLESS', 16.9, 1.0],
    ['SS-A312-TP316', 300, 'EFW_DOUBLE_BUTT', 17.3, 0.85],
    ['DSS-A790-S31803', 120, 'EFW_SINGLE_BUTT', 29.5, 0.80],
    ['SDSS-A790-S32760', 300, 'EFW_100_PERCENT_RT', 34.0, 1.0],
  ];
  for (const [materialId, designTemperature, manufacturingRoute, sKsi, e] of cases) {
    const r = resolveB313DesignFactors({
      material: { materialId },
      designTemperature,
      temperatureUnit: 'C',
      manufacturingRoute,
      qualificationMode: 'screening',
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert(Math.abs(r.factors.allowableStressMPa - sKsi * KSI_TO_MPA) < 1e-10);
    assert.equal(r.factors.qualityFactorE, e);
    assert.equal(r.factors.weldStrengthReductionW, 1);
    assert.equal(r.factors.coefficientY, .4);
    assert.equal(r.designAuthority, false);
    assert.equal(r.factorSources.S.status, 'SCREENING');
    assert.equal(r.factorSources.S.basisId, 'OWNER-B313-SEWY-2026-08-11');
  }
});

test('screening rows never leak into strict design authority', () => {
  const strict = resolveB313DesignFactors({
    material: { materialId: 'LTCS-A333-6' },
    designTemperature: 20,
    manufacturingRoute: 'SEAMLESS',
    qualificationMode: 'strict',
  });
  assert.equal(strict.ok, false);
  assert.deepEqual(strict.details.missing, ['S', 'E', 'W', 'Y']);
});

test('route-specific E requires an explicit matching manufacturing route', () => {
  const noRoute = resolveB313DesignFactors({
    material: { materialId: 'SS-A312-TP304' },
    designTemperature: 20,
    qualificationMode: 'screening',
  });
  assert.equal(noRoute.ok, false);
  assert.deepEqual(noRoute.details.missing, ['E']);

  const unsupported = resolveB313DesignFactors({
    material: { materialId: 'SS-A312-TP304' },
    designTemperature: 20,
    manufacturingRoute: 'UNQUALIFIED_WELD_ROUTE',
    qualificationMode: 'screening',
  });
  assert.equal(unsupported.ok, false);
  assert.deepEqual(unsupported.details.missing, ['E']);
});

test('duplex 420 C screening basis intentionally has no S value or generated S record', () => {
  for (const materialId of ['DSS-A790-S31803', 'SDSS-A790-S32760']) {
    const r = resolveB313DesignFactors({
      material: { materialId },
      designTemperature: 420,
      manufacturingRoute: 'SEAMLESS',
      qualificationMode: 'screening',
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.details.missing, ['S']);
    assert.equal(B313_MATERIAL_FACTOR_MASTER.factors.S.records.some((row) => row.materialId === materialId && row.temperatureC === 420), false);
  }
});

test('coverage reports all factor families present after screening-basis expansion', () => {
  const c = getB313MaterialFactorCoverage();
  assert.equal(c.length, 6);
  for (const row of c) {
    assert.equal(row.hasS, true, row.materialId);
    assert.equal(row.hasE, true, row.materialId);
    assert.equal(row.hasW, true, row.materialId);
    assert.equal(row.hasY, true, row.materialId);
  }
  const basis = B313_MATERIAL_FACTOR_MASTER.screeningBases['OWNER-B313-SEWY-2026-08-11'];
  assert.equal(basis.status, 'SCREENING');
  assert.match(basis.editionBasis, /not independently verified/i);
});

test('A106 full pipeline resolves factors, B31.3 wall and commercial schedule', () => {
  const r = calculateB313MaterialDesign({ ...b.input, qualificationMode: 'benchmark' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.materialFactors.material.materialId, b.expected.materialId);
  assert(Math.abs(r.calculation.requiredNominalThicknessMm - b.expected.requiredNominalThicknessMm) < 1e-9);
  assert.equal(r.pipeWall.selected.nominalWallMm, b.expected.selectedWallMm);
  assert.equal(r.pipeWall.selected.schedule, b.expected.schedule);
  assert.deepEqual(r.pipeWall.selected.equivalentSchedules, b.expected.equivalentSchedules);
});

test('qualified S bracket interpolation at LTCS 82C is exact, source-bound and unit safe', () => {
  const source = 'QUALIFIED-APPENDIX-A1-LTCS-2024';
  // Synthetic test fixture: never published to the production master.
  const reviewed = { sourceDocumentSha256:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    sourceReviewedBy:'SYNTHETIC-REVIEWER', sourceReviewDate:'2026-11-17',
    sourceRevision:'SYNTHETIC-TABLE-TEST-REVISION' };
  const rows = [
    { materialId:'LTCS-A333-6', productForm:'PIPE', temperatureC:80, value:20, unit:'ksi', status:'PROJECT_APPROVED', edition:'2024', ...reviewed, sourceAuthority:source, sourceReference:'A1/80', approvalReference:'PROJECT-APPROVAL-LTCS-01' },
    { materialId:'LTCS-A333-6', productForm:'PIPE', temperatureC:120, value:19, unit:'ksi', status:'PROJECT_APPROVED', edition:'2024', ...reviewed, sourceAuthority:source, sourceReference:'A1/120', approvalReference:'PROJECT-APPROVAL-LTCS-01' },
  ];
  const q = {factor:'S',records:rows,materialId:'LTCS-A333-6',temperatureC:82,edition:'2024'};
  const result = resolveB313QualifiedTemperatureFactor(q);
  assert.equal(result.resolution,'LINEAR_QUALIFIED');
  assert.deepEqual(result.sourceTemperaturesC,[80,120]);
  assert(Math.abs(result.record.value-(20-.05)*KSI_TO_MPA)<1e-9);
  assert.equal(result.record.unit,'MPa');
  assert.equal(result.record.status,'PROJECT_APPROVED');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,temperatureC:80}).resolution,'EXACT_QUALIFIED');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,temperatureC:121}),null,'No extrapolation');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,temperatureC:79}),null,'No extrapolation');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,records:rows.map(r=>({...r,status:'SCREENING'}))}),null);
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,records:[rows[0],{...rows[1],sourceAuthority:'OTHER-SOURCE'}]}),null);
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,records:[...rows,{...rows[0]}]}),null,'Ambiguous same-temperature records HOLD');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,records:rows.map(r=>({...r,sourceReference:''}))}),null,'No source reference, no qualified result');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,records:rows.map(r=>({...r,approvalReference:''}))}),null,'PROJECT_APPROVED needs approval evidence');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,records:rows.map(r=>({...r,sourceDocumentSha256:''}))}),null,'Source document digest required');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,records:rows.map(r=>({...r,sourceReviewedBy:''}))}),null,'Source reviewer required');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,records:rows.map(r=>({...r,edition:undefined}))}),null,'Edition must be explicit');
  assert.equal(resolveB313QualifiedTemperatureFactor({...q,records:rows.map(r=>({...r,sourceAuthority:'USER_SUPPLIED_ENGINEERING_SCREENING_BASIS'}))}),null,
    'Renaming screening data to APPROVED must not silently qualify it');
});
test('E needs qualified exact/explicit range and correct weld route; W/Y interpolation needs approval', () => {
  const common={materialId:'LTCS-A333-6',productForm:'PIPE',status:'VERIFIED',edition:'2024',
    sourceDocumentSha256:'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    sourceReviewedBy:'SYNTHETIC-REVIEWER',sourceReviewDate:'2026-11-17',
    sourceRevision:'SYNTHETIC-TABLE-TEST-REVISION',
    sourceAuthority:'QUALIFIED-2024',sourceReference:'CONTROLLED-2024-FACTORS'};
  const range={...common,temperatureC:80,validFromC:20,validToC:150,temperatureApplicability:'CONSTANT_RANGE',value:1};
  const e={factor:'E',records:[{...range,manufacturingRoute:'SEAMLESS'}],materialId:common.materialId,temperatureC:82,edition:'2024'};
  assert.equal(resolveB313QualifiedTemperatureFactor({...e,manufacturingRoute:'SEAMLESS'}).resolution,'QUALIFIED_CONSTANT_RANGE');
  assert.equal(resolveB313QualifiedTemperatureFactor(e),null,'Route unresolved must HOLD');
  assert.equal(resolveB313QualifiedTemperatureFactor({...e,manufacturingRoute:'UNVERIFIED'}),null,'Unverified route must HOLD');
  assert.equal(resolveB313QualifiedTemperatureFactor({...e,
    manufacturingRoute:'SEAMLESS',records:[{...range,manufacturingRoute:undefined}]}),null,
    'Generic E record cannot override a physical route');
  assert.equal(resolveB313QualifiedTemperatureFactor({...e,manufacturingRoute:'EFW_DOUBLE_BUTT'}),null);
  assert.equal(resolveB313QualifiedTemperatureFactor({...e,manufacturingRoute:'SEAMLESS',temperatureC:151}),null);
  assert.equal(resolveB313QualifiedTemperatureFactor({...e,manufacturingRoute:'SEAMLESS',records:[{...range,manufacturingRoute:'SEAMLESS',status:'SCREENING'}]}),null);
  for (const factor of ['W','Y']) {
    const rows=[{...common,temperatureC:80,value:factor==='W'?1:.4},
      {...common,temperatureC:120,value:factor==='W'?.9:.45}];
    const q={factor,records:rows,materialId:common.materialId,temperatureC:82,edition:'2024'};
    assert.equal(resolveB313QualifiedTemperatureFactor(q),null,'No unapproved interpolation of W/Y');
    const approved=rows.map(r=>({...r,interpolationPolicy:'LINEAR_APPROVED'}));
    const result=resolveB313QualifiedTemperatureFactor({...q,records:approved});
    assert.equal(result.resolution,'LINEAR_QUALIFIED');
    assert.equal(result.record.status,'VERIFIED');
  }
});
test('strict resolver rejects blank T1 and caller overrides do not count as qualified source authority', () => {
  const blank=resolveB313DesignFactors({material:{materialId:'CS-A106-B'},designTemperature:''});
  assert.equal(blank.ok,false);
  assert.equal(blank.code,'INVALID_DESIGN_TEMPERATURE');
  const user=resolveB313DesignFactors({material:{materialId:'LTCS-A333-6'},designTemperature:82,
    factorOverrides:{S:125,E:1,W:1,Y:.4}});
  assert.equal(user.ok,false);
  assert.equal(user.code,'B313_STRICT_FACTOR_OVERRIDE_FORBIDDEN');
  const manual=resolveB313DesignFactors({material:{materialId:'LTCS-A333-6'},designTemperature:82,
    qualificationMode:'manual',factorOverrides:{S:125,E:1,W:1,Y:.4}});
  assert.equal(manual.ok,true);
  assert.equal(manual.designAuthority,false,'Manual numeric factors are not qualified master data');
});
