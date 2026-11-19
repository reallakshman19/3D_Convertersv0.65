import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolvePreviewManualWallForBore} from
  '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-bore-wall-authority.js';
import {
  buildPreviewB36SelectedThickness,
  planPreviewB36SelectedPull,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-b36-selected.js';

const testRows=[
  {lineKey:'P4110001',sizeMm:200,p1:'13001',t1:'120',material:'DSS',p1Source:'linelist',t1Source:'linelist',
   materialSource:'process-linelist-material',pipingClass:'93833',pipingClassPipeDnMm:200,
   pipingClassPipeWallMm:12.7,pipingClassPipeSchedule:'80S',pipingClassPipeMaterial:'ASTM A790 UNS S31803',
   wallThicknessKey:'PC:93833|DN:200',wallThickness:'12.7',corrosion:'0',branchName:'GLRD-P4110001-B6'},
  {lineKey:'P4110001',sizeMm:150,p1:'13001',t1:'120',material:'DSS',p1Source:'linelist',t1Source:'linelist',
   materialSource:'process-linelist-material',pipingClass:'93833',pipingClassPipeDnMm:150,
   pipingClassPipeWallMm:7.112,pipingClassPipeSchedule:'40S',pipingClassPipeMaterial:'ASTM A790 UNS S31803',
   wallThicknessKey:'PC:93833|DN:150',wallThickness:'7.112',corrosion:'0',branchName:'GLRD-P4110001-B2'},
  {lineKey:'B4110003',sizeMm:100,p1:'701.3',t1:'82',material:'LTCS',p1Source:'linelist',t1Source:'linelist',
   materialSource:'process-linelist-material',pipingClass:'11502',pipingClassPipeDnMm:100,
   pipingClassPipeWallMm:6.0198,pipingClassPipeSchedule:'40',pipingClassPipeMaterial:'ASTM A333-6',
   wallThicknessKey:'PC:11502|DN:100',wallThickness:'6.0198',corrosion:'3',branchName:'GLRD-B4110003-B1'},
  {lineKey:'B4110003',sizeMm:400,p1:'701.3',t1:'82',material:'LTCS',p1Source:'linelist',t1Source:'linelist',
   materialSource:'process-linelist-material',pipingClass:'11502',pipingClassPipeDnMm:400,
   pipingClassPipeWallMm:7.9248,pipingClassPipeSchedule:'20',pipingClassPipeMaterial:'ASTM A333-6',
   wallThicknessKey:'PC:11502|DN:400',wallThickness:'7.9248',corrosion:'3',branchName:'GLRD-B4110003-B3'},
];
const cfg=()=>({b313WallUpdate:{bases:{},proposalsByBranch:{},acceptedWallByBranch:{},
  millTolerance:{basis:'percent',value:12.5},commonPressureUnitFallback:'AUTO'},
  overrides:{wallThickness:{}}});
const nominal=[12.7,7.112,6.0198,7.9248];
const required=[7.799691,5.983324,3.759199,4.606070];
const schedules=['80S','40S','40','20'];
const standards=['ASME B36.19M','ASME B36.19M','ASME B36.10M','ASME B36.10M'];

test('four GLRD populated rows choose physical Piping Class B36 schedule (not automatic downgrade)',()=>{
  const config=cfg(),saved=JSON.stringify(config);
  testRows.forEach((row,i)=>{
    const before=JSON.stringify(row);
    const result=buildPreviewB36SelectedThickness({row,config,rowIndex:i,previewNodeRows:[]});
    assert.equal(result.ok,true,'GLRD row '+(i+1)+' '+JSON.stringify(result));
    assert.equal(result.hypothetical,false,'shared project default supplies the display calculation');
    assert.equal(result.pressureUnitUnverified,true);
    assert.equal(result.eligibleForB313GovernedPull,false);
    assert.equal(result.eligibleForManualPreviewPull,true);
    assert.equal(result.selectionAuthority,'EXACT_DN_PIPING_CLASS_MATCHED_B36_MASTER');
    assert.equal(result.selectedSchedule,schedules[i]);
    assert.equal(result.dimensionStandard,standards[i]);
    assert(Math.abs(result.selectedNominalWallMm-nominal[i])<0.012,
      'selected '+result.selectedNominalWallMm+' vs class '+nominal[i]);
    assert(Math.abs(result.requiredNominalThicknessMm-required[i])<0.003);
    assert(result.selectedNominalWallMm+1e-8>=result.requiredNominalThicknessMm);
    assert.equal(JSON.stringify(row),before);
  });
  assert.equal(JSON.stringify(config),saved,'read-only column cannot mutate config/Wall Thk');
});

test('each physical occurrence can prepare separate MANUAL wall pull, not an accepted B31.3 Pull',()=>{
  const config=cfg();const before=JSON.stringify(config);
  for(let i=0;i<testRows.length;i++){
    const plan=planPreviewB36SelectedPull({rows:testRows,rowIndex:i,config});
    assert.equal(plan.ok,true,JSON.stringify(plan));
    assert.equal(plan.key,testRows[i].wallThicknessKey);
    assert.deepEqual(plan.affectedRows,[i]);
    assert.equal(plan.engineeringApproved,false);
    assert.equal(plan.governedB313Pull,false);
    assert.equal(plan.selection.pressureUnitUnverified,true);
  }
  assert.equal(JSON.stringify(config),before,'planner must not write to config');
});

test('explicit manual Pull receipt remains visible even when selected nominal equals existing class wall',()=>{
  const config=cfg(),row=testRows[1],key=row.wallThicknessKey;
  assert.equal(buildPreviewB36SelectedThickness({row,config,rowIndex:1}).manuallyPulled,false);
  config.overrides.wallThickness[key]='7.112';
  config.b313WallUpdate.selectedWallManualByOverrideKey={
    [key]:{status:'MANUAL_PREVIEW_ONLY_NOT_B313_APPROVED',selectedNominalWallMm:7.112,
      selectedSchedule:'40S',dimensionStandard:'ASME B36.19M',timestamp:'2026-11-19T01:00:00Z',
      affectedRows:[1],sourceBranch:row.branchName},
  };
  const selected=buildPreviewB36SelectedThickness({row,config,rowIndex:1});
  assert.equal(selected.manuallyPulled,true);
  assert.equal(selected.manualPullReceipt?.status,'MANUAL_PREVIEW_ONLY_NOT_B313_APPROVED');
  assert.equal(selected.eligibleForB313GovernedPull,false);
  config.overrides.wallThickness[key]='8.18';
  assert.equal(buildPreviewB36SelectedThickness({row,config,rowIndex:1}).manuallyPulled,false,
    'changed manual wall must not inherit a stale B36 Pull receipt');
});

test('exact class+DN explicit manual wall takes precedence over class reference in bore authority',()=>{
  const cfg={overrides:{wallThickness:{'PC:93833|DN:150':'8.18'}}};
  const selected=resolvePreviewManualWallForBore({
    config:cfg,pipingClass:'93833',boreMm:150,outsideDiameterMm:168.3,
  });
  assert.equal(selected.ok,true);
  assert.equal(selected.wallThicknessMm,8.18);
  assert.equal(selected.source,'manual-override');
  assert.equal(selected.engineeringQualified,false);
  assert.equal(resolvePreviewManualWallForBore({
    config:cfg,pipingClass:'93833',boreMm:200,outsideDiameterMm:219.1,
  }).ok,false,'Do not leak a DN150 wall into another DN');
  assert.equal(resolvePreviewManualWallForBore({
    config:cfg,pipingClass:'93833',boreMm:150,outsideDiameterMm:14,
  }).code,'PREVIEW_MANUAL_WALL_GEOMETRY_CONFLICT');
  assert.equal(resolvePreviewManualWallForBore({
    config:cfg,pipingClass:'93833',boreMm:150,outsideDiameterMm:168.3,
    dtxr:{evidenceKind:'DIRECT_WALL',wallThicknessMm:7.112},
  }).code,'PREVIEW_MANUAL_WALL_DIRECT_SOURCE_CONFLICT');
  cfg.overrides.__dtxrWallKeys={'PC:93833|DN:150':true};
  assert.equal(resolvePreviewManualWallForBore({
    config:cfg,pipingClass:'93833',boreMm:150,outsideDiameterMm:168.3,
  }).ok,false,'DTXR-applied key is not reclassified as a manual Preview override');
});

test('incomplete P1/T1 or unavailable schedule cannot enable Pull',()=>{
  const base=testRows[1],config=cfg();
  for(const changed of [
    {p1:'',p1Source:'none'},
    {t1:'',t1Source:'none'},
    {pipingClassPipeDnMm:200},
    {pipingClassPipeSchedule:'FICTITIOUS'},
    {pipingClassPipeWallMm:999},
    {pipingClassPipeMaterial:''},
  ]){
    const row={...base,...changed};
    const picked=buildPreviewB36SelectedThickness({row,config,rowIndex:1});
    assert.equal(picked.ok,false,JSON.stringify(changed)+' unexpectedly selected '+JSON.stringify(picked));
    assert.equal(planPreviewB36SelectedPull({rows:[row],rowIndex:0,config}).ok,false);
  }
});

test('shared class+DN key never propagates to a physically matching occurrence without its own P1/T1',()=>{
  const config=cfg(),row=testRows[1];
  const same={...row,branchName:'OTHER-SAME-SIZE',t1:'',t1Source:'none'};
  const denied=planPreviewB36SelectedPull({rows:[row,same],rowIndex:0,config});
  assert.equal(denied.code,'B36_PULL_SHARED_SCOPE_UNQUALIFIED');
  const matching={...row,branchName:'OTHER-SAME-SIZE'};
  const planned=planPreviewB36SelectedPull({rows:[row,matching],rowIndex:0,config});
  assert.equal(planned.ok,true,JSON.stringify(planned));
  assert.deepEqual(planned.affectedRows,[0,1]);
});

test('insufficient exact Piping Class wall never silently upgrades schedule',()=>{
  const row={...testRows[0],pipingClassPipeSchedule:'5S',pipingClassPipeWallMm:2.77};
  const picked=buildPreviewB36SelectedThickness({row,config:cfg(),rowIndex:0});
  assert.equal(picked.ok,false);
  assert(['B36_CLASS_WALL_INSUFFICIENT','B36_CLASS_SCHEDULE_WALL_CONFLICT'].includes(picked.code));
});

test('shared override scope conflicts and accepted governed Pull are rejected',()=>{
  const config=cfg(),row0=testRows[1];
  const wrong={...row0,branchName:'ANOTHER-CLASS-WALL',pipingClassPipeWallMm:10.97};
  const bad=planPreviewB36SelectedPull({rows:[row0,wrong],rowIndex:0,config});
  assert.equal(bad.code,'B36_PULL_SHARED_SCOPE_CONFLICT');
  config.b313WallUpdate.acceptedWallByBranch['0']={nominalWallMm:7.112};
  assert.equal(planPreviewB36SelectedPull({rows:[row0],rowIndex:0,config}).code,
    'B36_PULL_GOVERNED_WALL_EXISTS');
});

test('rendered column, explicit button and protected Pull callback are present in source+Pages',()=>{
  const local=p=>readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/'+p,import.meta.url),'utf8');
  const pages=p=>readFileSync(new URL('../docs/tabs/xml-cii-2019-standalone/ui-adapted/'+p,import.meta.url),'utf8');
  for(const name of [
    'xml-cii-adapted-preview-b313-b36-selected.js',
    'xml-cii-adapted-editable-preview-table.js',
    'xml-cii-adapted-preview-b313-wall-audit-controller.js',
    'xml-cii-adapted-preview-bore-wall-authority.js',
    'xml-cii-adapted-preview-dryrun.js',
    'xml-cii-adapted-preview-renderer.js',
  ]) assert.equal(local(name),pages(name),name+' Pages mirror mismatch');
  assert.match(local('xml-cii-adapted-editable-preview-table.js'),/label: 'Selected Thickness \(mm\)'/);
  assert.match(local('xml-cii-adapted-editable-preview-table.js'),/data-mc-b36-selected-pull-row=/);
  assert.match(local('xml-cii-adapted-preview-renderer.js'),/onB36SelectedPullClick:/);
  assert.match(local('xml-cii-adapted-preview-renderer.js'),/B36 manual Pull rolled back/);
  assert.match(local('xml-cii-adapted-preview-renderer.js'),/selectedWallManualByOverrideKey/);
});
