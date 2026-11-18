import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Smart Map Unmapped Lines exposes literal Select All without inventing Map To values', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-smart-map-select-all.js');
  assert.match(source, /Smart Map — Unmapped Lines/u);
  assert.match(source, /textContent = 'Select All'/u);
  assert.match(source, /data-smart-map-use/u);
  assert.match(source, /data-smart-map-value/u);
  assert.match(source, /withoutTarget/u);
  assert.match(source, /does not invent Map To values/u);
  assert.match(source, /rowIsVisible/u);
});

test('consolidated Mode A Preview restores DTXR and governed B31.3 actions source-locally', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-dtxr.js');
  assert.match(source, /Update Wall thickness based on DTXR/u);
  assert.match(source, /Fetch Rating as per DTXR/u);
  assert.match(source, /createModeASourceProcessingRef/u);
  assert.match(source, /modeAExecutionRows/u);
  assert.match(source, /__dtxrWallKeys/u);
  assert.match(source, /applyPreviewDtxrRatingOverrides/u);
  assert.match(source, /B313_PREVIEW_ACTION_LABEL/u);
  assert.match(source, /buildPreviewB313WallUpdateReport/u);
  assert.match(source, /applyModeAConsolidatedB313Wall/u);
  assert.match(source, /current\.sourceText \|\| entry\.state\.sourceText \|\| ''/u);
  assert.match(source, /held\/skipped/u);
});

test('individual Mode A Preview remains manual and retains native review actions', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-individual-preview-tools.js');
  const renderer = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer.js');
  const rendererV7 = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js');
  const b313 = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js');

  assert.match(source, /Manual Build\/Rebuild Preview/u);
  assert.match(source, /data-mode-a-source-phase/u);
  assert.doesNotMatch(source, /build\.click\(\)/u);
  assert.doesNotMatch(source, /MutationObserver/u);
  assert.match(renderer, /Review DTXR wall candidates/u);
  assert.match(rendererV7, /Fetch Rating as per DTXR/u);
  assert.match(b313, /Update wall thickness as per B31\.3 Sec II/u);
});

test('Preview hook repairs process authority but only prompts manual rebuild', () => {
  const hook = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-easy-ui-hook.js');
  assert.match(hook, /repairModeAExactMappedProcessAuthority/u);
  assert.match(hook, /installModeASmartMapSelectAll/u);
  assert.match(hook, /installModeAConsolidatedDtxrTools/u);
  assert.match(hook, /installModeAIndividualPreviewToolVisibility/u);
  assert.match(hook, /if \(repair\.changed\) suggestConsolidatedRebuild\(panel\)/u);
  assert.doesNotMatch(hook, /build\.click\(\)/u);
});
