import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {lookupB313ScreeningFactors} from '../converters/b313-material-factors/screening-reference.js';
import {resolveB313DesignFactors} from '../converters/b313-material-factors/index.js';
import {
  buildPreviewB313ScreeningReference,buildPreviewB313WallUpdateReport,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';
import {renderPreviewB313WallAuditHtml} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-audit-controller.js';

const near=(a,b,tol=1e-5)=>assert(Math.abs(a-b)<=tol,`${a} !== ${b}`);
const DSS='DSS-A790-S31803', LTCS='LTCS-A333-6';
const config=()=>({b313WallUpdate:{bases:{},proposalsByBranch:{},acceptedWallByBranch:{},
  millTolerance:{basis:'percent',value:12.5}},overrides:{wallThickness:{'P4110001':'9.8'}}});
const row=()=>({
 branchName:'/GLRD-1000-4"-P4110001-93833-01/B6',lineKey:'P4110001',
 sizeMm:150,pipingClass:'93833',material:'DSS',materialSource:'process-linelist-material',
 t1:'120',t1Source:'linelist',p1:'13001',p1Unit:'KPA',p1Source:'linelist',
 corrosion:'0',lineMiss:false,
 pipingClassPipeDnMm:150,pipingClassPipeSourceRow:93833,
 pipingClassPipeSchedule:'40S',pipingClassPipeWallMm:7.112,
 pipingClassPipeMaterial:'ASTM A790 UNS S31803',
});
const nodes=[{branchOccurrenceIndex:0,nodeOrdinal:0,nodeNumber:'100',
 componentType:'PIPE',outsideDiameterMm:168.3,componentRefNo:'TEST'}];

test('existing DSS master exact T120 gives S29.5 ksi with factor source, route never assumed',()=>{
 const ref=lookupB313ScreeningFactors({materialId:DSS,temperatureC:120});
 assert.equal(ref.ok,true);
 assert.equal(ref.authority,'SCREENING_REFERENCE_ONLY');
 assert.equal(ref.eligibleForPull,false);
 assert.equal(ref.S.method,'EXACT');
 assert.deepEqual(ref.S.bracket,[{temperatureC:120,Sksi:29.5}]);
 near(ref.S.MPa,29.5*6.894757293168361);
 assert.equal(ref.E,null);
 assert(ref.routeOptions.some(r=>r.route==='SEAMLESS'&&r.value===1));
 assert.equal(ref.W,1);assert.equal(ref.Y,0.4);
});

test('LTCS T82 linearly interpolates between T80 and T120, never rounds T to 80',()=>{
 const ref=lookupB313ScreeningFactors({materialId:LTCS,temperatureC:82,manufacturingRoute:'SEAMLESS'});
 assert.equal(ref.ok,true);
 assert.equal(ref.S.method,'LINEAR_INTERPOLATION');
 assert.deepEqual(ref.S.bracket,[{temperatureC:80,Sksi:20},{temperatureC:120,Sksi:20}]);
 near(ref.S.MPa,20*6.894757293168361);
 assert.equal(ref.E,1);
 assert.equal(ref.temperatureC,82);
});

test('DSS T82 interpolates actual slope, no nearest-temperature substitution',()=>{
 const ref=lookupB313ScreeningFactors({materialId:DSS,temperatureC:82});
 near(ref.S.ksi,29.975);
 assert.equal(ref.S.method,'LINEAR_INTERPOLATION');
});

test('out-of-range / absent / malformed screens never extrapolate or invent',()=>{
 for(const x of [
  {materialId:DSS,temperatureC:500},
  {materialId:DSS,temperatureC:''},
  {materialId:'UNKNOWN',temperatureC:120},
  {materialId:LTCS,temperatureC:-300},
 ]) assert.equal(lookupB313ScreeningFactors(x).ok,false);
 const master={screeningBases:{X:{status:'SCREENING',sourceAuthority:'CASE',temperaturesC:[20,80],
 materials:{[DSS]:{Sksi:[30,NaN],EByRoute:{SEAMLESS:1}}},commonFactors:{W:1,Y:.4}}}};
 assert.equal(lookupB313ScreeningFactors({materialId:DSS,temperatureC:30,master}).ok,false);
});

test('screening master cannot satisfy strict active-factor resolver',()=>{
 const strict=resolveB313DesignFactors({materialId:DSS,designTemperature:120,
  manufacturingRoute:'SEAMLESS',qualificationMode:'strict'});
 assert.equal(strict.ok,false,JSON.stringify(strict));
});

test('physical GLRD preview uses master factors, OD, P1 and CA for conditional wall only',()=>{
 const cfg=config();const before=JSON.stringify(cfg);
 const ref=buildPreviewB313ScreeningReference({
   row:row(),config:cfg,previewNodeRows:nodes,rowIndex:0});
 assert.equal(ref.ok,true,JSON.stringify(ref));
 assert.equal(ref.eligibleForPull,false);
 assert.equal(ref.pressureUnit,'KPA');
 const seamless=ref.scenarios.find(s=>s.manufacturingRoute==='SEAMLESS');
 assert(seamless&&seamless.calculationOk,JSON.stringify(ref));
 assert.equal(seamless.routeAssumed,true);
 near(seamless.pressureDesignThicknessMm,5.244757871,1e-5);
 near(seamless.requiredNominalThicknessMm,5.994009,1e-4);
 assert.equal(seamless.classNominalWallMm,7.112);
 assert.equal(seamless.classPass,true);
 assert.equal(JSON.stringify(cfg),before,'reference lookup must not change configuration');
});

test('no source OD: exact-DN class/dimension master supplies read-only screening OD only',()=>{
 const cfg=config(), saved=JSON.stringify(cfg);
 const ref=buildPreviewB313ScreeningReference({
  row:row(),config:cfg,previewNodeRows:[],rowIndex:0});
 assert.equal(ref.ok,true,JSON.stringify(ref));
 assert.equal(ref.outsideDiameterSource,'pipe-wall-master-exact-DN-SCREENING-ONLY');
 assert.equal(ref.outsideDiameterReferenceOnly,true);
 assert.equal(ref.outsideDiameterSourceMatched,false);
 near(ref.outsideDiameterMm,168); // project TSV uses rounded OD(mm)=168
 assert.equal(ref.conditionalManufacturing,'SEAMLESS');
 assert.equal(ref.conditionalE,1);
 const s=ref.conditionalScenario;
 assert(s&&s.calculationOk,JSON.stringify(ref));
 near(s.pressureDesignThicknessMm,5.235408926,1e-5);
 assert.equal(s.classNominalWallMm,7.112);
 assert.equal(s.classPass,true);
 assert.equal(ref.eligibleForPull,false);
 assert.equal(JSON.stringify(cfg),saved,'screening reference must not mutate approval state');
 const html=renderPreviewB313WallAuditHtml({
  summary:{inputRows:1,calculatedRows:0,updatedRows:0,skippedRows:1},
  rows:[{branchName:row().branchName,lineKey:'P4110001',
    status:'NOT_UPDATED',screeningReference:ref,code:'TEST_SCREENING_ONLY'}],
 });
 assert.match(html,/exact-DN dimensional master \(screening assumption; 4 Preview node OD unavailable\)/);
 assert.match(html,/5\.2354 mm/);
 assert.match(html,/Eligible proposals 0/);
});

test('4 Preview only: displayed P1/T1/material and selected basis determine B31.3; XML text cannot override',()=>{
 const preview=row(); // effective visible 4 Preview branch
 const base=()=>({rows:[preview],config:config()});
 const left=buildPreviewB313WallUpdateReport({...base(),
   xmlText:'<Pipe><Pressure1>0</Pressure1><Temperature1>-100000</Temperature1><PressureUnits>pascal</PressureUnits></Pipe>'});
 const right=buildPreviewB313WallUpdateReport({...base(),
   xmlText:'<Pipe><Pressure1>99999999</Pressure1><Temperature1>700</Temperature1><PressureUnits>bar</PressureUnits></Pipe>'});
 assert.equal(left.summary.inputRows,1);
 assert.equal(right.summary.inputRows,1);
 assert.equal(left.rows[0].code,right.rows[0].code);
 const a=left.rows[0].screeningReference,b=right.rows[0].screeningReference;
 assert.equal(a.pressure,13001);
 assert.equal(a.pressureUnit,'KPA');
 assert.equal(a.temperatureC,120);
 assert.equal(a.conditionalManufacturing,'SEAMLESS');
 assert.equal(a.conditionalE,1);
 assert.equal(a.outsideDiameterSource,'pipe-wall-master-exact-DN-SCREENING-ONLY');
 assert.equal(a.conditionalScenario.calculationOk,true);
 near(a.conditionalScenario.pressureDesignThicknessMm,5.235408926);
 assert.deepEqual(b,a,'Changing XML pressure, temperature and units must not affect 4 Preview wall calculation');
 assert.equal(left.summary.updatedRows,0);
 assert.equal(right.summary.updatedRows,0);
});

test('missing P1 unit with class master OD: show verified factor and OD, but no calculation',()=>{
 const cfg=config(), r={...row(),p1Unit:''};
 const ref=buildPreviewB313ScreeningReference({
  row:r,config:cfg,previewNodeRows:[],rowIndex:0});
 assert.equal(ref.ok,true);
 assert.equal(ref.outsideDiameterReferenceOnly,true);
 assert(ref.holdReasons.includes('P1 pressure unit unresolved'));
 assert.equal(ref.scenarios.length,0);
 const html=renderPreviewB313WallAuditHtml({
  summary:{inputRows:1,calculatedRows:0,updatedRows:0,skippedRows:1},
  rows:[{branchName:r.branchName,lineKey:r.lineKey,status:'NOT_UPDATED',code:'TEST',
    screeningReference:ref}],
 });
 assert.match(html,/Select the actual documented P unit/);
 assert.match(html,/exact-DN dimensional master/);
 assert.doesNotMatch(html,/data-b313-screening-scenario=/);
});

test('no physical OD and no exact-DN class identity must not invent screening geometry',()=>{
 const r={...row(),pipingClassPipeDnMm:200};
 const ref=buildPreviewB313ScreeningReference({
  row:r,config:config(),previewNodeRows:[],rowIndex:0});
 assert.equal(ref.outsideDiameterMm,null);
 assert.equal(ref.outsideDiameterReferenceOnly,false);
 assert.equal(ref.scenarios.length,0);
 assert(ref.holdReasons.some(msg=>/Neither a unique source-node OD/.test(msg)));
});

test('saved physical P1 unit absent yields factor reference but NO wall arithmetic',()=>{
 const r={...row(),p1Unit:''};
 const ref=buildPreviewB313ScreeningReference({row:r,config:config(),previewNodeRows:nodes,rowIndex:0});
 assert.equal(ref.ok,true);
 assert.equal(ref.S.method,'EXACT');
 assert.equal(ref.scenarios.length,0);
 assert(ref.holdReasons.includes('P1 pressure unit unresolved'));
});

test('missing route shows all master E choices as independent what-if cases',()=>{
 const ref=buildPreviewB313ScreeningReference({
   row:row(),config:config(),previewNodeRows:nodes,rowIndex:0});
 assert.equal(ref.E,null,'physical manufacturing route remains unverified');
 assert.equal(ref.conditionalManufacturing,'SEAMLESS');
 assert.equal(ref.conditionalE,1);
 assert.equal(ref.conditionalRouteSource,'DEFAULT_SEAMLESS_SCREENING_ONLY');
 assert.equal(ref.conditionalRouteAssumed,true);
 assert.equal(ref.conditionalScenario?.manufacturingRoute,'SEAMLESS');
 assert.equal(ref.conditionalScenario?.E,1);
 assert(ref.scenarios.length>1);
 assert(ref.scenarios.every(s=>s.routeAssumed===true));
 const different=new Set(ref.scenarios.map(s=>s.requiredNominalThicknessMm));
 assert(different.size>1,'route E alternatives must produce different calculated walls');
});

test('actual audit shows source-derived screening factors and never grants Pull',()=>{
 const cfg=config();const wallBefore=cfg.overrides.wallThickness.P4110001;
 const report=buildPreviewB313WallUpdateReport({
  rows:[row()],config:cfg,xmlText:'',host:{dataset:{},
  __xmlCiiPreviewResult:{branchRows:[row()],nodeBoreWallRows:nodes}}});
 assert.equal(report.rows[0].status,'NOT_UPDATED');
 assert.equal(report.summary.calculatedRows,0,'screening must not count as approved calculation');
 assert.equal(report.rows[0].screeningReference.ok,true,JSON.stringify(report.rows[0]));
 assert.equal(Object.keys(cfg.b313WallUpdate.proposalsByBranch).length,0);
 assert.equal(Object.keys(cfg.b313WallUpdate.acceptedWallByBranch).length,0);
 assert.equal(cfg.overrides.wallThickness.P4110001,wallBefore);
 const html=renderPreviewB313WallAuditHtml(report);
 assert.match(html,/SCREENING MASTER LOOKUP — NOT PULL ELIGIBLE/);
 assert.match(html,/Conditional manufacturing/);
 assert.match(html,/data-b313-conditional-manufacturing/);
 assert.match(html,/<option value="SEAMLESS" data-b313-e="1" selected>/);
 assert.match(html,/data-b313-conditional-e-value>1<\/strong>/);
 assert.match(html,/data-b313-screening-scenario="SEAMLESS"/);
 assert.match(html,/Default Seamless: screening assumption, NOT verified pipe manufacture/);
 assert.match(html,/203\.395 MPa/);
 assert.match(html,/LINEAR_INTERPOLATION|EXACT/);
 assert.match(html,/5\.2448 mm/);
 assert.match(html,/not design approved/);
 assert.match(html,/Eligible proposals 0/);
});

test('source/edit conflict, missing T1, ambiguous OD cannot silently create screening wall',()=>{
 const base=row();
 for(const change of [
  [{t1:'',t1Source:'none'},[],false],
  [{material:'LTCS',materialCodeCorroborationCandidate:'ASTM A790 UNS S31803',
    materialCodeCorroborationSource:'piping-class-master-exact-DN'},nodes,false],
  [{},[...nodes,{...nodes[0],outsideDiameterMm:60.3}],true],
 ]){
  const [mutation,n,validFactors]=change;
  const ref=buildPreviewB313ScreeningReference({row:{...base,...mutation},
    config:config(),previewNodeRows:n,rowIndex:0});
  assert.equal(ref.scenarios?.length||0,0);
  if(validFactors)assert.equal(ref.ok,true);
 }
});

test('docs mirror of runtime screening module and Preview/Audit source are byte identical',()=>{
 for(const path of [
   'converters/b313-material-factors/screening-reference.js',
   'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js',
   'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-audit-controller.js',
 ]){
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const doc=readFileSync(new URL('../docs/'+path,import.meta.url),'utf8');
  assert.equal(source,doc,path);
 }
});
