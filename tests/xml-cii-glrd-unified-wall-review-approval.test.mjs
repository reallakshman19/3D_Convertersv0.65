import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDtxrWallReview, validateDtxrWallSelection } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dtxr-wall-review.js';

const sourceIndex = rows => ({ index: rows, available: rows.length });
const forRow = row => row.candidate;
const keyForRow = row => row.key;
const plan = (rows, extras = {}) => buildDtxrWallReview({
  rows, candidateIndex: sourceIndex, candidateForRow: forRow, keyForRow, ...extras,
});
const item = (key, value = 7.112, schedule = '40S') => ({
  key, branchName: 'GLRD-' + key, candidate: { value, schedule, dtxr:'L-TUBE' },
});

test('DTXR source review is pure and never changes saved wall overrides', () => {
  const overrides = { K: 12.7 };
  const snapshot = JSON.stringify(overrides);
  const review = plan([item('K',7.112)], { existingWalls: overrides });
  assert.equal(JSON.stringify(overrides),snapshot);
  assert.equal(review.items[0].status,'REPLACE_EXISTING_REQUIRES_APPROVAL');
  assert.equal(review.items[0].existingValue,'12.7');
  assert.equal(review.eligibleKeys,1);
});

test('physical rows sharing a wall key are reviewed once, not silently overwritten twice', () => {
  const review=plan([item('K',7.112),item('K',7.112)]);
  assert.equal(review.inputRows,2);
  assert.equal(review.matchedRows,2);
  assert.equal(review.items.length,1);
  assert.deepEqual(review.items[0].rowIndices,[0,1]);
});

test('conflicting DTXR schedule or wall proposals for the same key HOLD', () => {
  const review=plan([item('K',7.112,'40S'),item('K',12.7,'80S')]);
  assert.equal(review.items[0].status,'SOURCE_CONFLICT_HOLD');
  assert.equal(review.items[0].eligible,false);
  assert.equal(validateDtxrWallSelection({review,selectedKeys:['K']}).approved.length,0);
});

test('approved B31.3 acceptance blocks DTXR replacement even with a checkbox selection', () => {
  const review=plan([item('K')],{ acceptedWallByBranch: {'0':{nominalWallMm:7.112}} });
  assert.equal(review.items[0].status,'B313_ACCEPTED_WALL_HOLD');
  assert.equal(validateDtxrWallSelection({review,selectedKeys:['K']}).approved.length,0);
});

test('source occurrence identity, not displayed row index, guards approved wall', () => {
  const row={...item('K'),branchOccurrenceIndex:42};
  const review=plan([row],{acceptedWallByBranch:{'42':{nominalWallMm:9.5}}});
  assert.deepEqual(review.items[0].acceptanceKeys,['42']);
  assert.equal(review.items[0].status,'B313_ACCEPTED_WALL_HOLD');
});

test('a new B31.3 approval after planning invalidates stale DTXR acceptance', () => {
  const review=plan([item('K')]);
  const result=validateDtxrWallSelection({review,selectedKeys:['K'],
    acceptedWallByBranch:{'0':{nominalWallMm:7.112}}});
  assert.equal(result.approved.length,0);
  assert.equal(result.skipped[0].reason,'B313_ACCEPTED_WALL_HOLD');
});

test('a saved override changed after review prevents stale application', () => {
  const review=plan([item('K')],{existingWalls:{K:12.7}});
  const result=validateDtxrWallSelection({review,selectedKeys:['K'],currentWalls:{K:9.5}});
  assert.equal(result.approved.length,0);
  assert.equal(result.skipped[0].reason,'STALE_OVERRIDE_HOLD');
});

test('explicit selection only approves eligible keys; no implicit bulk apply', () => {
  const review=plan([item('A'),item('B')]);
  const out=validateDtxrWallSelection({review,selectedKeys:['A']});
  assert.equal(out.approved.length,1);
  assert.equal(out.approved[0].key,'A');
});

test('unchanged wall is not rewritten and non-positive source values are excluded', () => {
  const review=plan([item('A',7.112),item('B',0)],{existingWalls:{A:7.112}});
  assert.equal(review.items.length,1);
  assert.equal(review.items[0].status,'ALREADY_MATCHES');
  assert.equal(review.items[0].eligible,false);
});

test('source and GitHub Pages runtime mirrors match exactly for unified wall handlers', () => {
  const modules=['xml-cii-adapted-preview-renderer.js','xml-cii-adapted-preview-b313-wall-update.js',
    'xml-cii-adapted-preview-b313-auto-basis.js','xml-cii-adapted-preview-b313-wall-audit-controller.js',
    'xml-cii-adapted-preview-dtxr-wall-review.js'];
  const base='tabs/xml-cii-2019-standalone/ui-adapted/';
  for(const module of modules){
    const source=readFileSync(new URL('../'+base+module,import.meta.url),'utf8');
    const pages=readFileSync(new URL('../docs/'+base+module,import.meta.url),'utf8');
    assert.equal(source,pages,module+' runtime/docs mirror mismatch');
  }
  const renderer=readFileSync(new URL('../'+base+'xml-cii-adapted-preview-renderer.js',import.meta.url),'utf8');
  const auto=readFileSync(new URL('../'+base+'xml-cii-adapted-preview-b313-auto-basis.js',import.meta.url),'utf8');
  const b313=readFileSync(new URL('../'+base+'xml-cii-adapted-preview-b313-wall-update.js',import.meta.url),'utf8');
  assert.match(renderer,/data-mc-dtxr-apply-selected/);
  assert.match(renderer,/validateDtxrWallSelection/);
  assert.match(renderer,/data-mc-wall-review-actions/);
  assert.match(auto,/data-mc-dtxr-unified-review-slot/);
  assert.match(b313,/data-mc-wall-review-actions/);
  assert.doesNotMatch(renderer,/overrides\\.wallThickness\\[key\\] = candidate\\.value/);
});
