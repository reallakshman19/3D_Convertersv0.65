import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  EXTERNAL_REVISIONS, PINNED_EPCC_BLOBS, inspectEpccDocument,
  lookupEpccPipe, compareMatsengWallScreening,
} from '../converters/external-engineering/reference-review.js';

const size = {
  refId: 'pipe-sizes', version: '1.0.0',
  sizes: [{ nps: '6', npsDecimal: 6, dn: 150, odMm: 168.3 }],
};
const schedule = {
  refId: 'pipe-schedules', version: '1.0.0',
  walls: { '6': { '40': 7.11, '80S': 10.97 } },
};

test('upstream source revisions and known blob SHA identifiers are immutable', () => {
  assert.equal(EXTERNAL_REVISIONS.epcc.commit, 'afa8b5989733c293bd91752de095376b64b60d98');
  assert.equal(EXTERNAL_REVISIONS.matseng.commit, '2d649445356779d7c4c024edf6421844d51b638a');
  assert.match(PINNED_EPCC_BLOBS['pipe-sizes.ref.json'], /^[a-f0-9]{40}$/);
});

test('valid EPCC governance pack remains metadata only', () => {
  const r = inspectEpccDocument({
    packId: 'iso', version: '1.0.0', name: { en: 'ISO', fa: 'test' },
    standardsReferences: [{ code: 'ISO 9001' }],
    terminology: { x: 1 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'governance-pack');
  assert.equal(r.authority, 'REVIEW_ONLY');
  assert.equal(r.entries, 1);
});

test('standards files cannot inject arbitrary records or unsupported schemas', () => {
  assert.equal(inspectEpccDocument([]).code, 'INVALID_JSON_OBJECT');
  assert.equal(inspectEpccDocument({ factors: { S: [{ value: 999 }] } }).code,
    'UNSUPPORTED_EPCC_DOCUMENT');
  assert.equal(inspectEpccDocument({ refId: 'pipe-sizes', sizes: [
    { nps: '6', npsDecimal: 6, odMm: 168.3 },
    { nps: '6', npsDecimal: 6, odMm: 168.3 },
  ] }).code, 'INVALID_PIPE_SIZE_ROW');
  assert.equal(inspectEpccDocument({ refId: 'pipe-schedules', walls: {
    '6': { '40': 0 },
  } }).code, 'INVALID_WALL_VALUE');
});

test('geometry lookup is exact and does not auto-accept a schedule alias', () => {
  const r = lookupEpccPipe({ sizes: size, schedules: schedule, nps: '6', schedule: '40' });
  assert.equal(r.ok, true);
  assert.equal(r.nominalWallMm, 7.11);
  assert.equal(r.outsideDiameterMm, 168.3);
  assert(Math.abs(r.nominalInsideDiameterMm - 154.08) < 1e-10);
  assert.equal(r.authority, 'REVIEW_ONLY');

  const absent = lookupEpccPipe({ sizes: size, schedules: schedule, nps: '6', schedule: 'STD' });
  assert.equal(absent.ok, false);
  assert.equal(absent.code, 'NPS_SCHEDULE_PAIR_NOT_IN_REFERENCE');
});

test('missing files or missing NPS fail closed', () => {
  assert.equal(lookupEpccPipe({ sizes: size, nps: '6', schedule: '40' }).code,
    'PIPE_REFERENCE_FILES_REQUIRED');
  assert.equal(lookupEpccPipe({ sizes: size, schedules: schedule, nps: '7', schedule: '40' }).code,
    'NPS_NOT_IN_REFERENCE');
});

test('ASME source metadata cannot qualify imported S/E/W/Y rows', () => {
  const r = inspectEpccDocument({
    code: 'ASME B31.3-2024', provenance: 'licensed source',
    materials: [{ factors: { S: 999 } }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'b313-source-metadata');
  assert.equal(r.authority, 'REVIEW_ONLY');
  assert.equal(r.entries, 0);
});

const benchmark = {
  pressureMPa: 5, outsideDiameterMm: 168.3, allowableStressMPa: 138,
  E: 1, W: 1, Y: 0.4, corrosionAllowanceMm: 3, millTolerancePercent: 12.5,
};

test('legacy parity equals explicit expression when Y=.4 and W=1', () => {
  const r = compareMatsengWallScreening(benchmark);
  assert.equal(r.ok, true);
  assert(Math.abs(r.deltaMm) < 1e-10);
  assert.equal(r.authority, 'SCREENING_NOT_APPROVED');
});

test('a nonunity W is captured as a discrepancy, never silently defaulted', () => {
  const r = compareMatsengWallScreening({ ...benchmark, W: 0.85 });
  assert.equal(r.ok, true);
  assert(r.deltaMm > 0);
  assert(r.explicitSewyNominalMm > r.matsengSimplifiedNominalMm);
});

test('invalid numeric ranges and missing factors cannot produce calculations', () => {
  for (const patch of [{ W: '' }, { W: 1.1 }, { E: 0 }, { Y: -0.2 }, { millTolerancePercent: 100 }]) {
    const r = compareMatsengWallScreening({ ...benchmark, ...patch });
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.equal(r.authority, 'REVIEW_ONLY');
  }
});

test('review UI is registered but has no master mutation bridge', () => {
  const tab = fs.readFileSync(new URL('../tabs/external-engineering-reference-tab.js', import.meta.url), 'utf8');
  const shell = fs.readFileSync(new URL('../tabs/engineering-workspace-tab.js', import.meta.url), 'utf8');
  assert.match(shell, /external-reference-review/);
  assert.match(tab, /Import local EPCC JSON files/);
  assert.match(tab, /identity === 'PINNED_MATCH'/);
  assert.doesNotMatch(tab, /localStorage\.setItem|factorOverrides|publishMaster|pullWall|writePreview/);
});
