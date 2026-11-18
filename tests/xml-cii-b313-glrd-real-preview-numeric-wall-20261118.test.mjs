import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  buildPreviewB313ScreeningReference,
  buildPreviewB313CalculatedWallDisplay,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';
import {
  buildPreviewB313BasisWallCells,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-auto-basis.js';

// Transcribed from the owner-saved v0.65error(4).html physical Preview inputs.
// Deliberately no _sourceRowIndex and no physical Step-4 node OD, matching the
// observed "Neither a unique source-node OD nor exact-DN ..." failure.
// Values here are source-shaped regression witnesses, NOT a source/config replay.
const cases=[
  {lineKey:'P4110001',DN:200,P1:'13001',T1:'120',material:'DSS',cls:'93833',
   product:'ASTM A790 UNS S31803',sch:'80S',wall:12.7,CA:0,OD:219,
   expected:7.799691,stress:'EXACT'},
  {lineKey:'P4110001',DN:150,P1:'13001',T1:'120',material:'DSS',cls:'93833',
   product:'ASTM A790 UNS S31803',sch:'40S',wall:7.112,CA:0,OD:168,
   expected:5.983324,stress:'EXACT'},
  {lineKey:'B4110003',DN:100,P1:'701.3',T1:'82',material:'LTCS',cls:'11502',
   product:'ASTM A333-6',sch:'40',wall:6.0198,CA:3,OD:114,
   expected:3.759199,stress:'LINEAR_INTERPOLATION'},
  {lineKey:'B4110003',DN:400,P1:'701.3',T1:'82',material:'LTCS',cls:'11502',
   product:'ASTM A333-6',sch:'20',wall:7.9248,CA:3,OD:406,
   expected:4.606070,stress:'LINEAR_INTERPOLATION'},
];
const fixture=(x,i)=>({
  branchName:'OWNER-SAVED-4PREVIEW-'+i+'-'+x.lineKey,
  branchOccurrenceIndex:i,lineKey:x.lineKey,sizeMm:x.DN,
  material:x.material,materialSource:'process-linelist-material',
  t1:x.T1,t1Source:'linelist',p1:x.P1,p1Source:'linelist',
  p1Unit:'',p1UnitSource:'unresolved',corrosion:String(x.CA),
  pipingClass:x.cls,pipingClassPipeDnMm:x.DN,
  pipingClassPipeMaterial:x.product,pipingClassPipeSchedule:x.sch,
  pipingClassPipeWallMm:x.wall,pipingClassPipeSourceRow:null,
});
const config=()=>({b313WallUpdate:{
  bases:{},proposalsByBranch:{},acceptedWallByBranch:{},
  millTolerance:{basis:'percent',value:12.5},commonPressureUnitFallback:'AUTO',
},overrides:{wallThickness:{'P4110001':'11.4','B4110003':'8.2'}}});
const close=(actual,expected,tol=0.002)=>
  assert(Math.abs(Number(actual)-expected)<tol,actual+' versus '+expected);

test('four owner-saved real-shaped complete rows display numerical B31.3 what-if despite missing private class row index',()=>{
  const cfg=config(),saved=JSON.stringify(cfg);
  for(const [i,x] of cases.entries()){
    const row=fixture(x,i),before=JSON.stringify(row);
    const display=buildPreviewB313CalculatedWallDisplay({
      row,config:cfg,previewNodeRows:[],rowIndex:i,
    });
    assert.equal(display.ok,true,'Row '+(i+1)+' '+JSON.stringify(display));
    assert.equal(display.code,'HYPOTHETICAL_KPA_UNIT_UNVERIFIED');
    assert.equal(display.hypotheticalKpa,true);
    assert.equal(display.pressureUnit,'KPA');
    assert.equal(display.pressureUnitAssumed,true);
    assert.equal(display.sourcePressureUnitUnverified,true);
    assert.equal(display.eligibleForPull,false);
    assert.equal(display.stressLookupMethod,x.stress);
    assert.equal(display.factors.E,1,'conditional Seamless E=1 only');
    assert.equal(display.factors.W,1);
    assert.equal(display.factors.Y,0.4);
    assert.equal(display.outsideDiameterSource,'pipe-wall-master-exact-DN-SCREENING-ONLY');
    close(display.outsideDiameterMm,x.OD,0.001);
    close(display.requiredNominalThicknessMm,x.expected);
    assert.equal(JSON.stringify(row),before,'Preview row altered');
  }
  assert.equal(JSON.stringify(cfg),saved,'reference code wrote config, overrides or Pull');
});

test('when user selects ONE shared kPa unit, same four figures remain not Pull approved',()=>{
  const cfg=config();cfg.b313WallUpdate.commonPressureUnitFallback='KPA';
  const saved=JSON.stringify(cfg);
  const rows=cases.map(fixture);
  const cells=buildPreviewB313BasisWallCells(rows,cfg,[]);
  const outputs=[...cells.values()].flat();
  assert.equal(outputs.length,4);
  for(const [i,item] of outputs.entries()){
    assert.equal(item.result.ok,true,JSON.stringify(item.result));
    assert.equal(item.result.hypotheticalKpa,false);
    assert.equal(item.result.pressureUnitAssumed,true);
    assert.equal(item.result.eligibleForPull,false);
    close(item.result.requiredNominalThicknessMm,cases[i].expected);
  }
  assert.equal(JSON.stringify(cfg),saved);
});

test('a verified Preview P1 unit is not disguised as hypothetical',()=>{
  const row={...fixture(cases[1],1),p1Unit:'KPA',p1UnitSource:'user-reviewed-preview-unit'};
  const display=buildPreviewB313CalculatedWallDisplay({row,config:config(),rowIndex:1});
  assert.equal(display.ok,true);
  assert.equal(display.hypotheticalKpa,false);
  assert.equal(display.pressureUnitAssumed,false);
  assert.equal(display.pressureUnitSource,'user-reviewed-preview-unit');
  assert.equal(display.eligibleForPull,false,'screening factors still unqualified');
  close(display.requiredNominalThicknessMm,cases[1].expected);
});

test('incomplete or contradictory engineering inputs remain blank, even for a kPa hypothetical',()=>{
  const sample=fixture(cases[1],1);
  const errors=[
    {...sample,p1:''},
    {...sample,t1:'',t1Source:'none'},
    {...sample,pipingClassPipeDnMm:200},
    {...sample,pipingClassPipeSchedule:'FICTITIOUS'},
    {...sample,pipingClassPipeWallMm:999},
    {...sample,pipingClassPipeMaterial:''},
    {...sample,p1UnitSource:'LINE_LIST_P1_UNIT_CONFLICT'},
  ];
  for(const input of errors){
    const display=buildPreviewB313CalculatedWallDisplay({row:input,config:config(),rowIndex:1});
    assert.equal(display.ok,false,JSON.stringify(input)+' unexpectedly calculated '+JSON.stringify(display));
  }
  const outOfParity=buildPreviewB313CalculatedWallDisplay({
    row:sample,config:config(),rowIndex:1,
    previewNodeRows:[{branchOccurrenceIndex:1,componentType:'PIPE',outsideDiameterMm:501}],
  });
  assert.equal(outOfParity.ok,false,'wrong real source-node OD cannot be bypassed by class reference');
});

test('strict Class Pull still requires real source-row identity; display fallback never qualifies it',()=>{
  const row=fixture(cases[1],1),cfg=config();
  const ref=buildPreviewB313ScreeningReference({row,config:cfg,rowIndex:1});
  assert(ref.holdReasons.includes('P1 pressure unit unresolved'),
    'governed screening reference must still reject missing source unit');
  assert.equal(ref.scenarios.length,0);
  const display=buildPreviewB313CalculatedWallDisplay({row,config:cfg,rowIndex:1});
  assert.equal(display.classPass,false,'missing source-row index remains a governed class HOLD');
  assert.equal(display.eligibleForPull,false);
  assert(!Object.keys(cfg.b313WallUpdate.acceptedWallByBranch).length);
  assert(!Object.keys(cfg.b313WallUpdate.proposalsByBranch).length);
});

test('source and served Pages B31.3 module mirrors are byte identical',()=>{
  for(const name of ['xml-cii-adapted-preview-b313-wall-update.js',
   'xml-cii-adapted-preview-b313-auto-basis.js',
   'xml-cii-adapted-preview-b313-wall-audit-controller.js']){
    const a=readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/'+name,import.meta.url));
    const b=readFileSync(new URL('../docs/tabs/xml-cii-2019-standalone/ui-adapted/'+name,import.meta.url));
    assert.deepEqual(a,b,name);
  }
});
