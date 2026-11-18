import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildPreviewB313LineListCoverage,buildPreviewB313WallUpdateReport,
 buildPreviewB313SourceToWallLedger,previewB313LedgerCsv,
 collectPreviewB313IndependentIssues
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';
import {renderPreviewB313WallAuditHtml,derivePreviewB313AuditRootCauseGroups}
 from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-audit-controller.js';

// Reconstructs the missingness in the OWNER-SAVED Nov 17 30-row DOM.
// All 30 identities originate in the pinned source-ordered GLRD matrix;
// 16 loaded master rows and seven populated physical rows are assertions
// about the saved screenshot, NOT a claim of source engineering approval.
const manifest=JSON.parse(readFileSync(new URL('../engineering/b313/glrd-psi02-factor-groups.json',import.meta.url),'utf8'));
const populated=new Map([[0,'120'],[1,'120'],[3,'82'],[4,'82'],[27,'120'],[28,'82'],[29,'82']]);
const rows=manifest.rows.map((r,i)=>({
 branchName:r.branchName,lineKey:r.lineKey,pipingClass:r.classCodeFromBranchName,
 sizeMm:50,material: populated.has(i)?(i===0||i===1||i===27?'DSS':'LTCS'):'',
 materialSource:populated.has(i)?'process-linelist-material':'',
 t1:populated.get(i)||'',t1Source:populated.has(i)?'linelist':'none',
 p1:populated.has(i)?(i===0||i===1||i===27?'13001':'701.3'):'',
 p1Source:populated.has(i)?'linelist':'none',p1Unit:'',
 lineMiss:!populated.has(i),lineKeyMethod:populated.has(i)?'exact':'none',
}));
const config={linelist:{masterRows:Array.from({length:16},(_,i)=>({lineKey:'ACTUAL-MASTER-'+i}))},
 b313WallUpdate:{bases:{},proposalsByBranch:{},materialFallback:{enabled:false}}};


test('30 physical-row source-to-wall ledger is complete, never treats screening as approved',()=>{
 const beforeRows=JSON.stringify(rows);
 const report=buildPreviewB313WallUpdateReport({rows,config});
 const ledger=buildPreviewB313SourceToWallLedger(report);
 assert.equal(ledger.rows.length,30);
 assert.equal(ledger.inputRows,30);
 assert.equal(ledger.projectWorkbookIdentity,'NOT_AVAILABLE_IN_PREVIEW_CONFIG');
 assert.equal(ledger.rows.filter(r=>r.sourceCoverageStatus==='NO_SELECTED_MASTER_LINE').length,23);
 assert.equal(ledger.rows.filter(r=>r.sourceCoverageStatus==='PREVIEW_MASTER_OUT_OF_SYNC').length,7);
 assert.equal(ledger.rows.filter(r=>r.pullEligible).length,0);
 assert.equal(ledger.rows.filter(r=>r.qualifiedStatus==='NOT_UPDATED').length,30);
 assert.equal(ledger.rows[0].p1,'13001');
 assert.equal(ledger.rows[0].t1,'120');
 assert(ledger.rows[0].qualifiedCode);
 const csv=previewB313LedgerCsv(ledger);
 assert.equal(csv.split('\r\n').filter(Boolean).length,31);
 assert.match(csv,/sourceCoverageStatus/);
 assert.match(csv,/P1_UNIT_SOURCE_UNRESOLVED|PREVIEW_MASTER_OUT_OF_SYNC/);
 const html=renderPreviewB313WallAuditHtml(report);
 assert.match(html,/Download source → wall CSV \(30 rows\)/);
 assert.match(html,/Independent selected-master cross-check/);
 assert.equal(JSON.stringify(rows),beforeRows,'source rows were mutated by proof export');
});

