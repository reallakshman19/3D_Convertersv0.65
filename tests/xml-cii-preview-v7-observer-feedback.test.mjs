import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {previewV7HasRelevantMutation,installInternalRebuildCapture} from
  '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js';

const target=(owned=false)=>({
  nodeType:1,
  matches(){return owned;},
  closest(){return owned?this:null;},
});
const mutation=(addedNodes,removedNodes=[],t=target())=>({type:'childList',
  target:t,addedNodes,removedNodes});

test('browser fixture imports a real observer seam from the production V7 module',()=>{
  assert.equal(typeof installInternalRebuildCapture,'function');
});

test('RED: V7 preview cache-status replacement cannot trigger its own recapture',()=>{
  assert.equal(previewV7HasRelevantMutation([
    mutation([target(true)],[target(true)]),
  ]),false);
  assert.equal(previewV7HasRelevantMutation([
    mutation([target(true)]),mutation([],[target(true)]),
  ]),false);
});
test('RED: DTXR action/status insert and descendants are not engineering table changes',()=>{
  assert.equal(previewV7HasRelevantMutation([
    mutation([target(true)],[],target(true)),
  ]),false);
  assert.equal(previewV7HasRelevantMutation([
    mutation([target(true)]),
  ]),false);
});
test('real editable table insert/removal and mixed mutations still trigger capture',()=>{
  assert.equal(previewV7HasRelevantMutation([mutation([target(false)])]),true);
  assert.equal(previewV7HasRelevantMutation([mutation([],[target(false)])]),true);
  assert.equal(previewV7HasRelevantMutation([
    mutation([target(true)]),mutation([target(false)]),
  ]),true);
});
test('numeric B31.3 wall cells are presentation-only and never cause cache recapture',async()=>{
  const file=await readFile(new URL(
    '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js',
    import.meta.url),'utf8');
  assert.match(file,/\[data-mc-b313-calculated-row\]/);
  assert.match(file,/\[data-mc-b36-schedule-standard-row\]/,
    'Schedule / Standard presentation cells must not start a background Preview rebuild');
  assert.match(file,/\[data-b313-auto-calculated-wall\]/,
    'B31.3 review-table read-only wall cells must not start background Preview recapture');
  // The actual DOM closest() returns our calculated cell for its
  // value/detail descendants; their text mutations must not invalidate
  // Preview or kick off another expensive background cache recapture.
  const calculatedCell=target(true);
  const numericText={nodeType:3};
  assert.equal(previewV7HasRelevantMutation([
    mutation([numericText],[numericText],calculatedCell),
  ]),false);
});
test('source and docs V7 runtime mirror remain byte identical',async()=>{
  const name='xml-cii-adapted-preview-renderer-v7.js';
  const source=await readFile(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/'+name,import.meta.url),'utf8');
  const deployed=await readFile(new URL('../docs/tabs/xml-cii-2019-standalone/ui-adapted/'+name,import.meta.url),'utf8');
  assert.equal(source,deployed);
});
