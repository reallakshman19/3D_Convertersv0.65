import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveXmlCiiB313ClassMaterialEvidence } from '../converters/xml-cii2019-core/branch-process-resolver.js';
import { resolvePreviewB313MaterialFromRow, buildPreviewB313WallUpdateReport,
  previewB313BasisKey, b313SourceConfirmsA106Seamless }
  from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';
import { previewB313SourceTrace, derivePreviewB313AutoBasisRow }
  from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-auto-basis.js';
import { b313PreviewInputSignature } from '../converters/xml-cii2019-core/b313-preview-pull-authority.js';

const cls93833=JSON.parse(readFileSync(new URL('../docs/Masters/SpecwisePipingClass/93833.json', import.meta.url),'utf8'));
const cls11502=JSON.parse(readFileSync(new URL('../docs/Masters/SpecwisePipingClass/11502.json', import.meta.url),'utf8'));
const cfg={useDefaultPipingClassMaterialCodeMap:true,b313WallUpdate:{materialFallback:{enabled:true,family:'CS'}}};
const pick=(data,dn)=>data.rows.find(x=>Number(x.convertedBore)===dn);
const effective=(master,dn,material,branch,t1='120')=>{
 const cls=master.specKey,raw=pick(master,dn);
 assert(raw,'Expected class/DN '+cls+' '+dn);
 const resolved=resolveXmlCiiB313ClassMaterialEvidence({pipingClass:cls,config:cfg,pipingClassRow:raw,sizeMm:dn});
 return {
   branchName:branch,branchOccurrenceIndex:0,lineKey:branch.match(/-([PB]\d{7})-/)?.[1]||'',
   sizeMm:dn,pipingClass:cls,pipingClassNeedsReview:false,
   pipingClassConflict:false,pipingClassSelectionExplicit:false,
   material,materialSource:'process-linelist-material',t1,t1Source:'linelist',
   p1:'13001',p1Unit:'',p1Source:'linelist',hydroPressure:'22905',
   corrosion:raw.Corrosion,wallThickness:String(raw['Wall thickness']),
   materialCode:'',materialCodeMatchedMaterial:'',
   materialCodeCorroborationCandidate:resolved.materialCodeCorroborationCandidate,
   materialCodeCorroborationSource:resolved.materialCodeCorroborationSource,
   materialCodeCorroborationMethod:resolved.materialCodeCorroborationMethod,
   materialCodeCorroborationConfidence:resolved.materialCodeCorroborationConfidence,
   materialCodeCorroborationNeedsReview:resolved.materialCodeCorroborationNeedsReview,
   pipingClassPipeMaterial:raw.Material_Name,pipingClassPipeDnMm:raw.convertedBore,
   pipingClassPipeSourceRow:raw._sourceRowIndex,pipingClassPipeSchedule:raw.SCH,
   pipingClassPipeWallMm:raw['Wall thickness'],pipingClassPipeCorrosionMm:raw.Corrosion,
   pipingClassPipeRating:raw.Rating,
 };
};

