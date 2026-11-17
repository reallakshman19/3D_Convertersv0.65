// Original interoperability layer for optional, owner-supplied reference files.
// This does not import upstream code/data or grant engineering approval.
export const EXTERNAL_REVISIONS = Object.freeze({
  epcc: {
    repo: 'iman-taheri59/epcc-platform',
    commit: 'afa8b5989733c293bd91752de095376b64b60d98',
    path: 'standards-packs',
  },
  matseng: {
    repo: 'jvnshirr-collab/matseng',
    commit: '2d649445356779d7c4c024edf6421844d51b638a',
    path: 'core',
  },
});

export const PINNED_EPCC_BLOBS = Object.freeze({
  'pipe-sizes.ref.json': 'a72e8157f4cf8fb0fd8c688e7d6f45a5072533e5',
  'pipe-schedules.ref.json': '26071eb458bd512be9a46637c816e63ae52c37d9',
  'b313-materials.ref.json': '3d2d1201e87b54a62b2a3d50f6dccef4b85b4de6',
  'iso.pack.json': '31ed0856193817111e007cea05775799984134b4',
  'ips-iran.pack.json': 'b5df90cb95ce7a0954853b50303918f78269df28',
  'awp.pack.json': 'a7fa7bffb797699e2e29be093bb4ea5f764186ac',
});

function fail(code, message) { return { ok: false, code, message, authority: 'REVIEW_ONLY' }; }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function validPositive(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0; }
function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
function npsKey(n) { return String(n ?? '').trim().replace(/^NPS\s*/i, '').replace(/\s+/g, ' '); }

// Validate only the fields needed for a read-only interop report. This is NOT
// a substitute for the upstream JSON Schemas or engineering qualification.
export function inspectEpccDocument(document) {
  if (!isObject(document)) return fail('INVALID_JSON_OBJECT', 'Expected a JSON object.');
  if (typeof document.packId === 'string') {
    if (!/^[a-z0-9]+(?:\.[a-z0-9-]+)*$/.test(document.packId)
        || !/^\d+\.\d+\.\d+$/.test(String(document.version ?? ''))
        || !isObject(document.name) || !Array.isArray(document.standardsReferences)) {
      return fail('INVALID_STANDARDS_PACK', 'Missing or invalid EPCC pack identity, version, name, or standards references.');
    }
    return {
      ok: true, kind: 'governance-pack', identity: document.packId,
      version: document.version, entries: document.standardsReferences.length,
      summary: 'Governance/workflow metadata only; no effect on converter configuration.',
      authority: 'REVIEW_ONLY',
    };
  }
  if (document.refId === 'pipe-sizes') {
    if (!Array.isArray(document.sizes) || !document.sizes.length) {
      return fail('INVALID_PIPE_SIZES', 'Expected nonempty sizes list.');
    }
    const seen = new Set();
    for (const row of document.sizes) {
      const key = npsKey(row?.nps);
      if (!key || seen.has(key) || !validPositive(row?.odMm)
          || !Number.isFinite(row?.npsDecimal) || row.npsDecimal <= 0) {
        return fail('INVALID_PIPE_SIZE_ROW', 'Duplicate NPS or missing/invalid OD and NPS values.');
      }
      seen.add(key);
    }
    return {
      ok: true, kind: 'pipe-sizes', identity: document.refId,
      version: String(document.version ?? ''), entries: seen.size,
      summary: 'Exact NPS-to-OD lookup; no interpolation.',
      authority: 'REVIEW_ONLY',
    };
  }
  if (document.refId === 'pipe-schedules') {
    if (!isObject(document.walls) || !Object.keys(document.walls).length) {
      return fail('INVALID_PIPE_SCHEDULES', 'Expected nonempty NPS-to-schedule wall map.');
    }
    let entries = 0;
    for (const [nps, schedules] of Object.entries(document.walls)) {
      if (!npsKey(nps) || !isObject(schedules) || !Object.keys(schedules).length) {
        return fail('INVALID_WALL_SET', 'Empty NPS or schedule dictionary.');
      }
      for (const [schedule, wall] of Object.entries(schedules)) {
        if (!String(schedule).trim() || !validPositive(wall)) {
          return fail('INVALID_WALL_VALUE', 'Wall thickness must be a positive number in millimetres.');
        }
        entries++;
      }
    }
    return {
      ok: true, kind: 'pipe-schedules', identity: document.refId,
      version: String(document.version ?? ''), entries,
      summary: 'Sparse exact schedule lookup; missing pairs remain missing.',
      authority: 'REVIEW_ONLY',
    };
  }
  if (typeof document.code === 'string' && document.code.includes('ASME B31.3')
      && typeof document.provenance === 'string') {
    return {
      ok: true, kind: 'b313-source-metadata', identity: document.code,
      version: 'source-defined', entries: 0,
      summary: 'Licensed engineering-table metadata only. S/E/W/Y are NOT extracted or published.',
      authority: 'REVIEW_ONLY',
    };
  }
  if (typeof document.refId === 'string' && document.refId.length < 100
      && typeof document.version === 'string') {
    return {
      ok: true, kind: 'other-reference-metadata', identity: document.refId,
      version: document.version, entries: 0,
      summary: 'Reference recognised by identity only; no calculations or master writes.',
      authority: 'REVIEW_ONLY',
    };
  }
  return fail('UNSUPPORTED_EPCC_DOCUMENT', 'Unknown document format; no generic auto-import permitted.');
}

