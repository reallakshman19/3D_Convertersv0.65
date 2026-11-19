import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  resolveB313EffectivePreviewPressureUnit,
  buildPreviewB313CalculatedWallDisplay,
  buildPreviewB313WallUpdateReport,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';
import {
  setPreviewB313CommonPressureUnitFallback,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-auto-basis.js';

const row=()=>({
  branchName:'GLRD-TEST-P4110001',lineKey:'P4110001',
  material:'ASTM A790 UNS S31803',materialSource:'process-linelist-material',
  sizeMm:150,t1:'120',t1Source:'linelist',
  p1:'701.3',p1Source:'linelist',p1Unit:'',p1UnitSource:'unresolved',
  corrosion:'0',lineMiss:false,
});
const nodes=[{branchOccurrenceIndex:0,nodeNumber:'100',outsideDiameterMm:168.3}];
const config=()=>({b313WallUpdate:{bases:{},proposalsByBranch:{},
  acceptedWallByBranch:{},millTolerance:{basis:'percent',value:12.5}},
  overrides:{wallThickness:{P4110001:'7.112'}}});
const display=(r,c)=>buildPreviewB313CalculatedWallDisplay({
  row:r,config:c,previewNodeRows:nodes,rowIndex:0,
});

test('common project P1 defaults to kPa(g), including unconfigured and old AUTO sessions',()=>{
  for(const fallback of [undefined,'AUTO']){
    const cfg=config();
    if(fallback)cfg.b313WallUpdate.commonPressureUnitFallback=fallback;
    const before=JSON.stringify(cfg);
    const result=display(row(),cfg);
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.pressureUnit,'KPA');
    assert.equal(result.pressureUnitSource,'B313_COMMON_PRESSURE_UNIT_FALLBACK');
    assert.equal(result.pressureUnitAssumed,true);
    assert(result.requiredNominalThicknessMm>0);
    assert.equal(result.eligibleForPull,false);
    assert.equal(JSON.stringify(cfg),before,'default must not mutate source/override config');
  }
});

test('one common fallback supplies explicitly labeled read-only scenario; no per-row mutation',()=>{
  const cfg=config(),original=row();
  const before=JSON.stringify({row:original,overrides:cfg.overrides,
    bases:cfg.b313WallUpdate.bases,proposals:cfg.b313WallUpdate.proposalsByBranch});
  const saved=setPreviewB313CommonPressureUnitFallback(cfg,'KPA');
  assert.equal(saved.ok,true);
  assert.equal(saved.eligibleForPull,false);
  assert.equal(cfg.b313WallUpdate.commonPressureUnitFallbackSource,
    'USER_SELECTED_SHARED_SCREENING_ASSUMPTION');
  const outcome=display(original,cfg);
  assert.equal(outcome.ok,true,JSON.stringify(outcome));
  assert.equal(outcome.pressureUnit,'KPA');
  assert.equal(outcome.pressureUnitSource,'B313_COMMON_PRESSURE_UNIT_FALLBACK');
  assert.equal(outcome.pressureUnitAssumed,true);
  assert(Number(outcome.requiredNominalThicknessMm)>0);
  assert.equal(outcome.eligibleForPull,false);
  assert.equal(JSON.stringify({row:original,overrides:cfg.overrides,
    bases:cfg.b313WallUpdate.bases,proposals:cfg.b313WallUpdate.proposalsByBranch}),before);
});

test('same physical P1 with kPa and psi common scenarios gives different walls',()=>{
  const cfg=config(),r=row();
  setPreviewB313CommonPressureUnitFallback(cfg,'KPA');
  const kpa=display(r,cfg);
  setPreviewB313CommonPressureUnitFallback(cfg,'PSI');
  const psi=display(r,cfg);
  assert.equal(kpa.ok,true,JSON.stringify(kpa));
  assert.equal(psi.ok,true,JSON.stringify(psi));
  assert(psi.requiredNominalThicknessMm>kpa.requiredNominalThicknessMm,
    'Unit changes the calculation, not the original P1');
  assert.equal(r.p1,'701.3');
  assert.equal(r.p1Unit,'');
});

test('actual Preview P1 unit takes precedence over shared fallback',()=>{
  const r={...row(),p1Unit:'KPA',p1UnitSource:'line-list-header-band:W'};
  const unit=resolveB313EffectivePreviewPressureUnit(r,{},'PSIG');
  assert.equal(unit.unit,'KPA');
  assert.equal(unit.source,'line-list-header-band:W');
  assert.equal(unit.assumed,false);
  const cfg=config();cfg.b313WallUpdate.commonPressureUnitFallback='PSIG';
  const result=display(r,cfg);
  assert.equal(result.ok,true);
  assert.equal(result.pressureUnit,'KPA');
  assert.equal(result.pressureUnitAssumed,false);
});

test('source conflicts, per-basis conflicts and missing T1 cannot be bypassed by common fallback',()=>{
  const cfg=config();cfg.b313WallUpdate.commonPressureUnitFallback='KPA';
  const conflicted={...row(),p1UnitSource:'conflicting-line-list-units'};
  const unit=resolveB313EffectivePreviewPressureUnit(conflicted,{},'KPA');
  assert.equal(unit.unit,'');
  assert.equal(unit.source,'P1_UNIT_SOURCE_CONFLICT');
  assert.equal(display(conflicted,cfg).ok,false);
  const explicitConflict=resolveB313EffectivePreviewPressureUnit(
    {...row(),p1Unit:'BARG'},{pressureUnit:'PSI'},'KPA');
  assert.equal(explicitConflict.unit,'');
  assert.equal(explicitConflict.source,'P1_UNIT_AUTHORITIES_CONFLICT');
  const noT1={...row(),t1:'',t1Source:'none'};
  assert.equal(display(noT1,cfg).ok,false);
});

test('common fallback does not qualify governed Pull, remove proposals, or alter user Wall Thk',()=>{
  const cfg=config();cfg.b313WallUpdate.commonPressureUnitFallback='KPA';
  const oldOverrides=JSON.stringify(cfg.overrides);
  const result=buildPreviewB313WallUpdateReport({rows:[row()],config:cfg,
    host:{__xmlCiiPreviewResult:{nodeBoreWallRows:nodes}}});
  assert.equal(result.summary.updatedRows,0);
  assert.equal(Object.keys(cfg.b313WallUpdate.proposalsByBranch).length,0);
  assert.equal(JSON.stringify(cfg.overrides),oldOverrides);
  assert.equal(result.rows[0].calculatedWallDisplay.pressureUnitAssumed,true);
});

test('common fallback selector is singular; runtime and docs copies stay byte-identical',()=>{
  const names=['xml-cii-adapted-preview-b313-auto-basis.js',
    'xml-cii-adapted-preview-b313-wall-update.js',
    'xml-cii-adapted-preview-b313-wall-audit-controller.js'];
  for(const name of names) {
    const runtime=readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/'+name,import.meta.url),'utf8');
    const docs=readFileSync(new URL('../docs/tabs/xml-cii-2019-standalone/ui-adapted/'+name,import.meta.url),'utf8');
    assert.equal(runtime,docs,name+' docs runtime mismatch');
    if(name==='xml-cii-adapted-preview-b313-auto-basis.js') {
      assert.match(runtime,/data-b313-common-pressure-unit/);
      assert.doesNotMatch(runtime,/<select data-b313-auto-field="pressureUnit"/);
      assert.match(runtime,/Selected Line List design-pressure header/);
    }
  }
});
