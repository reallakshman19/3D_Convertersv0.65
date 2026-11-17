import {
  B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT,
  calculateAndSelectPreviewB313Wall,
  resolvePreviewB313FactorBasis,
  resolvePreviewB313MaterialIdentity,
} from '../../../converters/xml-cii2019-core/b313-preview-wall-update.js?v=20261116-b313-pull-v065';
import { b313PreviewInputSignature, b313PreviewNodeSignature } from '../../../converters/xml-cii2019-core/b313-preview-pull-authority.js';
import { listPipeWallsForSize } from '../../../converters/pipe-wall-master/index.js';
import { markAdaptedPreviewOverrideManual } from './xml-cii-adapted-preview-filldown.js';
import { _xmlCiiFindLineListRow } from './xml-cii-adapted-preview-dryrun-core.js?v=20261116-b313-pull-v065';
import { XML_CII_PREVIEW_LEGACY_CACHE_KEY } from './xml-cii-adapted-preview-cache-v7.js';

export const B313_PREVIEW_ACTION_LABEL = 'Update wall thickness as per B31.3 Sec II';
export const B313_PREVIEW_BASIS_SCHEMA = 'xml-cii-b313-preview-design-basis/v2';
export const B313_PREVIEW_REPORT_SCHEMA = 'xml-cii-b313-preview-wall-update-report/v2';

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function esc(value) { return text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function positive(value) {
  if (text(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function nonNegative(value) {
  if (text(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function normalizedToken(value) { return text(value).toUpperCase().replace(/\s+/g, ' ').trim(); }

function ensureOverrides(config) {
  if (!config.overrides || typeof config.overrides !== 'object' || Array.isArray(config.overrides)) config.overrides = {};
  return config.overrides;
}

function ensureBasisConfig(config) {
  if (!config.b313WallUpdate || typeof config.b313WallUpdate !== 'object' || Array.isArray(config.b313WallUpdate)) config.b313WallUpdate = {};
  const basis = config.b313WallUpdate;
  basis.schema = B313_PREVIEW_BASIS_SCHEMA;
  if (!basis.millTolerance || typeof basis.millTolerance !== 'object') {
    basis.millTolerance = { basis: 'percent', value: B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT };
  }
  if (!basis.materialFallback || typeof basis.materialFallback !== 'object') {
    basis.materialFallback = { enabled: true, family: 'CS', mode: 'PROPOSE_FOR_REVIEW' };
  }
  basis.proposalsByBranch ||= {};
  if (!basis.bases || typeof basis.bases !== 'object' || Array.isArray(basis.bases)) basis.bases = {};
  return basis;
}

function materialText(row) {
  return text(row?.material || row?.materialName || row?.resolvedMaterial || row?.materialCode || '');
}

function temperatureText(row) {
  return text(row?.t1 ?? row?.designTemperature ?? '');
}

/**
 * ASTM A106 is a seamless-pipe specification. The *exact* source pipe
 * product can establish this route; family-default "CS" or a generic
 * class mapping cannot. All other route declarations need physical
 * project evidence in their Preview basis.
 */
export function b313SourceConfirmsA106Seamless(row, materialIdentity) {
  if (!materialIdentity?.ok || materialIdentity.material?.materialId !== 'CS-A106-B'
    || materialIdentity.b313IdentityNeedsReview === true
    || materialIdentity.b313FallbackApplied === true
    || materialIdentity.requestMode !== 'EXACT_PREVIEW_MATERIAL') return false;
  // An unscoped class fallback may name A106 without proving that the
  // physical pipe is A106. Require the exact DN class source in that case.
  if (normalizedToken(row?.materialSource) === 'PIPING-CLASS-FALLBACK'
      && row?.materialCodeCorroborationSource !== 'piping-class-master-exact-DN') return false;
  const preview = normalizedToken(materialText(row));
  const exactClass = row?.materialCodeCorroborationSource === 'piping-class-master-exact-DN'
    ? normalizedToken(row.materialCodeCorroborationCandidate) : '';
  const exactA106 = /(?:^|[^A-Z0-9])A106(?:$|[^A-Z0-9])/;
  return exactA106.test(preview) || exactA106.test(exactClass);
}

export function resolvePreviewB313MaterialFromRow(row, config = {}) {
  // B31.3 cannot inherit an unresolved choice between the exact Line List
  // class and the class parsed from the physical branch name.
  if (row?.pipingClassConflict && row?.pipingClassSelectionExplicit !== true) {
    return { ok: false, code: 'B313_PREVIEW_PIPING_CLASS_AUTHORITY_UNRESOLVED',
      message: 'Step 4 Line List and branch Piping Class disagree. Review the existing Piping Class source selection and rebuild before B31.3 calculation.',
      details: { pipingClass: row.pipingClass, branchClass: row.pipingClassRegex,
        lineListClass: row.pipingClassLineList, selectedSource: row.pipingClassSelectedSource } };
  }
  // The exact-DN project master must be checked AGAINST the governing
  // Preview material even when a configured Material Code matched first.
  // A family label (LTCS) cannot silently inherit an A790 DSS class product.
  // This check is only a contradiction guard; it NEVER certifies S/E/W/Y.
  const classProduct = text(row?.materialCodeCorroborationCandidate);
  if (row?.materialCodeCorroborationSource === 'piping-class-master-exact-DN' && classProduct) {
    const physicalClass = resolvePreviewB313MaterialIdentity({ material: classProduct,
      materialSource: 'piping-class-master-exact-DN' });
    const preview = resolvePreviewB313MaterialIdentity({
      material: materialText(row), materialSource: row?.materialSource || '' });
    const mapped = text(row?.materialCodeMatchedMaterial)
      ? resolvePreviewB313MaterialIdentity({ material: row.materialCodeMatchedMaterial,
          materialSource: row?.materialCodeSource || '' }) : null;
    const mismatchedFamily = preview.ok && physicalClass.ok
      && preview.material.family !== physicalClass.material.family;
    const mismatchedCode = mapped?.ok && physicalClass.ok
      && mapped.material.materialId !== physicalClass.material.materialId;
    const mismatchedExactGrade = preview.ok && physicalClass.ok
      && preview.requestMode === 'EXACT_PREVIEW_MATERIAL'
      && physicalClass.requestMode === 'EXACT_PREVIEW_MATERIAL'
      && preview.material.materialId !== physicalClass.material.materialId;
    if (mismatchedFamily || mismatchedCode || mismatchedExactGrade) {
      return { ok: false, code: 'B313_PREVIEW_CLASS_DN_MATERIAL_CONFLICT',
        message: 'The actual Piping Class/DN pipe product contradicts the effective Preview or Material Code designation. Resolve source authority in 4 Preview; never overwrite the Line List material automatically.',
        details: { branchName: row?.branchName, lineKey: row?.lineKey,
          pipingClass: row?.pipingClass, sizeMm: row?.sizeMm,
          previewMaterial: materialText(row), materialCodeMaterial: row?.materialCodeMatchedMaterial || '',
          exactDnClassMaterial: classProduct, exactDnSource: row?.materialCodeCorroborationSource,
          previewMaterialId: preview.ok ? preview.material.materialId : null,
          classMaterialId: physicalClass.ok ? physicalClass.material.materialId : null } };
    }
  }
  if (row?.materialCodeConflict) {
    return { ok: false, code: 'B313_PREVIEW_MATERIAL_CODE_CONFLICT',
      message: 'Step 4 Material and Material Code evidence conflict; resolve the existing Preview authority before B31.3 calculation.',
      details: { materialCodeConflict: row.materialCodeConflict } };
  }
  // When the Line List publishes only a family, accept exact, reviewed Step
  // 8 class evidence as corroboration, not as a mutation of governing material.
  const primaryCodeEvidence = text(row?.materialCodeMatchedMaterial);
  const classEvidenceAllowed = !primaryCodeEvidence
    && !!text(row?.materialCodeCorroborationCandidate)
    && row?.materialCodeCorroborationNeedsReview !== true
    && row?.pipingClassNeedsReview !== true
    && !row?.pipingClassConflict;
  const resolved = resolvePreviewB313MaterialIdentity({
    material: materialText(row),
    materialSource: row?.materialSource || '',
    corroboratingMaterial: primaryCodeEvidence
      || (classEvidenceAllowed ? row?.materialCodeCorroborationCandidate : ''),
    corroboratingSource: primaryCodeEvidence
      ? (row?.materialCodeSource || row?.materialCodeResolutionMethod || '')
      : (classEvidenceAllowed ? row?.materialCodeCorroborationSource : ''),
    corroboratingNeedsReview: primaryCodeEvidence ? row?.materialCodeNeedsReview === true : !classEvidenceAllowed,
  });
  if (resolved.ok) return resolved;
  const fallback = config?.b313WallUpdate?.materialFallback || { enabled: true, family: 'CS' };
  const raw = normalizedToken(materialText(row));
  // An explicitly identified non-CS material must NEVER become CS merely
  // because its exact grade is missing from the catalog.
  if (fallback.enabled === false || !['B313_PREVIEW_MATERIAL_REQUIRED', 'B313_PREVIEW_MATERIAL_NOT_MAPPED'].includes(resolved.code)
      || /\b(?:SS|STAINLESS|DSS|DUPLEX|SDSS|SUPERDUPLEX|LTCS|A312|A358|A789|A790|A333|A335|UNS)\b/.test(raw)
      || /^SS\d|^S3\d|^TP\d/.test(raw)) return resolved;
  const family = text(fallback.family || 'CS').toUpperCase();
  if (family !== 'CS') return resolved;
  const applied = resolvePreviewB313MaterialIdentity({ material: 'CS', materialSource: 'b313-config-fallback-cs' });
  return applied.ok ? { ...applied, b313FallbackApplied: true, b313FallbackFamily: 'CS',
    b313FallbackNeedsReview: true, fallbackOriginal: materialText(row) } : resolved;
}

function legacyPreviewB313BasisKey(row) {
  const material = normalizedToken(materialText(row));
  const temperature = normalizedToken(temperatureText(row));
  return material ? `${material}|T1=${temperature || '?'}` : '';
}

export function previewB313BasisKey(row, config = {}) {
  const temperature = normalizedToken(temperatureText(row));
  const materialIdentity = resolvePreviewB313MaterialFromRow(row, config);
  if (materialIdentity.ok) {
    const base = `MATID:${materialIdentity.material.materialId}|T1=${temperature || '?'}`;
    // Qualified code facts can be reused from the published master. However,
    // Preview manual factors and review checkboxes are physical-occurrence
    // approvals: not transferable across lines, DN, routes or branches.
    const scope = [
      row?.branchOccurrenceIndex ?? '', row?.branchName ?? '',
      row?.lineKey ?? '', row?.pipingClass ?? '',
      row?.boreMm ?? row?.sizeMm ?? row?.size ?? '',
      row?.materialCode ?? '', row?.materialCodeMatchedMaterial ?? '',
      row?.materialCodeCorroborationCandidate ?? '',
    ].map(normalizedToken);
    const occurrence = scope.some(Boolean)
      ? `|OCCURRENCE:${scope.map(encodeURIComponent).join('~')}` : '';
    const gradeReview = materialIdentity.b313IdentityNeedsReview === true && scope.some(Boolean)
      ? `|GRADE_SCOPE:${scope.map(encodeURIComponent).join('~')}` : '';
    return base + occurrence + gradeReview;
  }
  const legacy = legacyPreviewB313BasisKey(row);
  return legacy ? `RAW:${legacy}` : '';
}

function basisForRow(cfg, row, key = previewB313BasisKey(row)) {
  if (key && cfg.bases[key]) return { key, basis: cfg.bases[key], source: 'canonical-material-id-key' };
  // Do not import a legacy group-wide approval into an occurrence-scoped
  // family-default review: it may belong to another physical line.
  if (key.includes('|OCCURRENCE:') || key.includes('|GRADE_SCOPE:'))
    return { key, basis: {}, source: 'unreviewed-physical-occurrence' };
  const legacy = legacyPreviewB313BasisKey(row);
  if (legacy && cfg.bases[legacy]) return { key, basis: cfg.bases[legacy], source: 'legacy-material-text-key' };
  return { key, basis: {}, source: 'none' };
}

function uniqueBasisGroups(rows, cfg) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = previewB313BasisKey(row, { b313WallUpdate: cfg });
    if (!key || map.has(key)) continue;
    const materialIdentity = resolvePreviewB313MaterialFromRow(row, { b313WallUpdate: cfg });
    const stored = basisForRow(cfg, row, key);
    const factorBasis = materialIdentity.ok
      ? resolvePreviewB313FactorBasis({
        materialIdentity,
        designTemperatureC: temperatureText(row),
        manufacturingRoute: stored.basis?.manufacturingRoute || '',
        manualBasis: stored.basis,
      })
      : null;
    map.set(key, {
      key,
      row,
      material: materialText(row),
      materialSource: row?.materialSource || '',
      designTemperature: temperatureText(row),
      materialIdentity,
      factorBasis,
      basis: stored.basis,
      basisSource: stored.source,
    });
  }
  return [...map.values()];
}

function readLegacyBranchRows() {
  try {
    const payload = typeof localStorage !== 'undefined'
      ? JSON.parse(localStorage.getItem(XML_CII_PREVIEW_LEGACY_CACHE_KEY) || 'null')
      : null;
    return Array.isArray(payload?.data?.branchRows) ? payload.data.branchRows : [];
  } catch {
    return [];
  }
}

function normalizePreviewRows(rows) {
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
}

export function selectPreviewB313ActionRows({ host, suppliedRows = [], legacyRows = [] } = {}) {
  const liveRows = normalizePreviewRows(host?.__xmlCiiPreviewResult?.branchRows);
  if (liveRows.length) return liveRows;
  const supplied = normalizePreviewRows(suppliedRows);
  if (supplied.length) return supplied;
  return normalizePreviewRows(legacyRows);
}

function currentPreviewB313Rows(host, suppliedRows) {
  return selectPreviewB313ActionRows({
    host,
    suppliedRows,
    legacyRows: readLegacyBranchRows(),
  });
}

function localName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function childText(parent, name) {
  for (const child of [...(parent?.childNodes || [])]) if (child?.nodeType === 1 && localName(child) === name) return text(child.textContent);
  return '';
}

function parseSourceXml(xmlText) {
  if (typeof DOMParser === 'undefined') return { pressureUnit: '', byBranch: new Map() };
  try {
    const document = new DOMParser().parseFromString(text(xmlText), 'application/xml');
    if (document.getElementsByTagName('parsererror').length) return { pressureUnit: '', byBranch: new Map() };
    let pressureUnit = '';
    for (const element of [...document.getElementsByTagName('*')]) {
      if (localName(element) === 'PressureUnits') { pressureUnit = text(element.textContent); break; }
    }
    const byBranch = new Map();
    for (const branch of [...document.getElementsByTagName('*')].filter((element) => localName(element) === 'Branch')) {
      const branchName = childText(branch, 'Branchname');
      if (!branchName) continue;
      const candidates = [];
      for (const node of [...branch.childNodes].filter((child) => child?.nodeType === 1 && localName(child) === 'Node')) {
        for (const field of ['EffectiveOutsideDiameter', 'OutsideDiameter', 'OuterDiameter', 'OD']) {
          const value = positive(childText(node, field));
          if (!value) continue;
          candidates.push({
            value,
            field,
            nodeNumber: childText(node, 'NodeNumber'),
            endpoint: childText(node, 'Endpoint'),
            componentType: childText(node, 'ComponentType'),
            componentRefNo: childText(node, 'ComponentRefNo'),
          });
          break;
        }
      }
      byBranch.set(branchName, candidates);
    }
    return { pressureUnit, byBranch };
  } catch {
    return { pressureUnit: '', byBranch: new Map() };
  }
}

function normalizePressureUnit(value) {
  const unit = normalizedToken(value).replace(/[.\s_-]+/g, '');
  if (!unit || unit === 'AUTO') return '';
  if (unit === 'PASCAL' || unit === 'PASCALS' || unit === 'PA') return 'PA';
  if (unit === 'KPA' || unit === 'KPAG') return 'KPA';
  if (unit === 'MPA' || unit === 'MPAG') return 'MPA';
  if (unit === 'BARG') return 'BARG';
  if (unit === 'BAR') return 'BAR';
  if (unit === 'PSIG') return 'PSIG';
  if (unit === 'PSI') return 'PSI';
  if (unit === 'KSI') return 'KSI';
  return '';
}

function pressureUnitFromColumnName(key) {
  const value = normalizedToken(key);
  if (/KPA\s*\(?G\)?|KPA/.test(value)) return 'KPA';
  if (/MPA\s*\(?G\)?|MPA/.test(value)) return 'MPA';
  if (/BARG/.test(value)) return 'BARG';
  if (/\bBAR\b/.test(value)) return 'BAR';
  if (/PSIG/.test(value)) return 'PSIG';
  if (/\bPSI\b/.test(value)) return 'PSI';
  if (/\bPA\b|PASCAL/.test(value)) return 'PA';
  return '';
}

function sameNumeric(left, right) {
  const a = Number(String(left ?? '').replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?/)?.[0]);
  const b = Number(String(right ?? '').replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?/)?.[0]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= scale * 1e-9;
}

/**
 * A physical Step-4 P1 from a selected Line List may inherit its pressure
 * unit ONLY from the SAME exact line and a header that expressly denotes
 * design/maximum P1 pressure, and whose numerical cell equals Preview P1.
 * Hydro/test columns, unrelated numeric cells, guesses from pressure magnitude
 * and a header of unknown unit are excluded. No master data is changed here.
 */
export function resolvePreviewP1LineListHeaderUnit(row = {}, config = {}) {
  if (!/LINELIST|LINE.LIST/.test(normalizedToken(row.p1Source)) || !text(row.lineKey)
      || !text(row.p1)) return { unit: '', source: 'P1_NOT_LINE_LIST_SOURCED' };
  const selected = _xmlCiiFindLineListRow(row.lineKey, config);
  const raw = selected?.row;
  if (!raw || typeof raw !== 'object') return { unit: '', source: 'NO_SELECTED_LINE_LIST_ROW' };
  const matches = [];
  for (const [key, value] of Object.entries(raw)) {
    const header = normalizedToken(key);
    if (!( /\bP1\b/.test(header) || (/\bPRESSURE\b/.test(header) && /\b(?:DESIGN|MAX|MAXIMUM)\b/.test(header)) )
        || /(?:\bHYDRO\b|\bTEST\b)/.test(header)) continue;
    const unit = pressureUnitFromColumnName(key);
    if (unit && sameNumeric(value, row.p1)) matches.push({ unit, source: `line-list-column:${key}` });
  }
  const unique = [...new Set(matches.map(item => item.unit))];
  if (unique.length > 1) return { unit: '', source: 'LINE_LIST_P1_UNIT_CONFLICT',
    candidates: matches.map(item => item.source) };
  if (unique.length === 1) return matches[0];
  return { unit: '', source: 'LINE_LIST_P1_HEADER_NOT_EXPLICIT_OR_VALUE_MISMATCH' };
}

export function inferPreviewPressureUnit(row, config, sourceXml, basis = {}, previewOnly = false) {
  const explicit = normalizePressureUnit(basis.pressureUnit);
  const fromPreview = normalizePressureUnit(row?.p1Unit);
  const fromHeader = resolvePreviewP1LineListHeaderUnit(row, config);
  if (fromHeader.source === 'LINE_LIST_P1_UNIT_CONFLICT') return fromHeader;
  const supplied = [explicit, fromPreview, fromHeader.unit].filter(Boolean);
  if (new Set(supplied).size > 1) return {
    unit: '', source: 'P1_UNIT_AUTHORITIES_CONFLICT',
    designBasis: explicit, previewUnit: fromPreview, lineListUnit: fromHeader.unit,
  };
  if (explicit) return { unit: explicit, source: 'design-basis' };
  if (fromPreview) return { unit: fromPreview, source: row?.p1UnitSource || 'preview' };
  if (fromHeader.unit) return fromHeader;
  if (previewOnly) return { unit: '', source: 'PREVIEW_PRESSURE_UNIT_UNRESOLVED' };
  if (normalizedToken(row?.p1Source).includes('XML')) {
    const unit = normalizePressureUnit(sourceXml?.pressureUnit);
    if (unit) return { unit, source: 'source-xml-units' };
  }
  return { unit: '', source: 'unresolved' };
}

export function inferPreviewDimensionStandard(row, basis = {}, materialIdentity = null) {
  const explicit = text(basis.dimensionStandard);
  if (explicit && normalizedToken(explicit) !== 'AUTO') return { standard: explicit, source: 'design-basis' };
  const family = materialIdentity?.ok ? materialIdentity.material?.family : '';
  if (['SS', 'DSS', 'SDSS'].includes(family)) return { standard: 'ASME B36.19M', source: 'b313-material-family-inference' };
  if (['CS', 'LTCS'].includes(family)) return { standard: 'ASME B36.10M', source: 'b313-material-family-inference' };
  const material = normalizedToken(materialText(row));
  if (!material) return { standard: '', source: 'unresolved' };
  if (/A312|A358|A789|A790|STAINLESS|DUPLEX|\bDSS\b|\bSDSS\b/.test(material)) return { standard: 'ASME B36.19M', source: 'material-family-inference' };
  if (/A106|A53|A333|A335|A671|A672|API\s*5L|CARBON|\bCS\b|LTCS/.test(material)) return { standard: 'ASME B36.10M', source: 'material-family-inference' };
  return { standard: '', source: 'unresolved' };
}

function masterOutsideDiameterMm(dn, dimensionStandard) {
  const listed = listPipeWallsForSize({ dn, dimensionStandard });
  if (!listed.ok || !listed.rows.length) return null;
  const values = [...new Set(listed.rows.map((row) => positive(row.outsideDiameterMm)).filter(Boolean))];
  return values.length === 1 ? values[0] : null;
}

export function resolvePreviewOutsideDiameter(row, sourceXml, dimensionStandard) {
  const dn = positive(row?.sizeMm ?? row?.boreMm);
  if (!dn) return { ok: false, code: 'B313_PREVIEW_DN_REQUIRED' };
  const referenceOd = masterOutsideDiameterMm(dn, dimensionStandard);
  if (!referenceOd) return { ok: false, code: 'B313_PREVIEW_MASTER_OD_UNAVAILABLE', dn, dimensionStandard };
  const candidates = Array.isArray(sourceXml?.byBranch?.get(row?.branchName)) ? sourceXml.byBranch.get(row.branchName) : [];
  if (!candidates.length) return { ok: false, code: 'B313_PREVIEW_ROW_OD_UNAVAILABLE', dn, referenceOd };
  const ranked = candidates
    .map((candidate) => ({ ...candidate, deltaMm: Math.abs(candidate.value - referenceOd) }))
    .sort((left, right) => left.deltaMm - right.deltaMm || left.value - right.value);
  const winner = ranked[0];
  const toleranceMm = Math.max(1.5, referenceOd * 0.02);
  if (!winner || winner.deltaMm > toleranceMm) {
    return { ok: false, code: 'B313_PREVIEW_ROW_OD_PARITY_MISMATCH', dn, referenceOd, toleranceMm, candidates: ranked };
  }
  return {
    ok: true,
    outsideDiameterMm: winner.value,
    source: `source-xml:${winner.field}`,
    sourceNodeNumber: winner.nodeNumber,
    sourceComponentRefNo: winner.componentRefNo,
    referenceOdMm: referenceOd,
    parityDeltaMm: winner.deltaMm,
    toleranceMm,
    candidates: ranked,
  };
}

function wallOverrideKey(row) {
  return text(row?.wallThicknessKey || row?.lineKey || row?.branchName);
}

function updateVisibleWallCell(host, rowIndex, result) {
  const cell = host?.querySelector?.(`[data-mc-edit-type="wallThickness"][data-mc-edit-row="${rowIndex}"]`);
  if (!cell) return;
  const value = Number(result.selectedNominalWallMm.toPrecision(8)).toString();
  const span = cell.querySelector('.mc-preview-editable-val');
  if (span) span.textContent = value;
  const scheduleText = (result.equivalentSchedules || []).join(' / ') || result.selectedSchedule;
  cell.title = `B31.3 explicit Preview update. Required nominal ${result.calculation.requiredNominalThicknessMm.toFixed(4)} mm; selected ${result.selectedNominalWallMm.toFixed(4)} mm; Sch ${scheduleText}; margin ${result.selectionMarginMm.toFixed(4)} mm; mill tolerance ${B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT}%.`;
  cell.dataset.mcFillState = 'manual';
  let badge = cell.querySelector('[data-b313-wall-badge]');
  if (!badge) {
    cell.insertAdjacentHTML('beforeend', ' <span data-b313-wall-badge class="mc-preview-badge exact">✓ B31.3</span>');
    badge = cell.querySelector('[data-b313-wall-badge]');
  }
  if (badge) { badge.textContent = '✓ B31.3'; badge.className = 'mc-preview-badge exact'; }
}

function updateVisibleMaterialCell(host, rowIndex, materialIdentity, factorBasis) {
  const cell = host?.querySelector?.(`[data-mc-edit-type="material"][data-mc-edit-row="${rowIndex}"]`);
  if (!cell || !materialIdentity?.ok) return;
  let badge = cell.querySelector('[data-b313-material-badge]');
  if (!badge) {
    cell.insertAdjacentHTML('beforeend', ' <span data-b313-material-badge class="mc-preview-badge">B31.3 ID</span>');
    badge = cell.querySelector('[data-b313-material-badge]');
  }
  const active = factorBasis?.ok && factorBasis.mode === 'ACTIVE_MASTER_STRICT';
  const gradeReview = materialIdentity.b313IdentityNeedsReview === true;
  // Identity-only is not an approved S/E/W/Y calculation. Only the
  // separately qualified factor basis receives a success checkmark.
  badge.textContent = active ? 'B31.3 FACTORS ✓'
    : gradeReview ? 'B31.3 GRADE REVIEW' : 'B31.3 ID ONLY';
  badge.className = `mc-preview-badge ${active ? 'exact' : ''}`.trim();
  badge.title = `Preview Material → ${materialIdentity.material.materialId}. Identity source: ${materialIdentity.resolutionSource || materialIdentity.requestMode}. Factor basis: ${factorBasis?.ok ? factorBasis.mode : factorBasis?.code || 'unavailable'}. Identity lookup alone does not qualify S/E/W/Y.`;
}

function factorBasisLabel(factorBasis) {
  if (!factorBasis?.ok) return factorBasis?.code || 'UNAVAILABLE';
  return factorBasis.mode === 'ACTIVE_MASTER_STRICT' ? 'ACTIVE MASTER / STRICT' : 'MANUAL FALLBACK';
}

function reportHtml(report) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const failures = rows.filter((row) => row.status !== 'UPDATED');
  const summary = report?.summary || {};
  const statusColor = failures.length ? '#92400e' : '#166534';
  const background = failures.length ? '#fffbeb' : '#f0fdf4';
  const detailRows = rows.map((row) => {
    const result = row.result;
    const schedule = result?.equivalentSchedules?.join(' / ') || result?.selectedSchedule || '';
    const detail = row.status === 'CALCULATED' || row.status === 'UPDATED'
      ? `${esc(row.materialId)} · ${esc(row.factorBasisMode)} · OD ${result.outsideDiameterMm.toFixed(3)} mm · P ${result.designPressure} ${esc(result.pressureUnit)} · CA ${result.corrosionAllowanceMm} mm · required ${result.calculation.requiredNominalThicknessMm.toFixed(4)} mm · selected ${result.selectedNominalWallMm.toFixed(4)} mm · Sch ${esc(schedule)} · margin ${result.selectionMarginMm.toFixed(4)} mm`
      : esc(row.message || row.code || 'not updated');
    return `<tr><td style="padding:5px;border-bottom:1px solid #e2e8f0;">${esc(row.branchName)}</td><td style="padding:5px;border-bottom:1px solid #e2e8f0;font-weight:700;">${esc(row.status)}</td><td style="padding:5px;border-bottom:1px solid #e2e8f0;">${detail}</td></tr>`;
  }).join('');
  return `<details data-mc-b313-report open style="margin:8px 0;border:1px solid ${statusColor};border-radius:6px;background:${background};padding:8px;">
    <summary style="cursor:pointer;font-weight:700;color:${statusColor};">B31.3 wall calculation audit — ${summary.calculatedRows || 0} calculated, ${summary.skippedRows || 0} held; use ⤓ Pull to accept</summary>
    <div style="font-size:12px;margin:6px 0;">Preview Material → B31.3 material identity → strict active S/E/W/Y at T1. Manual S/E/W/Y is used only as an explicit fallback when the active master is incomplete. BENCHMARK_ONLY factor data is never enabled. Negative mill tolerance is fixed at 12.5%.</div>
    <div style="overflow:auto;max-height:300px;"><table style="border-collapse:collapse;width:100%;font-size:12px;"><thead><tr><th style="text-align:left;padding:5px;">Branch</th><th style="text-align:left;padding:5px;">Status</th><th style="text-align:left;padding:5px;">Material / factor basis / result</th></tr></thead><tbody>${detailRows}</tbody></table></div>
  </details>`;
}

function renderBasisEditor(host, config, rows, options) {
  const actionCard = host?.querySelector?.('[data-mc-preview-build]')?.parentElement?.parentElement;
  if (!actionCard) return;
  let editor = host.querySelector('[data-mc-b313-basis-editor]');
  if (editor) return;
  const cfg = ensureBasisConfig(config);
  const groups = uniqueBasisGroups(rows, cfg);
  if (!groups.length) return;

  const rowsHtml = groups.map((group) => {
    const basis = group.basis || {};
    const identity = group.materialIdentity;
    const factorBasis = group.factorBasis;
    const identityText = identity.ok ? identity.material.materialId : identity.code;
    const status = factorBasisLabel(factorBasis);
    const statusColor = factorBasis?.ok && factorBasis.mode === 'ACTIVE_MASTER_STRICT' ? '#86efac' : factorBasis?.ok ? '#fbbf24' : '#fca5a5';
    return `<tr data-b313-key="${esc(group.key)}" data-b313-material-id="${esc(identity.ok ? identity.material.materialId : '')}" data-b313-temperature="${esc(group.designTemperature)}">
      <td style="padding:5px;border-bottom:1px solid #334155;">${esc(group.material)}<div style="font-size:10px;color:#94a3b8;">source ${esc(group.materialSource || 'unknown')} · T1 ${esc(group.designTemperature || '?')}</div></td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><strong>${esc(identityText)}</strong><div style="font-size:10px;color:${statusColor};">${esc(status)}</div></td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><button type="button" data-b313-open-material ${identity.ok ? '' : 'disabled'} style="white-space:nowrap;">Open B31.3 Material Factors</button></td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><input data-b313-field="allowableStress" type="number" step="any" value="${esc(basis.allowableStress)}" placeholder="fallback S" style="width:90px;"></td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><select data-b313-field="stressUnit">${['MPa','psi','ksi'].map((unit) => `<option value="${unit}" ${normalizedToken(basis.stressUnit || 'MPa') === normalizedToken(unit) ? 'selected' : ''}>${unit}</option>`).join('')}</select></td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><input data-b313-field="qualityFactorE" type="number" step="any" min="0" max="1" value="${esc(basis.qualityFactorE)}" placeholder="E" style="width:65px;"></td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><input data-b313-field="weldStrengthReductionW" type="number" step="any" min="0" max="1" value="${esc(basis.weldStrengthReductionW)}" placeholder="W" style="width:65px;"></td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><input data-b313-field="coefficientY" type="number" step="any" min="0" max="1" value="${esc(basis.coefficientY)}" placeholder="Y" style="width:65px;"></td>
      <td style="padding:5px;border-bottom:1px solid #334155;">
        <input data-b313-field="manufacturingRoute" type="text" value="${esc(basis.manufacturingRoute)}" placeholder="physical route" style="width:115px;">
        <input data-b313-field="manufacturingRouteSourceReference" type="text" value="${esc(basis.manufacturingRouteSourceReference)}" placeholder="Pipe spec/MTR evidence" style="min-width:160px;">
        <label style="display:block;font-size:10px;"><input data-b313-field="manufacturingRouteEvidenceReviewed" type="checkbox" ${basis.manufacturingRouteEvidenceReviewed===true?'checked':''}> Route evidence reviewed</label>
      </td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><select data-b313-field="pressureUnit">${['AUTO','PA','KPA','MPA','BAR','BARG','PSI','PSIG'].map((unit) => `<option value="${unit}" ${normalizedToken(basis.pressureUnit || 'AUTO') === normalizedToken(unit) ? 'selected' : ''}>${unit}</option>`).join('')}</select></td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><select data-b313-field="dimensionStandard">${['AUTO','ASME B36.10M','ASME B36.19M'].map((standard) => `<option value="${standard}" ${normalizedToken(basis.dimensionStandard || 'AUTO') === normalizedToken(standard) ? 'selected' : ''}>${standard}</option>`).join('')}</select></td>
      <td style="padding:5px;border-bottom:1px solid #334155;"><input data-b313-field="sourceReference" type="text" value="${esc(basis.sourceReference)}" placeholder="required for manual fallback" style="min-width:190px;"></td>
    </tr>`;
  }).join('');

  const html = `<details data-mc-b313-basis-editor style="margin:8px 0;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;padding:8px;">
    <summary style="cursor:pointer;font-weight:700;">B31.3 Material Factors link (${groups.length} material-temperature group${groups.length === 1 ? '' : 's'})</summary>
    <div style="font-size:11px;color:#86efac;margin:6px 0;">Primary path: Phase 4 Preview Material column → merged B31.3 Material Factors identity → strict VERIFIED / PROJECT_APPROVED S/E/W/Y at Preview T1.</div>
    <div style="font-size:11px;color:#fbbf24;margin:6px 0;">If the active master is incomplete, S/E/W/Y below may be supplied as an explicit controlled fallback. No ASME Section II allowable-stress table is embedded here. The A106 benchmark is not used as a default.</div>
    <div style="font-size:10px;color:#94a3b8;margin:4px 0;">The Engineering tab edits candidate data only; Preview reads the published active material-factor master. Publish/review controlled factors before they become the strict automatic basis.</div>
    <div style="overflow:auto;"><table style="border-collapse:collapse;width:100%;font-size:11px;min-width:1420px;"><thead><tr><th>Preview Material / T1</th><th>B31.3 identity / factor status</th><th>Engineering</th><th>Fallback S</th><th>S unit</th><th>E</th><th>W</th><th>Y</th><th>Route</th><th>P unit</th><th>Dimension std</th><th>Fallback source</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
  </details>`;
  (host.querySelector('[data-mc-wall-review]') || actionCard).insertAdjacentHTML('afterend', html);
  editor = host.querySelector('[data-mc-b313-basis-editor]');

  editor?.querySelectorAll?.('[data-b313-open-material]').forEach((button) => button.addEventListener('click', () => {
    const rowEl = button.closest('[data-b313-key]');
    const materialId = text(rowEl?.dataset?.b313MaterialId);
    const temperatureC = Number(rowEl?.dataset?.b313Temperature);
    if (!materialId || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('app:switch-tab', {
      detail: {
        tabId: 'b313-material-factors',
        context: { materialId, temperatureC: Number.isFinite(temperatureC) ? temperatureC : undefined },
      },
    }));
  }));

  editor?.querySelectorAll?.('[data-b313-field]').forEach((input) => input.addEventListener('change', async () => {
    const rowEl = input.closest('[data-b313-key]');
    const key = text(rowEl?.dataset?.b313Key);
    if (!key) return;
    const group = groups.find((item) => item.key === key);
    const record = {
      ...(cfg.bases[key] || {}),
      material: group?.material || '',
      materialId: group?.materialIdentity?.ok ? group.materialIdentity.material.materialId : '',
      designTemperature: group?.designTemperature || '',
    };
    rowEl.querySelectorAll('[data-b313-field]').forEach((field) => {
      record[field.dataset.b313Field] = field.type === 'checkbox' ? field.checked : field.value;
    });
    cfg.bases[key] = record;
    await options?.onSaveConfigPreservePreview?.(config);
  }));
}

function failureRow(row, code, message, details = {}) {
  return { branchName: row?.branchName || '', lineKey: row?.lineKey || '', status: 'NOT_UPDATED', code, message, details };
}


/**
 * Audit independent source prerequisites even when a preceding material or
 * S/E/W/Y HOLD stops the numeric wall calculation. Never changes eligibility.
 */
export function collectPreviewB313IndependentIssues(row = {}, config = {}) {
  const issues = [];
  const cfg = config?.b313WallUpdate || { bases: {} };
  const key = previewB313BasisKey(row, config);
  const basis = basisForRow(cfg, row, key).basis || {};
  const rawP1 = text(row?.p1);
  const p1Numeric = rawP1.replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?/)?.[0];
  if (!p1Numeric || !(Number(p1Numeric) > 0)) {
    issues.push({ code: 'B313_PREVIEW_PRESSURE_REQUIRED',
      message: 'P1 positive design pressure missing: confirm in effective 4 Preview' });
  }
  const unit = inferPreviewPressureUnit(row, config, { pressureUnit: '', byBranch: new Map() }, basis, true);
  if (!unit?.unit) {
    issues.push({ code: 'B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED',
      message: 'P1 unit unknown or conflicting: confirm source; never infer from numeric P1 or hydro test' });
  }
  const t1 = temperatureText(row);
  if (!t1 || !Number.isFinite(Number(t1)) || Number(t1) <= -273.15 ||
      ['DEFAULT', 'NONE'].includes(normalizedToken(row?.t1Source))) {
    issues.push({ code: 'B313_PREVIEW_T1_SOURCE_UNVERIFIED',
      message: 'T1 missing or default-only: verify design temperature in 4 Preview and rebuild' });
  }
  const identity = resolvePreviewB313MaterialFromRow(row, config);
  if (identity?.ok && !b313SourceConfirmsA106Seamless(row, identity) &&
      !(text(basis.manufacturingRoute) && text(basis.manufacturingRouteSourceReference) &&
        basis.manufacturingRouteEvidenceReviewed === true)) {
    issues.push({ code: 'B313_PREVIEW_MANUFACTURING_ROUTE_EVIDENCE_REQUIRED',
      message: 'Pipe manufacturing route or independently reviewed MTR/pipe-spec source not established' });
  }
  return issues;
}


/** Select the physical exact-DN class wall, never an unauthorized free schedule. */
export function qualifyPreviewB313ClassWall(row = {}, calc = {}) {
  if (!calc.ok || !calc.calculation?.ok) return { ok:false,code:'B313_PREVIEW_CALCULATION_REQUIRED' };
  const cls=text(row.pipingClass);
  if (!cls) return { ok:true,authority:'PIPE_WALL_MASTER_NO_CLASS',selectedNominalWallMm:calc.selectedNominalWallMm,selectedSchedule:calc.selectedSchedule,marginMm:calc.selectionMarginMm };
  const dn=positive(row.sizeMm ?? row.boreMm);
  const classDn=positive(row.pipingClassPipeDnMm);
  const wall=positive(row.pipingClassPipeWallMm);
  const schedule=text(row.pipingClassPipeSchedule);
  const product=text(row.pipingClassPipeMaterial);
  const sourceRow=text(row.pipingClassPipeSourceRow);
  if (!dn || !classDn || Math.abs(dn-classDn)>1e-6 || !wall || !schedule || !product || !sourceRow) {
    return {ok:false,code:'B313_PREVIEW_CLASS_EXACT_DN_WALL_EVIDENCE_REQUIRED',
      message:'Exact-DN Piping Class product, schedule, wall or source row missing. Do not substitute an unapproved schedule.',
      details:{cls,dn,classDn,wall,schedule,product,sourceRow}};
  }
  const listed=listPipeWallsForSize({ dimensionStandard:calc.dimensionStandard, dn });
  const normalizedSchedule=(value)=>text(value).toUpperCase().replace(/^SCH(?:EDULE)?\s*/,'').replace(/\s+/g,'');
  const matching=listed.ok ? listed.rows.filter(item=>
    normalizedSchedule(item.schedule)===normalizedSchedule(schedule)) : [];
  if (!matching.length) return {ok:false,code:'B313_PREVIEW_CLASS_SCHEDULE_NOT_IN_MASTER',
    message:'Exact-DN class schedule is not present for the selected dimension standard. Confirm class schedule/standard; do not substitute a different schedule.',
    details:{cls,dn,schedule,dimensionStandard:calc.dimensionStandard}};
  if (!matching.some(item=>Math.abs(Number(item.nominalWallMm)-wall)<=0.08)) {
    return {ok:false,code:'B313_PREVIEW_CLASS_WALL_DIMENSION_CONFLICT',
      message:'Exact-DN class nominal wall conflicts with the pipe-wall master for the same schedule and dimension standard.',
      details:{cls,dn,schedule,classWallMm:wall,referenceWallsMm:matching.map(item=>item.nominalWallMm)}};
  }
  if (wall>=Number(calc.outsideDiameterMm)/2) return {
    ok:false,code:'B313_PREVIEW_CLASS_WALL_GEOMETRY_INVALID',
    message:'Class wall is geometrically inconsistent with actual pipe OD.'};
  const required=positive(calc.calculation.requiredNominalThicknessMm);
  if (!required) return {ok:false,code:'B313_PREVIEW_REQUIRED_NOMINAL_MISSING'};
  if (wall+1e-7<required) return {ok:false,code:'B313_PREVIEW_CLASS_WALL_INSUFFICIENT',
    message:'Class specified wall fails B31.3 required nominal wall. Engineering must revise/approve class; no silent schedule upgrade.',
    details:{cls,dn,product,schedule,sourceRow,classNominalWallMm:wall,requiredNominalWallMm:required,deficitMm:required-wall,masterCandidateSchedule:calc.selectedSchedule}};
  return {ok:true,authority:'PIPING_CLASS_EXACT_DN_PRODUCT',
    selectedNominalWallMm:wall,selectedSchedule:schedule,marginMm:wall-required,
    cls,dn,product,sourceRow,requiredNominalWallMm:required,
    masterCandidateSchedule:calc.selectedSchedule,masterCandidateWallMm:calc.selectedNominalWallMm};
}

export function buildPreviewB313WallUpdateReport({ rows, config, xmlText, host } = {}) {
  const branchRows = Array.isArray(rows) ? rows : [];
  if (host?.dataset?.mcB313PreviewDirty === 'true') {
    return { schema: B313_PREVIEW_REPORT_SCHEMA, action: B313_PREVIEW_ACTION_LABEL,
      summary: { inputRows: branchRows.length, calculatedRows: 0, updatedRows: 0, skippedRows: branchRows.length },
      rows: branchRows.map((row) => failureRow(row, 'B313_PREVIEW_REBUILD_REQUIRED',
        'Step 4 inputs were edited. Rebuild Preview before B31.3 calculation.')) };
  }
  // Calculation reads only the effective Step 4 Preview snapshot.
  // Source XML and master matching are upstream responsibilities of Build Preview.
  const previewNodeRows = Array.isArray(host?.__xmlCiiPreviewResult?.nodeBoreWallRows)
    ? host.__xmlCiiPreviewResult.nodeBoreWallRows : [];
  const sourceXml = { pressureUnit: '', byBranch: new Map() };
  const basisConfig = ensureBasisConfig(config || {});
  const results = [];
  let updated = 0;

  branchRows.forEach((row, rowIndex) => {
    // A previous proposal must never remain pullable after this row fails revalidation.
    delete basisConfig.proposalsByBranch[String(rowIndex)];
    const materialIdentity = resolvePreviewB313MaterialFromRow(row, config);
    if (!materialIdentity.ok) {
      results.push(failureRow(row, materialIdentity.code, materialIdentity.message || 'Preview Material could not be linked to B31.3 Material Factors.', { materialIdentity }));
      return;
    }

    // A numeric configuration default is not a reviewed design temperature.
    // Corrections are made in the existing 4 Preview T1/P1 cells, followed by
    // Rebuild; never borrow T2/T3, a neighboring branch, or the CS fallback.
    const t1Raw = temperatureText(row);
    const t1 = t1Raw === '' ? NaN : Number(t1Raw);
    const t1Source = normalizedToken(row?.t1Source);
    if (!Number.isFinite(t1) || t1 <= -273.15 || t1Source === 'DEFAULT' || t1Source === 'NONE') {
      results.push(failureRow(row,
        !Number.isFinite(t1) || t1 <= -273.15 ? 'B313_PREVIEW_T1_REQUIRED' : 'B313_PREVIEW_T1_SOURCE_UNVERIFIED',
        'T1 must be a real design temperature from the effective 4 Preview. Edit/confirm T1 in that table and Rebuild Preview; do not use default or neighboring temperatures.',
        { t1: t1Raw, t1Source: row?.t1Source || 'unresolved', nextAction: 'EDIT_STEP4_T1_AND_REBUILD' }));
      return;
    }
    if (normalizedToken(row?.p1Source) === 'DEFAULT') {
      results.push(failureRow(row,'B313_PREVIEW_P1_SOURCE_UNVERIFIED',
        'P1 is only a configuration default. Confirm design pressure and units in 4 Preview, then Rebuild.',
        { p1: row?.p1, p1Source: row?.p1Source, nextAction: 'EDIT_STEP4_P1_AND_REBUILD' }));
      return;
    }

    const key = previewB313BasisKey(row, { b313WallUpdate: basisConfig });
    const stored = basisForRow(basisConfig, row, key);
    const basis = stored.basis || {};
    const assertedRoute = text(basis.manufacturingRoute);
    const sourceConfirmsSeamless = b313SourceConfirmsA106Seamless(row, materialIdentity);
    if (sourceConfirmsSeamless && assertedRoute
        && normalizedToken(assertedRoute) !== 'SEAMLESS') {
      results.push(failureRow(row, 'B313_PREVIEW_MANUFACTURING_ROUTE_PRODUCT_CONFLICT',
        'The effective pipe is ASTM A106 seamless but the saved manufacturing route contradicts the product specification. Resolve the source identity/route conflict before B31.3.',
        {assertedRoute,productRoute:'SEAMLESS',materialIdentity}));
      return;
    }
    const routeAuthority = text(basis.manufacturingRouteSourceReference);
    const routeReviewed = basis.manufacturingRouteEvidenceReviewed === true;
    if (assertedRoute && !(routeAuthority && routeReviewed)
        && !(sourceConfirmsSeamless && normalizedToken(assertedRoute)==='SEAMLESS')) {
      results.push(failureRow(row, 'B313_PREVIEW_MANUFACTURING_ROUTE_EVIDENCE_REQUIRED',
        'The manufacturing route was entered without a controlled pipe-spec/MTR source and explicit review. Confirm route evidence in the existing B31.3 basis; class mapping or factor-table availability does not prove manufacture.',
        {route: assertedRoute, routeEvidenceSource: routeAuthority,
          routeReviewed, materialIdentity, nextAction: 'REVIEW_MANUFACTURING_ROUTE_SOURCE'}));
      return;
    }
    const factorBasis = resolvePreviewB313FactorBasis({
      materialIdentity,
      designTemperatureC: temperatureText(row),
      manufacturingRoute: assertedRoute || (sourceConfirmsSeamless ? 'SEAMLESS' : ''),
      manualBasis: basis,
    });
    updateVisibleMaterialCell(host, rowIndex, materialIdentity, factorBasis);
    if (!factorBasis.ok) {
      results.push(failureRow(row, factorBasis.code, factorBasis.message || factorBasis.code, { basisKey: key, basisSource: stored.source, materialIdentity, factorBasis }));
      return;
    }

    const pressure = positive(String(row?.p1 ?? '').replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?/)?.[0]);
    if (!pressure) {
      results.push(failureRow(row, 'B313_PREVIEW_PRESSURE_REQUIRED', 'Positive Preview design pressure P1 is unavailable.', { materialIdentity, factorBasis }));
      return;
    }
    const corrosion = nonNegative(row?.corrosion);
    if (corrosion === null) {
      results.push(failureRow(row, 'B313_PREVIEW_CORROSION_REQUIRED', 'Preview corrosion allowance is unavailable.', { materialIdentity, factorBasis }));
      return;
    }
    const pressureBasis = inferPreviewPressureUnit(row, config, sourceXml, basis, true);
    if (!pressureBasis.unit) {
      results.push(failureRow(row, 'B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED', 'Pressure unit could not be resolved. Set P unit explicitly in the B31.3 design basis.', { materialIdentity, factorBasis }));
      return;
    }
    const dimensionBasis = inferPreviewDimensionStandard(row, basis, materialIdentity);
    if (!dimensionBasis.standard) {
      results.push(failureRow(row, 'B313_PREVIEW_DIMENSION_STANDARD_UNRESOLVED', 'Pipe dimension standard could not be resolved. Set it explicitly in the B31.3 design basis.', { materialIdentity, factorBasis }));
      return;
    }
    const scopedNodes = previewNodeRows.filter((n) => Number(n.branchOccurrenceIndex) === rowIndex
      && positive(n.outsideDiameterMm));
    const outsideDiameters = [...new Set(scopedNodes.map((n) => positive(n.outsideDiameterMm)).filter(Boolean))];
    const referenceOd = masterOutsideDiameterMm(row?.sizeMm ?? row?.boreMm, dimensionBasis.standard);
    const selectedOd = outsideDiameters.length === 1 ? outsideDiameters[0] : null;
    const toleranceMm = referenceOd ? Math.max(1.5, referenceOd * 0.02) : null;
    const odBasis = !scopedNodes.length
      ? { ok: false, code: 'B313_PREVIEW_SOURCE_NODE_OD_UNAVAILABLE' }
      : !selectedOd
        ? { ok: false, code: 'B313_PREVIEW_MIXED_OR_MISSING_PIPE_OD', outsideDiameters }
        : !referenceOd
          ? { ok: false, code: 'B313_PREVIEW_MASTER_OD_UNAVAILABLE' }
          : Math.abs(selectedOd - referenceOd) > toleranceMm
            ? { ok: false, code: 'B313_PREVIEW_ROW_OD_PARITY_MISMATCH', selectedOd, referenceOd, toleranceMm }
            : { ok: true, outsideDiameterMm: selectedOd, source: 'step4-preview-node-ledger',
                referenceOdMm: referenceOd, parityDeltaMm: Math.abs(selectedOd - referenceOd), toleranceMm };
    if (!odBasis.ok) {
      results.push(failureRow(row, odBasis.code, 'A reliable row outside diameter could not be established from source XML against the DN master reference.', { ...odBasis, materialIdentity, factorBasis }));
      return;
    }

    const result = calculateAndSelectPreviewB313Wall({
      dn: row?.sizeMm ?? row?.boreMm,
      outsideDiameterMm: odBasis.outsideDiameterMm,
      designPressure: pressure,
      pressureUnit: pressureBasis.unit,
      corrosionAllowanceMm: corrosion,
      allowableStress: factorBasis.allowableStress,
      stressUnit: factorBasis.stressUnit,
      qualityFactorE: factorBasis.qualityFactorE,
      weldStrengthReductionW: factorBasis.weldStrengthReductionW,
      coefficientY: factorBasis.coefficientY,
      dimensionStandard: dimensionBasis.standard,
      negativeMillTolerance: basis.negativeMillTolerance || basisConfig.millTolerance,
      mechanicalAllowanceMm: basis.mechanicalAllowanceMm ?? 0,
      erosionAllowanceMm: basis.erosionAllowanceMm ?? 0,
      otherAllowanceMm: basis.otherAllowanceMm ?? 0,
      edition: '2024',
    });
    if (!result.ok) {
      results.push(failureRow(row, result.code, result.message || result.code, { result, odBasis, pressureBasis, dimensionBasis, basisKey: key, materialIdentity, factorBasis }));
      return;
    }
    const classSelection = qualifyPreviewB313ClassWall(row, result);
    if (!classSelection.ok) {
      results.push(failureRow(row, classSelection.code, classSelection.message || classSelection.code,
        { result, classSelection, odBasis, pressureBasis, dimensionBasis, basisKey: key, materialIdentity, factorBasis }));
      return;
    }
    const governed = { ...result, selectedNominalWallMm: classSelection.selectedNominalWallMm,
      selectedSchedule: classSelection.selectedSchedule, selectionMarginMm: classSelection.marginMm,
      classSelection };

    const proposalKey = String(rowIndex);
    const evidence = {
      schema: 'xml-cii-b313-wall-evidence/v3',
      basisKey: key, basisStorageSource: stored.source,
      previewMaterial: materialText(row), previewMaterialSource: row?.materialSource || '',
      materialIdentity, materialId: materialIdentity.material.materialId,
      materialFallbackApplied: materialIdentity.b313FallbackApplied === true,
      designTemperature: temperatureText(row),
      factorBasisMode: factorBasis.mode,
      factorSources: factorBasis.factorSources,
      allowableStress: factorBasis.allowableStress,
      stressUnit: factorBasis.stressUnit,
      qualityFactorE: factorBasis.qualityFactorE,
      weldStrengthReductionW: factorBasis.weldStrengthReductionW,
      coefficientY: factorBasis.coefficientY,
      factorDesignAuthority: factorBasis.designAuthority === true,
      fallbackSourceReference: factorBasis.mode === 'MANUAL_EXPLICIT_FALLBACK' ? factorBasis.sourceReference : '',
      pressureSource: row?.p1Source || '',
      pressureUnit: pressureBasis.unit,
      pressureUnitSource: pressureBasis.source,
      dimensionStandardSource: dimensionBasis.source,
      outsideDiameterSource: odBasis.source,
      outsideDiameterReferenceMm: odBasis.referenceOdMm,
      outsideDiameterParityDeltaMm: odBasis.parityDeltaMm,
      negativeMillTolerance: result.calculation.manufacturingTolerance,
      calculation: result.calculation, selection: result.selection, classSelection,
    };
    const manualReviewed = factorBasis.mode === 'ACTIVE_MASTER_STRICT'
      || (basis.designApproved === true && text(basis.sourceReference)
          && !/^USER_ACCEPTED_PREVIEW_FALLBACK|^B313_ACTIVE_MASTER_CANDIDATE_SEED/.test(text(basis.sourceReference)));
    const csReviewed = materialIdentity.b313FallbackApplied !== true || basis.csFallbackReviewed === true;
    const identityNeedsReview = materialIdentity.b313IdentityNeedsReview === true;
    const identityReviewed = !identityNeedsReview || basis.identityReviewed === true
      || (materialIdentity.b313FallbackApplied === true && basis.csFallbackReviewed === true);
    basisConfig.proposalsByBranch[proposalKey] = {
      schema: 'xml-cii-b313-proposal/v1',
      inputSignature: b313PreviewInputSignature(row, config),
      nodeScope: scopedNodes.map(b313PreviewNodeSignature),
      nominalWallMm: governed.selectedNominalWallMm,
      selectedSchedule: governed.selectedSchedule,
      factorBasisMode: factorBasis.mode,
      materialFallbackApplied: materialIdentity.b313FallbackApplied === true,
      materialFallbackReviewed: csReviewed,
      materialIdentityNeedsReview: identityNeedsReview,
      materialIdentityReviewed: identityReviewed,
      manualFactorsReviewed: manualReviewed,
      result, evidence,
    };
    updateVisibleMaterialCell(host, rowIndex, materialIdentity, factorBasis);
    results.push({
      branchName: row.branchName || '',
      lineKey: row.lineKey || '',
      status: 'CALCULATED', proposalKey,
      materialId: materialIdentity.material.materialId,
      factorBasisMode: factorBasis.mode, result: governed, evidence,
    });
    updated += 1;
  });

  return {
    schema: B313_PREVIEW_REPORT_SCHEMA,
    action: B313_PREVIEW_ACTION_LABEL,
    standard: 'ASME B31.3-2024',
    paragraph: '304.1.2',
    equation: '3a',
    negativeMillTolerancePct: B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT,
    materialFactorPolicy: 'PREVIEW_MATERIAL_TO_ACTIVE_B313_STRICT_THEN_MANUAL_FALLBACK',
    authority: 'EXPLICIT_PREVIEW_ACTION_NOT_AUTOMATIC_WALL_AUTHORITY',
    summary: { inputRows: branchRows.length, calculatedRows: updated, updatedRows: 0, skippedRows: branchRows.length - updated },
    rows: results.map((result, rowIndex) => result.status === 'CALCULATED' || result.status === 'UPDATED'
      ? result : {
        ...result,
        details: {
          ...(result.details || {}),
          independentInputIssues: collectPreviewB313IndependentIssues(branchRows[rowIndex], config),
        },
      }),
  };
}

function installAction(host, config, xmlText, options, suppliedRows) {
  const rows = currentPreviewB313Rows(host, suppliedRows);
  const buildButton = host?.querySelector?.('[data-mc-preview-build]');
  const actionBar = host?.querySelector?.('[data-mc-wall-review-actions]') || buildButton?.parentElement;
  if (!actionBar || !rows.length) return;
  renderBasisEditor(host, config, rows, options);
  if (actionBar.querySelector('[data-mc-b313-wall-update]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'model-converters-download-btn';
  button.dataset.mcB313WallUpdate = 'true';
  button.textContent = 'Calculate B31.3 pressure-design wall (review only)';
  button.title = 'Use each Preview row Material + T1 to resolve strict active B31.3 Material Factors, then calculate B31.3-2024 straight-pipe required nominal wall from row OD, P1 and corrosion and select the next adequate project-master pipe wall. Manual S/E/W/Y is fallback only. 12.5% negative mill tolerance is fixed.';
  button.style.cssText = 'padding:8px 14px;min-width:300px;';
  actionBar.appendChild(button);
  button.addEventListener('click', async () => {
    button.disabled = true;
    const currentRows = currentPreviewB313Rows(host, suppliedRows);
    try {
      const report = buildPreviewB313WallUpdateReport({ rows: currentRows, config, xmlText, host });
      await options?.onSaveConfig?.(config);
      await options?.onB313WallUpdateReport?.(report);
      host.querySelector('[data-mc-b313-report]')?.remove?.();
      const editor = host.querySelector('[data-mc-b313-basis-editor]');
      if (editor) editor.insertAdjacentHTML('afterend', reportHtml(report));
      else actionBar.parentElement?.insertAdjacentHTML?.('afterend', reportHtml(report));
    } catch (error) {
      const report = {
        schema: B313_PREVIEW_REPORT_SCHEMA,
        action: B313_PREVIEW_ACTION_LABEL,
        authority: 'EXPLICIT_PREVIEW_ACTION_NOT_AUTOMATIC_WALL_AUTHORITY',
        summary: { inputRows: currentRows.length, updatedRows: 0, skippedRows: currentRows.length },
        rows: [{ branchName: '', status: 'NOT_UPDATED', code: 'B313_PREVIEW_ACTION_EXCEPTION', message: text(error?.message || error) }],
      };
      await options?.onB313WallUpdateReport?.(report);
      host.querySelector('[data-mc-b313-report]')?.remove?.();
      actionBar.parentElement?.insertAdjacentHTML?.('afterend', reportHtml(report));
    } finally {
      button.disabled = false;
    }
  });
}

export function installPreviewB313WallUpdateController({ host, config, xmlText, rows = [], options = {} } = {}) {
  if (!host || !config) return;
  host.__xmlCiiB313WallObserver?.disconnect?.();
  let scheduled = false;
  const refresh = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      installAction(host, config, xmlText, options, rows);
    });
  };
  refresh();
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(refresh);
    observer.observe(host, { childList: true, subtree: true });
    host.__xmlCiiB313WallObserver = observer;
  }
}
