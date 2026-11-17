import assert from 'node:assert/strict';

import {
  derivePreviewB313AuditSummary,
  derivePreviewB313AuditRootCauseGroups,
  renderPreviewB313WallAuditHtml,
  selectPreviewB313AuditRows,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-audit-controller.js';

const snapshot = [
  { branchName: '/A/B1', lineKey: 'L-100', material: 'A106 Gr B', t1: '120' },
  { branchName: '/A/B2', lineKey: 'L-100', material: 'A106 Gr B', t1: '120' },
];

assert.deepEqual(
  selectPreviewB313AuditRows(snapshot, []),
  snapshot,
  'retained Preview rows must be used when the live legacy cache was cleared before the action click',
);

const live = [{ branchName: '/LIVE/B1', lineKey: 'L-200' }];
assert.deepEqual(
  selectPreviewB313AuditRows(snapshot, live),
  live,
  'non-empty live Preview rows must take precedence over the retained snapshot',
);

const staleSummaryReport = {
  summary: { inputRows: 0, updatedRows: 0, skippedRows: 0 },
  rows: [
    {
      branchName: '/A/B1',
      lineKey: 'L-100',
      status: 'UPDATED',
      materialId: 'A106_GR_B',
      factorBasisMode: 'ACTIVE_MASTER_STRICT',
      evidence: {
        previewMaterial: 'ASTM A106 Gr B',
        materialId: 'A106_GR_B',
        designTemperature: '120',
        factorBasisMode: 'ACTIVE_MASTER_STRICT',
        factorDesignAuthority: true,
        allowableStress: 118,
        stressUnit: 'MPa',
        qualityFactorE: 1,
        weldStrengthReductionW: 1,
        coefficientY: 0.4,
      },
      result: {
        outsideDiameterMm: 114.3,
        designPressure: 4.8,
        pressureUnit: 'MPA',
        corrosionAllowanceMm: 3,
        selectedNominalWallMm: 8.56,
        equivalentSchedules: ['Sch 80'],
        selectionMarginMm: 0.6123,
        calculation: { requiredNominalThicknessMm: 7.9477 },
      },
    },
    {
      branchName: '/A/B2',
      lineKey: 'L-100',
      status: 'NOT_UPDATED',
      code: 'B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED',
      message: 'Pressure unit could not be resolved.',
      details: {
        materialIdentity: { ok: true, material: { materialId: 'A106_GR_B' } },
        factorBasis: { ok: true, mode: 'ACTIVE_MASTER_STRICT' },
      },
    },
  ],
};

assert.deepEqual(
  derivePreviewB313AuditSummary(staleSummaryReport),
  {
    evaluatedRows: 2,
    updatedRows: 1,
    calculatedRows: 0,
    notUpdatedRows: 1,
    summaryMismatch: true,
    hasInput: true,
    allUpdated: false,
  },
  'row evidence must repair a stale 0/0 summary',
);

const html = renderPreviewB313WallAuditHtml(staleSummaryReport);
assert.match(html, /Evaluated 2 · Updated 1 · Not updated 1/);
assert.match(html, /ASME B31\.3-2024 §304\.1\.2 Eq\. \(3a\)/);
assert.match(html, /Preview Material → B31\.3 identity → qualified stress S \+ governed E\/W\/Y sources at T1/);
assert.match(html, /BENCHMARK_ONLY \/ SCREENING factors/);
assert.match(html, /12\.5% negative/);
assert.match(html, /A106_GR_B · T1 120 °C/);
assert.match(html, /S 118 MPa · E 1 · W 1 · Y 0\.4/);
assert.match(html, /required nominal 7\.9477 mm → selected 8\.5600 mm/);
assert.match(html, /B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED/);
assert.match(html, /Audit counters were recomputed from row evidence/);

const noRowsHtml = renderPreviewB313WallAuditHtml({
  summary: { inputRows: 0, updatedRows: 0, skippedRows: 0 },
  rows: [],
});
assert.match(noRowsHtml, /Evaluated 0 · Updated 0 · Not updated 0/);
assert.match(noRowsHtml, /No Preview branch rows were available to evaluate/);
assert.doesNotMatch(noRowsHtml, /B31\.3 wall update audit — 0 updated, 0 not updated/);

const factorIssue = (id,t1,branch) => ({
  branchName: branch, lineKey: 'GLRD-LINE',
  code: 'B313_PREVIEW_FACTOR_BASIS_UNAVAILABLE',
  status: 'NOT_UPDATED',message:'Strict factors missing',
  details:{
    materialIdentity:{ok:true,material:{materialId:id},materialSource:'process-linelist-material'},
    factorBasis:{ok:false,code:'B313_PREVIEW_FACTOR_BASIS_UNAVAILABLE',details:{
      materialId:id,designTemperatureC:t1,manufacturingRoute:'',
      factorAvailability:{factors:{
        S:{strictAvailable:false,status:'QUALIFICATION_STATUS_REJECTED',candidateStatuses:['SCREENING']},
        E:{strictAvailable:false,status:'MANUFACTURING_ROUTE_REQUIRED',availableManufacturingRoutes:['SEAMLESS']},
        W:{strictAvailable:false,status:'QUALIFICATION_STATUS_REJECTED',candidateStatuses:['SCREENING']},
        Y:{strictAvailable:false,status:'QUALIFICATION_STATUS_REJECTED',candidateStatuses:['SCREENING']},
      },strictAcceptedStatuses:['VERIFIED','PROJECT_APPROVED']}
    }}
  }
});
const groupedReport={summary:{inputRows:4,updatedRows:0,calculatedRows:0,skippedRows:4},rows:[
  factorIssue('DSS-A790-S31803',120,'/GLRD-DSS/B1'),
  factorIssue('DSS-A790-S31803',120,'/GLRD-DSS/B2'),
  factorIssue('LTCS-A333-6',120,'/GLRD-LTCS/B1'),
  factorIssue('LTCS-A333-6',82,'/GLRD-LTCS/B2'),
]};
const grouped=derivePreviewB313AuditRootCauseGroups(groupedReport);
assert.equal(grouped.length,3,'One shared cause per distinct material/temperature/route');
assert.equal(grouped[0].count,2);
assert.equal(grouped.reduce((n,g)=>n+g.count,0),4,'Group counts preserve all physical occurrences');
assert.match(renderPreviewB313WallAuditHtml(groupedReport),/3 distinct blocking factor\/identity groups/);
assert.match(renderPreviewB313WallAuditHtml(groupedReport),/2 row\(s\)/);
assert.match(renderPreviewB313WallAuditHtml(groupedReport),/manufacturing route required/);
assert.equal(derivePreviewB313AuditRootCauseGroups({rows:[]}).length,0);

console.log('XML/CII Preview B31.3 wall audit controller checks passed.');
