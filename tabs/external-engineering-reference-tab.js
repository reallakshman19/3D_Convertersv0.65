import {
  EXTERNAL_REVISIONS,
  PINNED_EPCC_BLOBS,
  inspectEpccDocument,
  lookupEpccPipe,
  compareMatsengWallScreening,
} from '../converters/external-engineering/reference-review.js';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const INPUT_FIELDS = [
  ['pressureMPa', 'Design pressure (MPa)', '5'],
  ['outsideDiameterMm', 'Outside diameter (mm)', '168.3'],
  ['allowableStressMPa', 'S allowable stress (MPa)', '137.9'],
  ['E', 'E quality factor', '1'],
  ['W', 'W weld factor', '1'],
  ['Y', 'Y coefficient', '0.4'],
  ['corrosionAllowanceMm', 'Corrosion allowance (mm)', '3'],
  ['millTolerancePercent', 'Negative mill tolerance (%)', '12.5'],
];

async function gitBlobSha1(file) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') return null;
  const data = new Uint8Array(await file.arrayBuffer());
  const header = new TextEncoder().encode('blob ' + data.byteLength + '\0');
  const bytes = new Uint8Array(header.length + data.length);
  bytes.set(header);
  bytes.set(data, header.length);
  const digest = await globalThis.crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function sourceLink(repo, commit, path) {
  return 'https://github.com/' + repo + '/tree/' + commit + '/' + path;
}