test('GLRD 93833 DN200 uses actual exact class evidence, not an invented Step 8 mapping',()=>{
 const r=effective(cls93833,200,'DSS','/GLRD-1000-4"-P4110001-93833-01/B6');
 assert.equal(r.pipingClassPipeMaterial,'ASTM A790 UNS S31803');
 assert.equal(r.pipingClassPipeSchedule,'80S');
 assert.equal(Number(r.pipingClassPipeWallMm),12.7);
 assert.equal(r.materialCode,'');
 assert.equal(r.materialCodeCorroborationSource,'piping-class-master-exact-DN');
 const id=resolvePreviewB313MaterialFromRow(r,cfg);
 assert.equal(id.ok,true,JSON.stringify(id));
 assert.equal(id.material.materialId,'DSS-A790-S31803');
 const model=derivePreviewB313AutoBasisRow(r,cfg);
 assert.equal(model.materialId,'DSS-A790-S31803');
 assert.notEqual(model.statusCode,'AUTO_READY','No qualified master values published');
 const trace=previewB313SourceTrace(r);
 assert.match(trace,/Class 93833 \/ DN200/);
 assert.match(trace,/ASTM A790 UNS S31803/);
 assert.match(trace,/Sch 80S/);
 assert.match(trace,/nominal 12.7 mm/);
 assert.match(trace,/Material Code unresolved/);
 assert.equal(model.previewP1,'13001');
 assert.equal(model.previewHydroPressure,'22905');
});
test('GLRD LTCS process material on DSS class 93833 DN50 holds before S/E/W/Y lookup',()=>{
 const r=effective(cls93833,50,'LTCS','/GLRD-1000-2"-P4110003-93833-01/B2');
 assert.equal(r.pipingClassPipeMaterial,'ASTM A790 UNS S31803');
 assert.equal(Number(r.pipingClassPipeWallMm),3.9116);
 const id=resolvePreviewB313MaterialFromRow(r,cfg);
 assert.equal(id.ok,false);
 assert.equal(id.code,'B313_PREVIEW_CLASS_DN_MATERIAL_CONFLICT');
 assert.equal(id.details.previewMaterial,'LTCS');
 assert.equal(id.details.exactDnClassMaterial,'ASTM A790 UNS S31803');
 const m=derivePreviewB313AutoBasisRow(r,cfg);
 assert.equal(m.statusCode,'MATERIAL_UNRESOLVED');
 assert.match(m.factorSummary,/contradicts the effective Preview/i);
 const report=buildPreviewB313WallUpdateReport({rows:[r],config:structuredClone(cfg)});
 assert.equal(report.rows[0].code,'B313_PREVIEW_CLASS_DN_MATERIAL_CONFLICT');
 assert.equal(report.summary.calculatedRows,0);
});
test('material code cannot hide a contradictory physical class row',()=>{
 const r=effective(cls93833,50,'LTCS','/GLRD-1000-2"-P4110003-93833-01/B8');
 r.materialCode='177';
 r.materialCodeMatchedMaterial='ASTM A333-6';
 r.materialCodeSource='linelist-material-map';
 assert.equal(resolvePreviewB313MaterialFromRow(r,cfg).code,'B313_PREVIEW_CLASS_DN_MATERIAL_CONFLICT');
});
test('LTCS class 11502 source is corroborating only; not an S/E/W/Y authority',()=>{
 const r=effective(cls11502,50,'LTCS','/GLRD-1000-4"-B4110003-11502-01/B1','82');
 const id=resolvePreviewB313MaterialFromRow(r,cfg);
 assert.equal(id.ok,true,JSON.stringify(id));
 assert.equal(id.material.materialId,'LTCS-A333-6');
 assert.equal(r.pipingClassPipeMaterial,'ASTM A333-6');
 assert.equal(r.pipingClassPipeCorrosionMm,'3');
 const model=derivePreviewB313AutoBasisRow(r,cfg);
 assert.notEqual(model.statusCode,'AUTO_READY');
 assert.match(model.sourceTrace,/Class 11502/);
});
test('unreviewed class-source conflict holds even when grade is catalog-mapped',()=>{
 const r=effective(cls93833,200,'DSS','/GLRD-1000-4"-P4110001-93833-01/B6');
 r.pipingClassConflict=true;
 r.pipingClassRegex='93833';
 r.pipingClassLineList='11502';
 const denied=resolvePreviewB313MaterialFromRow(r,cfg);
 assert.equal(denied.code,'B313_PREVIEW_PIPING_CLASS_AUTHORITY_UNRESOLVED');
 r.pipingClassSelectionExplicit=true;
 assert.equal(resolvePreviewB313MaterialFromRow(r,cfg).ok,true,
   'A source-choice record may clear the class-selection conflict, without approving factors');
});
test('any material/master class provenance change invalidates a saved Pull signature',()=>{
 const a=effective(cls93833,200,'DSS','/GLRD-1000-4"-P4110001-93833-01/B6');
 const before=b313PreviewInputSignature(a,cfg);
 for(const change of [
   {pipingClassPipeMaterial:'ASTM A333-6'},
   {pipingClassPipeSchedule:'40S'},
   {pipingClassPipeWallMm:'7.112'},
   {pipingClassPipeCorrosionMm:'3'},
   {pipingClassPipeSourceRow:999},
 ])assert.notEqual(before,b313PreviewInputSignature({...a,...change},cfg));
});

test('typing a DSS manufacturing route cannot bypass physical evidence review',()=>{
 const r=effective(cls93833,200,'DSS','/GLRD-1000-4"-P4110001-93833-01/B6');
 const key=previewB313BasisKey(r,{});
 const config=basis=>({b313WallUpdate:{bases:{[key]:basis}}});
 const unverified=buildPreviewB313WallUpdateReport({
   rows:[r],config:config({manufacturingRoute:'SEAMLESS'})});
 assert.equal(unverified.rows[0].code,'B313_PREVIEW_MANUFACTURING_ROUTE_EVIDENCE_REQUIRED');
 const sourcedButNotReviewed=buildPreviewB313WallUpdateReport({
   rows:[r],config:config({manufacturingRoute:'SEAMLESS',manufacturingRouteSourceReference:'MTR-FILE-PLACEHOLDER'})});
 assert.equal(sourcedButNotReviewed.rows[0].code,'B313_PREVIEW_MANUFACTURING_ROUTE_EVIDENCE_REQUIRED');
 const sourced=buildPreviewB313WallUpdateReport({
   rows:[r],config:config({manufacturingRoute:'SEAMLESS',
     manufacturingRouteSourceReference:'CONTROLLED-PIPE-SPEC-TEST-ONLY',
     manufacturingRouteEvidenceReviewed:true})});
 assert.notEqual(sourced.rows[0].code,'B313_PREVIEW_MANUFACTURING_ROUTE_EVIDENCE_REQUIRED');
 assert.equal(sourced.rows[0].status,'NOT_UPDATED');
 assert.equal(sourced.summary.calculatedRows,0,'Route proof does not qualify missing S/E/W/Y');
});
test('exact ASTM A106 product corroborates seamless; generic CS family does not',()=>{
 const a={material:'ASTM A106-B',materialSource:'process-linelist-material'};
 const ia=resolvePreviewB313MaterialFromRow(a,{});
 assert.equal(ia.ok,true);
 assert.equal(b313SourceConfirmsA106Seamless(a,ia),true);
 const family={material:'CS',materialSource:'process-linelist-material'};
 const im=resolvePreviewB313MaterialFromRow(family,{});
 assert.equal(b313SourceConfirmsA106Seamless(family,im),false);
});
test('existing Step 4 automatic panel exposes editable pipe route source and review',()=>{
 const src=readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-auto-basis.js',import.meta.url),'utf8');
 assert.match(src,/data-b313-auto-route-source/);
 assert.match(src,/data-b313-auto-route-reviewed/);
 assert.match(src,/data-b313-auto-route/);
 assert.match(src,/routeOnly/);
 assert.match(src,/ROUTE EVIDENCE REQUIRED/);
});
