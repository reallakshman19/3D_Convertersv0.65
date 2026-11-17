import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildPreviewB313LineListCoverage,buildPreviewB313WallUpdateReport,
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