export function renderExternalEngineeringReferenceTab(container) {
  if (!document.querySelector('link[data-external-reference-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './tabs/engineering-masters.css?v=engineering-1';
    link.dataset.externalReferenceStyle = 'true';
    document.head.appendChild(link);
  }
  const state = { sizes: null, schedules: null, receipts: [] };
  container.innerHTML = [
    '<section class="engineering-master-root" data-external-review>',
    '<h2>External standards &amp; materials — reference review</h2>',
    '<div class="engineering-master-banner warn"><strong>READ-ONLY · NOT CODE-QUALIFIED.</strong> ',
    'Optional reference import and numerical comparisons do not alter 4 Preview, ',
    'the B31.3 S/E/W/Y master, material identity, or approved wall selection.</div>',
    '<p>Sources: <a target="_blank" rel="noopener noreferrer" href="',
    sourceLink(EXTERNAL_REVISIONS.epcc.repo, EXTERNAL_REVISIONS.epcc.commit, EXTERNAL_REVISIONS.epcc.path),
    '">EPCC standards-packs (pinned)</a> · <a target="_blank" rel="noopener noreferrer" href="',
    sourceLink(EXTERNAL_REVISIONS.matseng.repo, EXTERNAL_REVISIONS.matseng.commit, EXTERNAL_REVISIONS.matseng.path),
    '">MatSEng Python core (pinned)</a>. No upstream files are bundled or fetched by the browser.</p>',
    '<div class="engineering-master-card"><h3>1 · Review locally supplied EPCC JSON</h3>',
    '<p>Import pipe-sizes.ref.json, pipe-schedules.ref.json or an EPCC pack/reference JSON.',
    ' Known files are checked against their pinned Git blob identities when browser cryptography is available.',
    ' Only PINNED_MATCH sizing files may feed lookup. Unrecognised, modified or unverified inputs never become approved master data.</p>',
    '<input type="file" accept=".json,application/json" multiple data-external-upload aria-label="Import local EPCC JSON files">',
    '<pre data-external-file-report role="status" style="white-space:pre-wrap;max-height:260px;overflow:auto">No files imported.</pre>',
    '</div>',
    '<div class="engineering-master-card"><h3>2 · Exact pipe dimensional lookup (review only)</h3>',
    '<p>Both sizing files are required. Missing NPS/schedule combinations must remain missing; ',
    'STD/XS are never silently converted to Sch 40/80.</p>',
    '<label>NPS <input data-external-nps type="text" placeholder="6"></label> ',
    '<label>Schedule <input data-external-schedule type="text" placeholder="40 or 80S"></label> ',
    '<button type="button" data-external-lookup>Look up</button>',
    '<pre data-external-lookup-output role="status" style="white-space:pre-wrap"></pre>',
    '</div>',
    '<div class="engineering-master-card"><h3>3 · MatSEng vs explicit S/E/W/Y (screening)</h3>',
    '<p>MatSEng core/piping.py uses Y = 0.4 and no W in its simplified wall calculation. ',
    'Enter all factors explicitly to show what changes when v0.65 uses the full factor expression. ',
    'This is a diagnostic, not an alternate design engine.</p>',
    '<div style="display:flex;flex-wrap:wrap;gap:10px">',
    INPUT_FIELDS.map(([id, label, example]) =>
      '<label style="display:flex;flex-direction:column;min-width:175px">' +
      label + '<input type="number" step="any" data-external-input="' + id +
      '" placeholder="e.g. ' + example + '"></label>').join(''),
    '</div><p><button type="button" data-external-compare>Compare (screening only)</button></p>',
    '<pre data-external-compare-output role="status" style="white-space:pre-wrap"></pre>',
    '</div>',
    '<div class="engineering-master-card"><h3>4 · Export a provenance receipt</h3>',
    '<p>Exports file names, source hashes, validation status and comparison result metadata. ',
    'It deliberately contains no licensed standard tables, published factors, or approval claims.</p>',
    '<button type="button" data-external-receipt>Download review receipt</button>',
    '</div>',
    '</section>',
  ].join('');

  const reports = container.querySelector('[data-external-file-report]');
  const lookupOutput = container.querySelector('[data-external-lookup-output]');
  const compareOutput = container.querySelector('[data-external-compare-output]');
  const receipt = { schema: 'external-reference-review/v1', authority: 'REVIEW_ONLY',
    sourceRevisions: EXTERNAL_REVISIONS, files: [], comparison: null, lookup: null };
  let active = true;

  const upload = container.querySelector('[data-external-upload]');
  async function onUpload(event) {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      if (!active) break;
      let record = { fileName: file.name, byteLength: file.size, authority: 'REVIEW_ONLY' };
      try {
        if (!/\.json$/i.test(file.name) || file.size > MAX_FILE_BYTES) {
          throw new Error('Only JSON files up to 8 MiB are supported.');
        }
        const document = JSON.parse(await file.text());
        const result = inspectEpccDocument(document);
        const expected = PINNED_EPCC_BLOBS[file.name] || null;
        let actual = null;
        try { actual = await gitBlobSha1(file); }
        catch { actual = null; }
        const identity = expected
          ? (actual === null ? 'HASH_UNAVAILABLE' : actual === expected ? 'PINNED_MATCH' : 'NOT_PINNED_SNAPSHOT')
          : 'NOT_IN_PINNED_ALLOWLIST';
        record = { ...record, validation: result.code || (result.ok ? 'VALID_REVIEW_SHAPE' : 'INVALID'),
          kind: result.kind || null, identity: result.identity || null, entries: result.entries ?? 0,
          fileIdentity: identity, expectedBlobSha1: expected, actualBlobSha1: actual,
          notes: result.summary || result.message || '' };
        if (result.kind === 'pipe-sizes') state.sizes = null;
        if (result.kind === 'pipe-schedules') state.schedules = null;
        // Pinned-source identity is required even for dimensional lookup.
        // Unverified/modified files are listed for audit, never used in calculations.
        if (result.ok && identity === 'PINNED_MATCH' && result.kind === 'pipe-sizes') state.sizes = document;
        if (result.ok && identity === 'PINNED_MATCH' && result.kind === 'pipe-schedules') state.schedules = document;
      } catch (error) {
        record = { ...record, validation: 'REJECTED', notes: String(error?.message || error) };
      }
      receipt.files.push(record);
      if (active) {
        reports.textContent = receipt.files.map(f =>
          f.fileName + ' | ' + f.validation + ' | ' + (f.fileIdentity || 'NOT_CHECKED') +
          ' | ' + f.entries + ' entries | ' + (f.notes || '')).join('\n');
      }
    }
    event.target.value = '';
  }
  function onLookup() {
    const result = lookupEpccPipe({
      sizes: state.sizes, schedules: state.schedules,
      nps: container.querySelector('[data-external-nps]').value,
      schedule: container.querySelector('[data-external-schedule]').value,
    });
    receipt.lookup = result.ok ? { nps: result.nps, schedule: result.schedule, authority: result.authority } : null;
    lookupOutput.textContent = JSON.stringify(result, null, 2);
  }
  function onCompare() {
    const args = {};
    for (const [id] of INPUT_FIELDS) args[id] = container.querySelector('[data-external-input="' + id + '"]').value;
    const result = compareMatsengWallScreening(args);
    receipt.comparison = result.ok ? { deltaMm: result.deltaMm, deltaPercentOfExplicit: result.deltaPercentOfExplicit,
      authority: result.authority } : null;
    compareOutput.textContent = JSON.stringify(result, null, 2);
  }
  function onReceipt() {
    const document = { ...receipt, exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
    const link = documentElement('a');
    link.href = url; link.download = 'external-engineering-review-receipt.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function documentElement(tagName) { return document.createElement(tagName); }

  const lookupButton = container.querySelector('[data-external-lookup]');
  const compareButton = container.querySelector('[data-external-compare]');
  const receiptButton = container.querySelector('[data-external-receipt]');
  upload.addEventListener('change', onUpload);
  lookupButton.addEventListener('click', onLookup);
  compareButton.addEventListener('click', onCompare);
  receiptButton.addEventListener('click', onReceipt);
  return () => {
    active = false;
    upload.removeEventListener('change', onUpload);
    lookupButton.removeEventListener('click', onLookup);
    compareButton.removeEventListener('click', onCompare);
    receiptButton.removeEventListener('click', onReceipt);
  };
}
