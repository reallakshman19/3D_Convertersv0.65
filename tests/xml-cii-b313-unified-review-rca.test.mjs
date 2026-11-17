import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectPreviewB313IndependentIssues, buildPreviewB313WallUpdateReport } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';
import { derivePreviewB313AuditRootCauseGroups, renderPreviewB313WallAuditHtml } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-audit-controller.js';

const row = {
  branchName: '/GLRD-1000-4"-P4110001-93833-01/B6', lineKey: 'P4110001',
  material: 'DSS', materialSource: 'process-linelist-material',
  t1: '120', t1Source: 'linelist', p1: '13001', p1Source: 'linelist',
  p1Unit: '', hydroPressure: '22905', sizeMm: 150, pipingClass: '93833', corrosion: '0',
};
const config = { b313WallUpdate: {
  millTolerance: {basis:'percent',value:12.5}, materialFallback: {enabled:false},
  bases: {}, proposalsByBranch: {}
} };

test('independent diagnostics expose unknown P1 unit without changing sources', () => {
  const before = JSON.stringify(config);
  const issues = collectPreviewB313IndependentIssues(row, config);
  assert.ok(issues.some(x => x.code === 'B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED'));
  assert.ok(!issues.some(x => x.code === 'B313_PREVIEW_PRESSURE_REQUIRED'));
  assert.equal(JSON.stringify(config), before);
  assert.ok(!collectPreviewB313IndependentIssues({...row,p1Unit:'KPA'}, config)
    .some(x => x.code === 'B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED'));
});

test('factor HOLD shows all independent blockers but produces no approved wall', () => {
  const report = buildPreviewB313WallUpdateReport({rows:[row],config,xmlText:'',
    host:{dataset:{},__xmlCiiPreviewResult:{branchRows:[row],nodeBoreWallRows:[]}}});
  assert.equal(report.summary.inputRows,1);
  assert.equal(report.summary.updatedRows,0);
  assert.equal(report.rows[0].status,'NOT_UPDATED');
  assert.ok(report.rows[0].details.independentInputIssues.some(x => x.code === 'B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED'));
  assert.equal(Object.keys(config.b313WallUpdate.proposalsByBranch).length,0);
  const html=renderPreviewB313WallAuditHtml(report);
  assert.match(html,/Also verify independently/);
  assert.match(html,/P1 unit unknown or conflicting/);
});

test('one workspace distinguishes 30 physical rows from 3 blocker groups', () => {
  const auto=readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-auto-basis.js',import.meta.url),'utf8');
  const audit=readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-audit-controller.js',import.meta.url),'utf8');
  assert.match(auto,/physical Preview row\(s\)/);
  assert.match(auto,/occurrence-scoped basis entry\/entries/);
  assert.match(auto,/data-mc-b313-unified-audit-slot/);
  assert.match(audit,/sharedSlot.innerHTML = renderPreviewB313WallAuditHtml\(report\)/);
  const rows=[];
  for(let i=0;i<30;i++){
    const isD=i<26,isLt=i>=26&&i<28;
    rows.push({branchName:'BR'+i,status:'NOT_UPDATED',
      code:isD||isLt?'B313_PREVIEW_FACTOR_BASIS_UNAVAILABLE':'B313_PREVIEW_CLASS_DN_MATERIAL_CONFLICT',
      message:isD||isLt?'Missing factor':'Class conflict',
      details:(isD||isLt)?{factorBasis:{ok:false,details:{materialId:isD?'DSS-A790-S31803':'LTCS-A333-6',designTemperatureC:isD?120:82}}}:{}});
  }
  const groups=derivePreviewB313AuditRootCauseGroups({rows});
  assert.deepEqual(groups.map(x=>x.count),[26,2,2]);
  assert.match(renderPreviewB313WallAuditHtml({rows,summary:{inputRows:30,updatedRows:0,skippedRows:30}}),/3 distinct blocking factor\/identity groups/);
});
