import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  derivePreviewB313AutoBasisRow, renderPreviewB313NumericScreeningReference,
  setPreviewB313PressureUnitOnly,previewB313FactorPrefill,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-auto-basis.js';
import {
  buildPreviewB313ScreeningReference,previewB313BasisKey,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';

const class93833=JSON.parse(readFileSync(new URL('../docs/Masters/SpecwisePipingClass/93833.json',import.meta.url)));
const class11502=JSON.parse(readFileSync(new URL('../docs/Masters/SpecwisePipingClass/11502.json',import.meta.url)));
const models=[
  {rowNumber:1,lineKey:'P4110001',material:'DSS',t1:'120',p1:'13001',
    dn:200,pipingClass:'93833',catalog:class93833,expectedS:29.5,lookup:'EXACT'},
  {rowNumber:2,lineKey:'P4110001',material:'DSS',t1:'120',p1:'13001',
    dn:150,pipingClass:'93833',catalog:class93833,expectedS:29.5,lookup:'EXACT'},
  {rowNumber:29,lineKey:'B4110003',material:'LTCS',t1:'82',p1:'701.3',
    dn:100,pipingClass:'11502',catalog:class11502,expectedS:20,lookup:'LINEAR_INTERPOLATION'},
  {rowNumber:30,lineKey:'B4110003',material:'LTCS',t1:'82',p1:'701.3',
    dn:400,pipingClass:'11502',catalog:class11502,expectedS:20,lookup:'LINEAR_INTERPOLATION'},
];
function physicalRow(sample){
  const cls=sample.catalog.rows.find(r=>Number(r.convertedBore)===sample.dn);
  assert(cls,'Missing exact-DN class master '+sample.pipingClass+' DN'+sample.dn);
  return {
    branchName:'GLRD-SAVED-PREVIEW-ROW-'+sample.rowNumber,
    branchOccurrenceIndex:sample.rowNumber-1,lineKey:sample.lineKey,
    material:sample.material,materialSource:'process-linelist-material',
    t1:sample.t1,t1Source:'linelist',p1:sample.p1,p1Source:'linelist',
    p1Unit:'',corrosion:String(cls.Corrosion??0),
    pipingClass:sample.pipingClass,sizeMm:sample.dn,
    pipingClassPipeDnMm:cls.convertedBore,
    pipingClassPipeWallMm:cls['Wall thickness'],
    pipingClassPipeMaterial:cls.Material_Name,
    pipingClassPipeSchedule:cls.SCH,
    pipingClassPipeSourceRow:cls._sourceRowIndex,
    pipingClassPipeCorrosionMm:cls.Corrosion,
  };
}
const near=(a,b,t=.00001)=>assert(Math.abs(Number(a)-b)<t,String(a)+' versus '+b);

test('exact 4 Preview row numerical coefficient reference is shown BEFORE pressing Calculate',()=>{
  for(const sample of models){
    const row=physicalRow(sample);
    const model=derivePreviewB313AutoBasisRow(row,{});
    assert.equal(model.screeningReference?.ok,true,
      sample.rowNumber+': '+JSON.stringify(model.screeningReference));
    assert.equal(model.screeningReference.S.method,sample.lookup);
    near(model.screeningReference.S.ksi,sample.expectedS);
    assert.equal(model.screeningReference.E,1);
    assert.equal(model.screeningReference.W,1);
    assert.equal(model.screeningReference.Y,.4);
    assert.equal(model.screeningReference.eligibleForPull,false);
    assert.notEqual(model.statusCode,'AUTO_READY','Screening must not authorize qualified master');
    const html=renderPreviewB313NumericScreeningReference(model);
    assert.match(html,/data-b313-auto-screening-reference/);
    assert.match(html,/MASTER SCREENING NUMBERS/);
    assert.match(html,/reference only, not Pull eligible/);
    assert.match(html,/S \d+\.\d{3} MPa/);
    assert.match(html,/E 1 \(conditional Seamless\) · W 1 · Y 0\.4/);
    assert.match(html,new RegExp(sample.lookup));
    if(sample.lookup==='LINEAR_INTERPOLATION')
      assert.match(html,/80°C: 20 ksi → 120°C: 20 ksi/);
    else assert.match(html,/120°C: 29\.5 ksi/);
  }
});

test('missing 4 Preview T1 never invents a screening stress',()=>{
 const noTemp=physicalRow(models[0]);noTemp.t1='';
 const m=derivePreviewB313AutoBasisRow(noTemp,{});
 assert.equal(m.screeningReference,undefined);
 assert.equal(renderPreviewB313NumericScreeningReference(m),'');
 assert.equal(m.statusCode,'B313_PREVIEW_T1_REQUIRED');
});

test('unit change independently unlocks conditional wall but never approves screening coefficients',()=>{
 const sample=models[1];const row=physicalRow(sample);
 const config={b313WallUpdate:{bases:{},proposalsByBranch:{},
  acceptedWallByBranch:{},millTolerance:{basis:'percent',value:12.5}}};
 const before=JSON.stringify(config);
 const initial=buildPreviewB313ScreeningReference({row,config,previewNodeRows:[],
  rowIndex:sample.rowNumber-1});
 assert.equal(initial.ok,true);
 assert.equal(initial.scenarios.length,0,'no P unit should mean no wall result');
 assert(initial.holdReasons.includes('P1 pressure unit unresolved'));
 const basisKey=previewB313BasisKey(row,config);
 const result=setPreviewB313PressureUnitOnly(config,basisKey,'KPA');
 assert.equal(result.ok,true);
 assert.equal(result.eligibleForPull,false);
 assert.equal(config.b313WallUpdate.bases[basisKey].pressureUnit,'KPA');
 assert.equal(config.b313WallUpdate.bases[basisKey].designApproved,undefined);
 assert.equal(Object.keys(config.b313WallUpdate.proposalsByBranch).length,0);
 assert.equal(Object.keys(config.b313WallUpdate.acceptedWallByBranch).length,0);
 const calculated=buildPreviewB313ScreeningReference({
  row,config,previewNodeRows:[],rowIndex:sample.rowNumber-1});
 assert.equal(calculated.pressureUnit,'KPA');
 assert.equal(calculated.conditionalManufacturing,'SEAMLESS');
 assert.equal(calculated.conditionalE,1);
 assert.equal(calculated.conditionalScenario.calculationOk,true,JSON.stringify(calculated));
 near(calculated.conditionalScenario.pressureDesignThicknessMm,5.235408926,1e-5);
 assert.equal(calculated.eligibleForPull,false);
 assert.notEqual(JSON.stringify(config),before,'explicit P-unit selection should persist');
 const changed=structuredClone(config);
 changed.b313WallUpdate.bases[basisKey].allowableStress=9999;
 assert.equal(buildPreviewB313ScreeningReference({
  row,config:changed,previewNodeRows:[],rowIndex:sample.rowNumber-1
 }).S.ksi,29.5,'manual/strict stress fields must not contaminate master reference');
});

test('a saved physical P-unit choice is occurrence scoped and leaves factor approval unaltered',()=>{
 const first=physicalRow(models[0]),second=physicalRow(models[1]);
 const cfg={b313WallUpdate:{bases:{}}};
 const key1=previewB313BasisKey(first,cfg),key2=previewB313BasisKey(second,cfg);
 assert.notEqual(key1,key2);
 cfg.b313WallUpdate.bases[key1]={identityReviewed:true,
  sourceReference:'EXISTING-APPROVAL-RECORD',designApproved:true};
 assert.equal(setPreviewB313PressureUnitOnly(cfg,key1,'MPA').ok,true);
 assert.equal(cfg.b313WallUpdate.bases[key1].identityReviewed,true);
 assert.equal(cfg.b313WallUpdate.bases[key1].sourceReference,'EXISTING-APPROVAL-RECORD');
 assert.equal(cfg.b313WallUpdate.bases[key1].designApproved,true);
 assert.equal(cfg.b313WallUpdate.bases[key2],undefined);
 assert.deepEqual(setPreviewB313PressureUnitOnly(cfg,key1,'kilograms'),{
   ok:false,code:'INVALID_PREVIEW_P_UNIT'});
});


test('automatic 4 Preview S/E/W/Y controls are populated from source master with qualification and evidence',()=>{
 const expected={allowableStress:0,qualityFactorE:1,weldStrengthReductionW:1,coefficientY:0.4};
 for(const sample of models){
   const row=physicalRow(sample);
   const cfg={b313WallUpdate:{bases:{},proposalsByBranch:{},acceptedWallByBranch:{}}};
   const before=JSON.stringify(cfg);
   const model=derivePreviewB313AutoBasisRow(row,cfg);
   const prefill=previewB313FactorPrefill(model);
   assert.equal(prefill.qualification,'SCREENING_NOT_QUALIFIED');
   assert.equal(prefill.stressUnit,'MPa');
   near(prefill.values.allowableStress,sample.expectedS*6.894757293168361,0.00001);
   for(const field of Object.keys(expected).filter(k=>k!=='allowableStress')){
     assert.equal(prefill.values[field],expected[field],sample.lineKey+' '+field);
   }
   assert(Object.values(prefill.origins).every(v=>v==='SCREENING_MASTER'));
   assert.equal(prefill.eligibleForPull,false);
   assert.match(prefill.sourceReference,/^SCREENING_ONLY:OWNER-B313-SEWY-2026-08-11/);
   assert.equal(prefill.evidence.basisStatus,'SCREENING');
   assert.equal(prefill.evidence.stressLookupMethod,sample.lookup);
   assert.equal(prefill.evidence.qualification,'SCREENING_NOT_VERIFIED_FOR_PROJECT_B313_2024');
   assert.equal(prefill.evidence.eligibleForPull,false);
   assert.match(prefill.evidence.sourceReference,/User message 2026-08-11/);
   assert.match(prefill.evidence.editionBasis,/not independently verified/);
   assert.equal(JSON.stringify(cfg),before,'auto-fill must not modify saved bases or approve Pull');
 }
});

test('reviewed/manual entered values are preserved; unfilled columns still use interpolated master',()=>{
 const row=physicalRow(models[2]),key=previewB313BasisKey(row,{});
 const cfg={b313WallUpdate:{bases:{[key]:{
   allowableStress:149,stressUnit:'MPa',qualityFactorE:0.85,
   sourceReference:'CONTROLLED-ENG-REF-123',designApproved:true,
 }}}};
 const model=derivePreviewB313AutoBasisRow(row,cfg);
 const prefill=previewB313FactorPrefill(model);
 assert.equal(prefill.values.allowableStress,149);
 assert.equal(prefill.values.qualityFactorE,0.85);
 assert.equal(prefill.values.weldStrengthReductionW,1);
 assert.equal(prefill.values.coefficientY,0.4);
 assert.equal(prefill.origins.allowableStress,'EXPLICIT_SAVED');
 assert.equal(prefill.origins.qualityFactorE,'EXPLICIT_SAVED');
 assert.equal(prefill.origins.weldStrengthReductionW,'SCREENING_MASTER');
 assert.equal(prefill.sourceReference,'CONTROLLED-ENG-REF-123');
 assert.equal(prefill.qualification,'SCREENING_NOT_QUALIFIED',
   'Mixed manual/screening values must not be considered qualified as a whole');
});

test('missing T1 and absent screening basis never invent qualified factor values',()=>{
 const row=physicalRow(models[0]);row.t1='';
 const prefill=previewB313FactorPrefill(derivePreviewB313AutoBasisRow(row,{}));
 assert.equal(prefill.values.allowableStress,'');
 assert.equal(prefill.qualification,'SOURCE_OR_FACTOR_MISSING');
 assert.equal(prefill.evidence,null);
 assert.equal(prefill.sourceReference,'');
});

test('SCREENING_ONLY cannot pass manual factor basis qualification even if a reviewer box is set',async()=>{
 const {resolvePreviewB313FactorBasis}=await import('../converters/xml-cii2019-core/b313-preview-wall-update.js');
 const row=physicalRow(models[0]),model=derivePreviewB313AutoBasisRow(row,{});
 const filled=previewB313FactorPrefill(model);
 const bad=resolvePreviewB313FactorBasis({
   materialIdentity:{ok:true,material:{materialId:'DSS-A790-S31803'}},
   designTemperatureC:120,manufacturingRoute:'SEAMLESS',
   manualBasis:{...filled.values,stressUnit:'MPa',
     sourceReference:filled.sourceReference,designApproved:true}
 });
 assert.equal(bad.ok,false,'Screening-only source must never become qualified manual fallback');
 assert.equal(bad.code,'B313_PREVIEW_FACTOR_BASIS_UNAVAILABLE');
 assert(bad.details.manualMissing.some(x=>x.includes('SCREENING master evidence')));
});

test('served docs and source auto-basis modules stay byte identical',()=>{
 const a=readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-auto-basis.js',import.meta.url));
 const b=readFileSync(new URL('../docs/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-auto-basis.js',import.meta.url));
 assert.deepEqual(a,b);
});