test('CSV export never evaluates workbook-supplied formula-like strings',()=>{
 const csv=previewB313LedgerCsv({rows:[{
  ordinal:1,branchName:'=HYPERLINK("https://example.invalid")',lineKey:'-1',
  harmless:'P4110001',
 }]});
 assert.match(csv,/'=HYPERLINK/);
 assert.match(csv,/"'-1"/);
 assert.match(csv,/"P4110001"/);
});

test('master diagnostics distinguish unique exact, unique alias, duplicates and stale Preview',()=>{
 const base={branchName:'BR-A',lineKey:'P4110001',p1:'13001',t1:'120',
  p1Source:'linelist',t1Source:'linelist',lineMiss:false};
 const row1={'Line number':'P4110001','Pressure Max kPa(g)':13001,'Temp. Max °C':120};
 const row2={'Line number':'P4110001','Pressure Max kPa(g)':9999};
 const exact=buildPreviewB313LineListCoverage([base],{linelist:{masterRows:[row1]}});
 assert.equal(exact.sourceReceipts[0].selectedMasterMatch,'EXACT_UNIQUE');
 assert.equal(exact.sourceReceipts[0].selectedMasterRowOrdinal,1);
 assert.equal(exact.sourceReceipts[0].p1Unit,'KPA');
 assert.equal(exact.sourceReceipts[0].code,'MATCHED_PROCESS_INPUTS_PRESENT');
 assert.equal(exact.sourceReceipts[0].sourceP1,'13001');
 assert.equal(exact.sourceReceipts[0].sourceT1,'120');
 assert.equal(exact.sourceReceipts[0].sourceP1MatchesPreview,true);
 assert.equal(exact.sourceReceipts[0].sourceT1MatchesPreview,true);
 assert.equal(exact.sourceReceipts[0].p1UnitSource,'line-list-column:Pressure Max kPa(g)');
 const changedP=buildPreviewB313LineListCoverage([{...base,p1:'13002'}],
   {linelist:{masterRows:[row1]}});
 assert.equal(changedP.sourceReceipts[0].code,'PREVIEW_SOURCE_P1_CONFLICT');
 assert.equal(changedP.sourceReceipts[0].sourceP1MatchesPreview,false);
 const changedT=buildPreviewB313LineListCoverage([{...base,t1:'121'}],
   {linelist:{masterRows:[row1]}});
 assert.equal(changedT.sourceReceipts[0].code,'PREVIEW_SOURCE_T1_CONFLICT');
 assert.equal(changedT.sourceReceipts[0].sourceT1MatchesPreview,false);
 const ranged=buildPreviewB313LineListCoverage([base],{linelist:{
   masterRows:[{...row1,'Temp. Max °C':'80-120'}]}});
 assert.equal(ranged.sourceReceipts[0].sourceT1Raw,'80-120');
 assert.equal(ranged.sourceReceipts[0].sourceT1,'120');
 assert.equal(ranged.sourceReceipts[0].sourceT1MatchesPreview,true);
 const duplicate=buildPreviewB313LineListCoverage([base],
   {linelist:{masterRows:[row1,row2]}});
 assert.equal(duplicate.sourceReceipts[0].code,'AMBIGUOUS_SELECTED_MASTER');
 assert.equal(duplicate.sourceReceipts[0].selectedMasterRowOrdinal,null);
 const alias=buildPreviewB313LineListCoverage([base],
   {linelist:{masterRows:[{'Line number':'4110001','Pressure Max kPa(g)':13001}]}});
 assert.equal(alias.sourceReceipts[0].selectedMasterMatch,'ALIAS_UNIQUE');
 assert.equal(alias.sourceReceipts[0].selectedMasterRowOrdinal,1);
 const unrelatedB=buildPreviewB313LineListCoverage([
   {...base,lineKey:'B4110001',lineMiss:true}],
   {linelist:{masterRows:[{'Line number':'4110001','Pressure Max kPa(g)':13001}]}});
 assert.equal(unrelatedB.sourceReceipts[0].selectedMasterMatch,'NO_MATCH',
   'B branch cannot borrow P pipe numeric-only source row');
 const unrelatedBFromP=buildPreviewB313LineListCoverage([
   {...base,lineKey:'B4110001',lineMiss:true}],
   {linelist:{masterRows:[{'Line number':'P4110001','Pressure Max kPa(g)':13001}]}});
 assert.equal(unrelatedBFromP.sourceReceipts[0].selectedMasterMatch,'NO_MATCH');
 const changed=buildPreviewB313LineListCoverage([{...base,lineMiss:true}],
   {linelist:{masterRows:[row1]}});
 assert.equal(changed.sourceReceipts[0].code,'PREVIEW_REBUILD_REQUIRED');
 const missing=buildPreviewB313LineListCoverage([base],
   {linelist:{masterRows:[{'Line number':'B4110099'}]}});
 assert.equal(missing.sourceReceipts[0].code,'PREVIEW_MASTER_OUT_OF_SYNC');
});

test('saved 16-row worksheet covers only seven physical branches: 23 gaps / 18 distinct missing line keys',()=>{
 const before=JSON.stringify(rows);
 const coverage=buildPreviewB313LineListCoverage(rows,config);
 assert.deepEqual([
  coverage.physicalRows,coverage.loadedLineListRows,coverage.matchedPhysicalRows,
  coverage.unmatchedPhysicalRows,coverage.missingT1Rows,coverage.missingP1Rows,
  coverage.missingProcessRows,coverage.missingLineKeys.length],
  [30,16,7,23,23,23,23,18]);
 assert.equal(coverage.sourceEvidenceComplete,false);
 assert(coverage.missingLineKeys.includes('P4110028'));
 assert(coverage.missingLineKeys.includes('B4110011'));
 assert.equal(JSON.stringify(rows),before,'no default T1/P1/material values are ever synthesized');
});

test('B31.3 report prioritizes missing physical source evidence, no false wall and action-oriented audit',()=>{
 const report=buildPreviewB313WallUpdateReport({rows,config});
 assert.equal(report.rows.length,30);
 assert.equal(report.rows.filter(r=>r.code==='B313_PREVIEW_LINE_LIST_SOURCE_MISSING').length,23);
 assert.equal(report.summary.calculatedRows,0);
 assert.equal(report.summary.updatedRows,0);
 assert.equal(report.lineListCoverage.loadedLineListRows,16);
 assert.equal(Object.keys(config.b313WallUpdate.proposalsByBranch).length,0);
 const html=renderPreviewB313WallAuditHtml(report);
 assert.match(html,/UPSTREAM LINE LIST COVERAGE HOLD/);
 assert.match(html,/23 physical branches lack P1\/T1 source evidence/);
 assert.match(html,/Loaded Line List: <strong>16 rows/);
 assert.match(html,/missing T1 23/);
 assert.match(html,/Missing line keys \(18\)/);
 assert.match(html,/Open 1 Source &amp; Masters/);
 assert.match(html,/Linelist/);
 assert(!html.includes('REPLACE_WITH_120'));
 const groups=derivePreviewB313AuditRootCauseGroups(report);
 assert(groups.some(g=>g.code==='B313_PREVIEW_LINE_LIST_SOURCE_MISSING'&&g.count===23));
});

test('missing-source classifier does not block an independently supplied explicit P1/T1 override',()=>{
 const row={...rows[2],t1:'82',t1Source:'override',p1:'701.3',p1Source:'override'};
 const coverage=buildPreviewB313LineListCoverage([row],config);
 assert.equal(coverage.missingProcessRows,0);
 assert.equal(coverage.unmatchedPhysicalRows,1);
 const report=buildPreviewB313WallUpdateReport({rows:[row],config});
 assert.notEqual(report.rows[0].code,'B313_PREVIEW_LINE_LIST_SOURCE_MISSING');
 assert.equal(report.summary.calculatedRows,0,'No qualified factors or pressure unit');
 const issues=collectPreviewB313IndependentIssues(rows[2],config);
 assert(issues.some(x=>x.code==='B313_PREVIEW_LINE_LIST_SOURCE_MISSING'));
});

test('source evidence mismatch survives already-identified class product but never approves design',()=>{
 const row={...rows[2],material:'DSS',pipingClassPipeMaterial:'ASTM A790 UNS S31803',
   materialCodeCorroborationSource:'piping-class-master-exact-DN',
   materialCodeCorroborationCandidate:'ASTM A790 UNS S31803'};
 const report=buildPreviewB313WallUpdateReport({rows:[row],config});
 assert.equal(report.rows[0].code,'B313_PREVIEW_LINE_LIST_SOURCE_MISSING',
  'class product is not authority for the missing process design inputs');
 assert.equal(report.summary.calculatedRows,0);
});