export function lookupEpccPipe({ sizes, schedules, nps, schedule }) {
  if (inspectEpccDocument(sizes).kind !== 'pipe-sizes'
      || inspectEpccDocument(schedules).kind !== 'pipe-schedules') {
    return fail('PIPE_REFERENCE_FILES_REQUIRED', 'Import valid pipe-sizes and pipe-schedules files first.');
  }
  const key = npsKey(nps);
  const sch = String(schedule ?? '').trim().toUpperCase().replace(/^SCH(?:EDULE)?\s*/i, '');
  if (!key || !sch) return fail('PIPE_LOOKUP_KEYS_REQUIRED', 'Enter NPS and schedule.');
  const row = sizes.sizes.find(v => npsKey(v.nps) === key);
  if (!row) return fail('NPS_NOT_IN_REFERENCE', 'No exact NPS match.');
  const wallsForNps = has(schedules.walls, key) ? schedules.walls[key] : null;
  if (!wallsForNps || !has(wallsForNps, sch)) {
    return fail('NPS_SCHEDULE_PAIR_NOT_IN_REFERENCE', 'This NPS/schedule combination is absent; no alias or zero-wall fallback.');
  }
  const wallMm = wallsForNps[sch];
  if (!validPositive(wallMm) || row.odMm <= 2 * wallMm) {
    return fail('INVALID_PIPE_GEOMETRY', 'Wall must be positive and below half the outside diameter.');
  }
  return {
    ok: true, code: 'PIPE_REFERENCE_REVIEW_ONLY',
    nps: key, dn: row.dn, schedule: sch, outsideDiameterMm: row.odMm,
    nominalWallMm: wallMm, nominalInsideDiameterMm: row.odMm - 2 * wallMm,
    authority: 'REVIEW_ONLY',
    warning: 'Dimensions are imported candidate references; reconcile editions and project class before any engineering use.',
  };
}

function numeric(input, key, allowZero = false) {
  const raw = input?.[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new RangeError(key + ' is required');
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(key + ' must be ' + (allowZero ? 'nonnegative' : 'positive'));
  }
  return value;
}

// Independent diagnostic re-expression, NOT copied MatSEng source code.
// MatSEng core/piping.py at the pinned commit uses a fixed Y=0.4 and does
// not include W. The governed v0.65 formula is more expressive.
export function compareMatsengWallScreening(input) {
  try {
    const pressureMPa = numeric(input, 'pressureMPa');
    const outsideDiameterMm = numeric(input, 'outsideDiameterMm');
    const allowableStressMPa = numeric(input, 'allowableStressMPa');
    const E = numeric(input, 'E');
    const W = numeric(input, 'W');
    const Y = numeric(input, 'Y', true);
    const corrosionAllowanceMm = numeric(input, 'corrosionAllowanceMm', true);
    const millTolerancePercent = numeric(input, 'millTolerancePercent', true);
    if (E > 1 || W > 1 || Y > 1 || millTolerancePercent >= 100) {
      return fail('INVALID_SCREENING_FACTOR_RANGE', 'E/W must be <= 1, Y must be 0..1, tolerance must be < 100%.');
    }
    const netLegacy = pressureMPa * outsideDiameterMm /
      (2 * (allowableStressMPa * E + pressureMPa * 0.4));
    const netControlled = pressureMPa * outsideDiameterMm /
      (2 * (allowableStressMPa * E * W + pressureMPa * Y));
    const multiplier = 1 / (1 - millTolerancePercent / 100);
    const legacy = (netLegacy + corrosionAllowanceMm) * multiplier;
    const controlled = (netControlled + corrosionAllowanceMm) * multiplier;
    return {
      ok: true, code: 'SCREENING_PARITY_ONLY', authority: 'SCREENING_NOT_APPROVED',
      matsengSimplifiedNominalMm: legacy,
      explicitSewyNominalMm: controlled,
      deltaMm: controlled - legacy,
      deltaPercentOfExplicit: controlled === 0 ? null : 100 * (controlled - legacy) / controlled,
      assumptions: [
        'Simple straight-pipe expression only; applicability and code exceptions not evaluated.',
        'MatSEng comparison assumes Y=0.4 and excludes W, as inspected in pinned core/piping.py.',
        'Inputs are manually supplied; no verification, material matching or code-table approval.',
        'For design use the existing governed v0.65 B31.3 engine with qualified S/E/W/Y.',
      ],
    };
  } catch (error) {
    return fail('INVALID_SCREENING_INPUT', String(error?.message || error));
  }
}
