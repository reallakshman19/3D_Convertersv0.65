import {
  resolvePreviewB313FactorBasis,
} from '../../../converters/xml-cii2019-core/b313-preview-wall-update.js?v=20261116-b313-pull-v065';
import {
  suggestPreviewB313FallbackBasis,
} from '../../../converters/xml-cii2019-core/b313-preview-fallback-seed.js?v=20260930-issue781-fallback-seed-1';
import { lookupB313ScreeningFactors } from '../../../converters/b313-material-factors/screening-reference.js';
import {
  previewB313BasisKey,
  buildPreviewB313CalculatedWallDisplay,
  resolvePreviewB313MaterialFromRow,
  b313SourceConfirmsA106Seamless,
} from './xml-cii-adapted-preview-b313-wall-update.js?v=20261118-glrd-numeric-2';

import {
  buildPreviewB313AutomaticWallColumnReport,
  renderPreviewB313CalculatedWallCells,
} from './xml-cii-adapted-preview-b313-wall-audit-controller.js?v=20261118-glrd-numeric-2';

export const B313_PREVIEW_AUTO_BASIS_SCHEMA = 'xml-cii-b313-preview-auto-basis/v2';

const FACTORS = ['S', 'E', 'W', 'Y'];

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function esc(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function finite(value) {
  if (value === null || value === undefined || text(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function temperatureText(row) {
  return text(row?.t1 ?? row?.designTemperature ?? '');
}

function storedBasisForRow(config, row, materialId, t1) {
  const bases = config?.b313WallUpdate?.bases;
  if (!bases || typeof bases !== 'object' || Array.isArray(bases)) return {};
  const key = previewB313BasisKey(row, config);
  if (key && bases[key] && typeof bases[key] === 'object') return bases[key];
  // A family-default identity review is scoped to the Preview occurrence.
  // Never resurrect an old shared material/T1 approval from another line.
  if (key.includes('|OCCURRENCE:') || key.includes('|GRADE_SCOPE:')) return {};
  return Object.values(bases).find((basis) => (
    basis
    && typeof basis === 'object'
    && text(basis.materialId) === text(materialId)
    && text(basis.designTemperature) === text(t1)
  )) || {};
}

function factorAvailabilityFrom(factorBasis) {
  return factorBasis?.factorAvailability
    || factorBasis?.details?.factorAvailability
    || null;
}

function routeFromAvailability(availability) {
  if (!availability?.factors) return '';
  for (const factor of ['E', 'W', 'S', 'Y']) {
    const route = text(availability.factors[factor]?.requestedManufacturingRoute);
    if (route) return route;
  }
  return '';
}

function factorStatus(availability) {
  if (!availability?.factors) return { code: 'DATA_MISSING', label: 'DATA MISSING' };
  const rows = FACTORS.map((factor) => availability.factors[factor]).filter(Boolean);
  if (rows.length === FACTORS.length && rows.every((item) => item.strictAvailable === true)) {
    return { code: 'AUTO_READY', label: 'AUTO READY ✓' };
  }
  const hasCandidate = rows.some((item) => Array.isArray(item.candidateStatuses) && item.candidateStatuses.length > 0);
  const hasRejected = rows.some((item) => item.status === 'QUALIFICATION_STATUS_REJECTED');
  if (hasCandidate || hasRejected) return { code: 'REVIEW_REQUIRED', label: 'REVIEW REQUIRED' };
  return { code: 'DATA_MISSING', label: 'DATA MISSING' };
}

function unavailableFactorSummary(availability) {
  if (!availability?.factors) return 'S/E/W/Y unavailable';
  return FACTORS.map((factor) => {
    const item = availability.factors[factor];
    if (!item) return `${factor} unavailable`;
    if (item.strictAvailable) return `${factor} STRICT`;
    const statuses = Array.isArray(item.candidateStatuses)
      ? item.candidateStatuses.filter(Boolean).join('/')
      : '';
    return `${factor} ${statuses || item.status || 'unavailable'}`;
  }).join(' · ');
}

function strictFactorSummary(factorBasis) {
  return `S ${Number(factorBasis.allowableStress).toPrecision(6)} ${text(factorBasis.stressUnit)} · E ${factorBasis.qualityFactorE} · W ${factorBasis.weldStrengthReductionW} · Y ${factorBasis.coefficientY}`;
}

function fallbackFactorSummary(fallback, accepted = false) {
  if (!fallback?.ok) return '';
  const prefix = accepted ? 'CONTROLLED FALLBACK' : `CANDIDATE SEED @ ${fallback.seedTemperatureC} °C`;
  return `${prefix}: S ${Number(fallback.allowableStress).toPrecision(6)} ${text(fallback.stressUnit)} · E ${fallback.qualityFactorE} · W ${fallback.weldStrengthReductionW} · Y ${fallback.coefficientY}`;
}

function storedValue(stored, key, fallback) {
  return text(stored?.[key]) !== '' ? stored[key] : fallback;
}

function fallbackFromStoredOrSeed(storedBasis, seed) {
  if (!seed?.ok && !Object.keys(storedBasis || {}).length) return null;
  const fallback = seed?.ok ? { ...seed } : {
    ok: true,
    code: 'B313_PREVIEW_STORED_FALLBACK',
    seedTemperatureC: finite(storedBasis?.fallbackSeedTemperatureC),
    factorSources: storedBasis?.fallbackSeedEvidence || {},
    sourceReference: text(storedBasis?.sourceReference),
  };
  fallback.allowableStress = storedValue(storedBasis, 'allowableStress', fallback.allowableStress);
  fallback.stressUnit = storedValue(storedBasis, 'stressUnit', fallback.stressUnit || 'MPa');
  fallback.qualityFactorE = storedValue(storedBasis, 'qualityFactorE', fallback.qualityFactorE);
  fallback.weldStrengthReductionW = storedValue(storedBasis, 'weldStrengthReductionW', fallback.weldStrengthReductionW);
  fallback.coefficientY = storedValue(storedBasis, 'coefficientY', fallback.coefficientY);
  fallback.sourceReference = text(storedBasis?.sourceReference || fallback.sourceReference);
  fallback.factorSources = storedBasis?.fallbackSeedEvidence || fallback.factorSources || {};
  fallback.seedTemperatureC = finite(storedBasis?.fallbackSeedTemperatureC) ?? fallback.seedTemperatureC;
  fallback.accepted = text(storedBasis?.sourceReference).startsWith('USER_ACCEPTED_PREVIEW_FALLBACK');
  return fallback;
}

/** Source trace shown inside the EXISTING automatic-basis panel. A source row
 * corroborates product and schedule; it does not qualify B31.3 factors.
 */
export function previewB313SourceTrace(row = {}) {
  const pieces = [];
  const cls = text(row.pipingClass);
  const dn = text(row.pipingClassPipeDnMm ?? row.sizeMm);
  const product = text(row.pipingClassPipeMaterial);
  const schedule = text(row.pipingClassPipeSchedule);
  const wall = text(row.pipingClassPipeWallMm);
  const corrosion = text(row.pipingClassPipeCorrosionMm);
  const sourceRow = text(row.pipingClassPipeSourceRow);
  if (cls && product) {
    pieces.push(`Class ${cls} / DN${dn||'?'} → ${product}` +
      (schedule ? ` · Sch ${schedule}` : '') +
      (wall ? ` · nominal ${wall} mm` : '') +
      (corrosion ? ` · class CA ${corrosion} mm` : '') +
      (sourceRow ? ` · master row ${sourceRow}` : ''));
  } else if (cls) {
    pieces.push(`Class ${cls} / DN${dn||'?'} · exact pipe-product evidence unavailable`);
  }
  const code = text(row.materialCode);
  if (code) {
    pieces.push(`Material Code ${code} · ${text(row.materialCodeSource)||'source unresolved'}` +
      (text(row.materialCodeResolutionMethod) ? ` / ${text(row.materialCodeResolutionMethod)}` : '') +
      (row.materialCodeNeedsReview===true ? ' · REVIEW' : ''));
  } else pieces.push('Material Code unresolved');
  if (row.materialCodeCorroborationNeedsReview === true) pieces.push('Class material candidate needs review');
  return pieces.join(' | ');
}

export function derivePreviewB313AutoBasisRow(row, config = {}) {
  const material = text(row?.material || row?.materialName || row?.resolvedMaterial || row?.materialCode || '');
  const materialSource = text(row?.materialSource || '');
  const t1 = temperatureText(row);
  const materialIdentity = resolvePreviewB313MaterialFromRow(row, config);
  const basisKey = previewB313BasisKey(row, config);

  if (!materialIdentity?.ok) {
    return {
      schema: B313_PREVIEW_AUTO_BASIS_SCHEMA,
      basisKey,
      material,
      materialSource,
      t1,
      materialId: '',
      identityCode: materialIdentity?.code || 'B313_PREVIEW_MATERIAL_NOT_MAPPED',
      statusCode: 'MATERIAL_UNRESOLVED',
      statusLabel: 'MATERIAL UNRESOLVED',
      factorSummary: materialIdentity?.message || materialIdentity?.code || 'Material source unresolved',
      sourceTrace: previewB313SourceTrace(row),
      previewP1: text(row?.p1),
      previewP1Unit: text(row?.p1Unit),
      previewHydroPressure: text(row?.hydroPressure),
      route: '',
      routeSource: 'unresolved',
      factorBasis: null,
      fallback: null,
      tableContext: null,
    };
  }

  const materialId = text(materialIdentity.material?.materialId);
  const storedBasis = storedBasisForRow(config, row, materialId, t1);
  const explicitRoute = text(storedBasis.manufacturingRoute);
  const routeReference = text(storedBasis.manufacturingRouteSourceReference);
  const routeEvidenceReviewed = storedBasis.manufacturingRouteEvidenceReviewed === true;
  const confirmedA106Pipe = b313SourceConfirmsA106Seamless(row, materialIdentity);
  const a106RouteConflict = confirmedA106Pipe && !!explicitRoute
    && explicitRoute.toUpperCase() !== 'SEAMLESS';
  // Route entries are candidates until a real pipe-spec/MTR source is
  // independently reviewed. Factor table options do not prove construction.
  // Explicit A106 routes contradicting its seamless specification fail closed.
  const reviewedExplicitRoute = explicitRoute && !a106RouteConflict
    && ((routeReference && routeEvidenceReviewed) || confirmedA106Pipe)
    ? explicitRoute : '';

  if (!t1 || text(row?.t1Source).toLowerCase() === 'default') {
    const defaultRoute = confirmedA106Pipe ? 'SEAMLESS' : '';
    return {
      schema: B313_PREVIEW_AUTO_BASIS_SCHEMA,
      basisKey,
      material,
      materialSource,
      t1,
      materialId,
      identityCode: materialIdentity.code,
      statusCode: !t1 ? 'B313_PREVIEW_T1_REQUIRED' : 'B313_PREVIEW_T1_SOURCE_UNVERIFIED',
      statusLabel: !t1 ? 'T1 REQUIRED' : 'T1 SOURCE REVIEW',
      factorSummary: !t1
        ? 'S/E/W/Y not evaluated until Preview T1 is resolved. Enter design T1 in existing 4 Preview, then Rebuild. No fallback temperature is assumed.'
        : 'T1 came from a configuration default, not verified design evidence. Confirm T1 in 4 Preview and rebuild.',
      sourceTrace: previewB313SourceTrace(row),
      previewP1: text(row?.p1),
      previewP1Unit: text(row?.p1Unit),
      previewHydroPressure: text(row?.hydroPressure),
      route: explicitRoute || defaultRoute,
      routeSource: explicitRoute
        ? reviewedExplicitRoute ? 'reviewed physical route evidence' : 'ROUTE SOURCE/REVIEW REQUIRED'
        : defaultRoute ? 'confirmed ASTM A106 product specification' : 'unresolved',
      factorBasis: null,
      fallback: null,
      tableContext: { materialId, temperatureC: undefined },
    };
  }

  // Independent, read-only master lookup: numerical S interpolation must
  // remain available even when strict code/route approval is absent.
  // "Seamless E=1" here is a conditional screening assumption only.
  const screeningReference = lookupB313ScreeningFactors({
    materialId, temperatureC: t1, manufacturingRoute: 'SEAMLESS',
  });
  const displayedScreening = screeningReference.ok ? screeningReference : null;

  const factorBasis = resolvePreviewB313FactorBasis({
    materialIdentity,
    designTemperatureC: t1,
    manufacturingRoute: reviewedExplicitRoute || (confirmedA106Pipe ? 'SEAMLESS' : ''),
    manualBasis: storedBasis,
  });
  const availability = factorAvailabilityFrom(factorBasis);
  const defaultRoute = confirmedA106Pipe ? 'SEAMLESS' : '';
  const route = explicitRoute || defaultRoute;
  const routeSource = explicitRoute
    ? reviewedExplicitRoute ? 'reviewed physical route evidence' : 'ROUTE SOURCE/REVIEW REQUIRED'
    : defaultRoute ? 'confirmed ASTM A106 product specification' : 'unresolved';
  const routeNeedsReview = !!explicitRoute && !reviewedExplicitRoute;

  const strictReady = factorBasis?.ok && factorBasis.mode === 'ACTIVE_MASTER_STRICT';
  const storedFallbackReady = factorBasis?.ok && factorBasis.mode === 'MANUAL_EXPLICIT_FALLBACK';
  const materialIdentityNeedsReview = materialIdentity.b313IdentityNeedsReview === true;
  const materialIdentityReviewed = storedBasis.identityReviewed === true
    || (materialIdentity.b313FallbackApplied === true && storedBasis.csFallbackReviewed === true);
  const seed = strictReady ? null : suggestPreviewB313FallbackBasis({
    materialIdentity,
    designTemperatureC: t1,
    manufacturingRoute: route,
  });
  const fallback = strictReady ? null : fallbackFromStoredOrSeed(storedBasis, seed);
  const status = materialIdentityNeedsReview && !materialIdentityReviewed
    ? { code: 'GRADE_REVIEW_REQUIRED', label: 'GRADE REVIEW REQUIRED' }
    : a106RouteConflict ? { code: 'B313_ROUTE_PRODUCT_CONFLICT', label: 'PRODUCT / ROUTE CONFLICT' }
    : routeNeedsReview ? { code: 'B313_ROUTE_EVIDENCE_REQUIRED', label: 'ROUTE EVIDENCE REQUIRED' }
    : strictReady
      ? { code: 'AUTO_READY', label: 'AUTO READY ✓' }
    : storedFallbackReady
      ? { code: 'CONTROLLED_FALLBACK_READY', label: 'CONTROLLED FALLBACK READY' }
      : fallback?.ok
        ? { code: 'FALLBACK_SEED_READY', label: 'FALLBACK SEED — REFRESH TO ACCEPT' }
        : factorStatus(availability);

  return {
    schema: B313_PREVIEW_AUTO_BASIS_SCHEMA,
    basisKey,
    material,
    materialSource,
    t1,
    materialId,
    identityCode: materialIdentity.code,
    factorBasisCode: factorBasis?.code || '',
    statusCode: status.code,
    statusLabel: status.label,
    factorSummary: a106RouteConflict
      ? 'The selected route contradicts the exact ASTM A106 seamless pipe specification. Resolve the physical product/route conflict before calculation.'
      : routeNeedsReview
        ? 'Confirm the physical pipe manufacturing route against a controlled pipe spec/MTR and explicitly review the source; code-table route options are not construction evidence.'
      : strictReady ? strictFactorSummary(factorBasis)
      : storedFallbackReady && fallback?.ok
        ? fallbackFactorSummary(fallback, true)
        : fallback?.ok
          ? fallbackFactorSummary(fallback, false)
          : unavailableFactorSummary(availability),
    route,
    routeSource,
    routeNeedsReview,
    factorBasis,
    screeningReference: displayedScreening,
    fallback,
    storedBasis,
    sourceTrace: previewB313SourceTrace(row),
    previewP1: text(row?.p1),
    previewP1Unit: text(row?.p1Unit),
    previewHydroPressure: text(row?.hydroPressure),
    materialIdentityNeedsReview,
    materialIdentityReviewed,
    materialFallbackApplied: materialIdentity.b313FallbackApplied === true,
    tableContext: {
      materialId,
      temperatureC: Number.isFinite(Number(t1)) ? Number(t1) : undefined,
    },
  };
}

export function buildPreviewB313AutoBasisRows(rows = [], config = {}) {
  const unique = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const model = derivePreviewB313AutoBasisRow(row, config);
    const key = model.basisKey || `${model.materialId || model.material}|T1=${model.t1 || '?'}|ROUTE=${model.route || '?'}`;
    if (!unique.has(key)) unique.set(key, model);
  }
  return [...unique.values()];
}

function statusColor(model) {
  if (model.statusCode === 'AUTO_READY') return '#86efac';
  if (model.statusCode === 'CONTROLLED_FALLBACK_READY') return '#93c5fd';
  if (model.statusCode === 'FALLBACK_SEED_READY' || model.statusCode === 'REVIEW_REQUIRED') return '#fbbf24';
  return '#fca5a5';
}


/**
 * Fill the existing S/E/W/Y controls from the best available numeric basis,
 * without persisting candidates or asserting an engineering qualification.
 * Strict qualified data has priority; a source-entered manual field is never
 * overwritten; remaining blanks use exact/interpolated screening master
 * numbers (not the nearest-temperature fallback seed).
 */
export function previewB313FactorPrefill(model = {}) {
  const strict = model.factorBasis?.ok && model.factorBasis.mode === 'ACTIVE_MASTER_STRICT'
    ? model.factorBasis : null;
  const stored = model.storedBasis || {};
  const screening = model.screeningReference?.ok ? model.screeningReference : null;
  const seed = model.fallback?.ok ? model.fallback : null;
  const candidates = {
    allowableStress:screening?.S?.MPa, qualityFactorE:screening?.E,
    weldStrengthReductionW:screening?.W, coefficientY:screening?.Y,
  };
  const fields=['allowableStress','qualityFactorE','weldStrengthReductionW','coefficientY'];
  const values={},origins={};
  for(const field of fields) {
    if (strict && text(strict[field])!=='') {
      values[field]=strict[field];origins[field]='QUALIFIED_MASTER';
    } else if (text(stored[field])!=='') {
      values[field]=stored[field];origins[field]='EXPLICIT_SAVED';
    } else if (screening && candidates[field]!==null && candidates[field]!==undefined) {
      values[field]=candidates[field];origins[field]='SCREENING_MASTER';
    } else if(seed && text(seed[field])!=='') {
      values[field]=seed[field];origins[field]='UNQUALIFIED_SEED';
    } else {
      values[field]='';origins[field]='MISSING';
    }
  }
  // Unit always follows the actual S value, not a stale saved unit from
  // an incomplete prior basis. In particular screening S.MPa is never
  // displayed with a previously stored "ksi" dropdown.
  const unit=origins.allowableStress==='QUALIFIED_MASTER'?'MPa'
    :origins.allowableStress==='SCREENING_MASTER'?'MPa'
    :origins.allowableStress==='EXPLICIT_SAVED'
      ?text(stored.stressUnit||'MPa')
      :text(seed?.stressUnit||'MPa');
  const allStrict=fields.every(field=>origins[field]==='QUALIFIED_MASTER');
  const allStored=fields.every(field=>origins[field]==='EXPLICIT_SAVED');
  const hasScreening=fields.some(field=>origins[field]==='SCREENING_MASTER');
  const basis=screening?.basisId||'';
  const sourceRef=text(stored.sourceReference) || (hasScreening
    ?'SCREENING_ONLY:'+basis+' | '+text(screening.sourceReference):'');
  const qualification=allStrict?'QUALIFIED_ACTIVE_MASTER'
    :(hasScreening||/^SCREENING_ONLY:/i.test(sourceRef))?'SCREENING_NOT_QUALIFIED'
    :allStored?'EXPLICIT_MANUAL_SOURCE_REVIEW'
    :seed?'UNQUALIFIED_NEAREST_SEED':'SOURCE_OR_FACTOR_MISSING';
  const evidence=screening ?{
    materialId:screening.materialId,temperatureC:screening.temperatureC,
    basisId:basis,basisStatus:screening.basisStatus,
    sourceAuthority:screening.sourceAuthority,
    sourceReference:screening.sourceReference,
    editionBasis:screening.editionBasis,
    stressLookupMethod:screening.S?.method,
    stressBrackets:screening.S?.bracket||[],
    selectedConditionalRoute:'SEAMLESS',
    qualification:'SCREENING_NOT_VERIFIED_FOR_PROJECT_B313_2024',
    eligibleForPull:false,
  }:null;
  return {values,origins,stressUnit:unit,sourceReference:sourceRef,
    qualification,evidence,eligibleForPull:allStrict};
}

function sourceInfo(model, factor) {
  const prefill=previewB313FactorPrefill(model);
  const field={S:'allowableStress',E:'qualityFactorE',W:'weldStrengthReductionW',Y:'coefficientY'}[factor];
  if(field && prefill.origins[field]==='SCREENING_MASTER'){
    const evidence=prefill.evidence||{};
    const bracket=Array.isArray(evidence.stressBrackets)
      ?evidence.stressBrackets.map(x=>`${x.temperatureC}°C=${x.Sksi} ksi`).join(' → '):'';
    return [
      factor+' '+text(prefill.values[field])+(factor==='S'?' MPa':''),
      'qualification=SCREENING_NOT_VERIFIED', 'basis='+text(evidence.basisId),
      'T1='+text(evidence.temperatureC)+'°C',
      factor==='S'?'lookup='+text(evidence.stressLookupMethod):'conditional Seamless E / master W/Y',
      factor==='S'?'bracket='+bracket:'',
      'source='+text(evidence.sourceReference),'edition='+text(evidence.editionBasis),
      'not eligible for Pull',
    ].filter(Boolean).join(' · ');
  }
  const source = model.fallback?.factorSources?.[factor] || model.factorBasis?.factorSources?.[factor] || null;
  if (!source) {
    const availability = factorAvailabilityFrom(model.factorBasis)?.factors?.[factor];
    if (!availability) return `${factor}: no candidate or qualified source record is available.`;
    return [
      `${factor}: ${availability.status || 'UNAVAILABLE'}`,
      availability.candidateStatuses?.length ? `candidate statuses: ${availability.candidateStatuses.join(', ')} (at T1)` : '',
      availability.nearbySourceStatuses?.length ? `nearby data status: ${availability.nearbySourceStatuses.join(', ')}` : '',
      availability.nearbyTemperaturesC?.length ? `neighbor temperatures: ${availability.nearbyTemperaturesC.join(', ')} °C` : '',
      availability.qualifiedSourceTemperaturesC?.length ? `qualified resolution points: ${availability.qualifiedSourceTemperaturesC.join(', ')} °C` : '',
      availability.availableTemperaturesC?.length ? `all source temperatures: ${availability.availableTemperaturesC.join(', ')} °C` : '',
      availability.availableManufacturingRoutes?.length ? `routes: ${availability.availableManufacturingRoutes.join(', ')}` : '',
      'No qualified factor has been selected at the effective Preview temperature.',
    ].filter(Boolean).join(' · ');
  }
  const parts = [
    `${factor} source`,
    finite(source.temperatureC) !== null ? `T=${source.temperatureC} °C` : '',
    text(source.status) ? `status=${source.status}` : '',
    text(source.sourceAuthority || source.authority) ? `authority=${text(source.sourceAuthority || source.authority)}` : '',
    text(source.manufacturingRoute) ? `route=${source.manufacturingRoute}` : '',
    text(source.productForm) ? `form=${source.productForm}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function infoButton(model, factor) {
  return `<span style="position:relative;display:inline-flex;align-items:center;gap:3px;"><button type="button" data-b313-factor-info-button="${factor}" aria-label="${factor} source info" title="${esc(sourceInfo(model, factor))}" style="width:18px;height:18px;padding:0;border:1px solid #64748b;border-radius:50%;background:#111827;color:#93c5fd;cursor:pointer;font-size:11px;line-height:16px;">i</button><span data-b313-factor-info="${factor}" hidden style="position:absolute;z-index:30;left:20px;top:0;min-width:260px;max-width:360px;padding:7px 8px;border:1px solid #475569;border-radius:6px;background:#020617;color:#e2e8f0;box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:10px;white-space:normal;">${esc(sourceInfo(model, factor))}</span></span>`;
}

/**
 * Explicit numeric SCREENING reference next to the strict factor status.
 * Never populates the editable controlled S/E/W/Y fallback input fields.
 * Does not depend on P1/unit, so users can review interpolation separately.
 */
export function renderPreviewB313NumericScreeningReference(model = {}) {
  const r = model.screeningReference;
  if (!r?.ok) return '';
  const s = r.S;
  const range = (Array.isArray(s?.bracket) ? s.bracket : []).map(p =>
    `${Number(p.temperatureC)}°C: ${Number(p.Sksi)} ksi`).join(' → ');
  const seamless = (r.routeOptions || []).find(x => x.route === 'SEAMLESS');
  const e = seamless?.value ?? null;
  const value = v => v===null||v===undefined ? 'unavailable' : String(Number(v));
  return `<div data-b313-auto-screening-reference
    data-b313-screening-method="${esc(s?.method)}"
    data-b313-screening-basis="${esc(r.basisId)}"
    style="margin-top:5px;padding:6px;border:1px solid #f59e0b;border-radius:4px;background:#29200b;color:#fef3c7;font-size:10px;">
    <strong>MASTER SCREENING NUMBERS · reference only, not Pull eligible</strong>
    <div data-b313-screening-values>S ${Number(s.MPa).toFixed(3)} MPa (${value(s.ksi)} ksi) · E ${value(e)} (conditional Seamless) · W ${value(r.W)} · Y ${value(r.Y)}</div>
    <div>S lookup: ${esc(s.method)} at T1 ${esc(r.temperatureC)}°C · ${esc(range)}</div>
    <div>Basis ${esc(r.basisId)} · SCREENING, not a qualified B31.3-2024 source. S/E/W/Y controls are prefilled with candidate values and per-factor qualification/evidence; approval stays separate.</div>
  </div>`;
}

function fallbackInputCell(model, factor, field, options = {}) {
  const resolved=previewB313FactorPrefill(model);
  const value = resolved.values[field];
  const origin=resolved.origins[field];
  const min = options.min ?? '';
  const max = options.max ?? '';
  const step = options.step ?? 'any';
  return `<div style="display:flex;align-items:center;gap:4px;white-space:nowrap;"><input data-b313-auto-field="${field}" data-b313-factor-origin="${esc(origin)}" title="${esc(origin==='SCREENING_MASTER'?'Screening master reference; not qualified for Pull':origin)}" type="number" step="${step}" ${min !== '' ? `min="${min}"` : ''} ${max !== '' ? `max="${max}"` : ''} value="${esc(value)}" style="width:${options.width || '68px'};background:#020617;color:#e2e8f0;border:1px solid #475569;border-radius:4px;padding:3px 4px;">${infoButton(model, factor)}<span data-b313-factor-qualification="${esc(factor)}" style="font-size:9px;color:#fbbf24;">${esc(origin==='SCREENING_MASTER'?'SCREENING':origin==='QUALIFIED_MASTER'?'QUALIFIED':origin==='EXPLICIT_SAVED'?'SAVED':origin==='UNQUALIFIED_SEED'?'SEED':'')}</span></div>`;
}

function stressUnitCell(model) {
  const current = text(previewB313FactorPrefill(model).stressUnit).toUpperCase();
  return `<select data-b313-auto-field="stressUnit" style="background:#020617;color:#e2e8f0;border:1px solid #475569;border-radius:4px;padding:3px 4px;">${['MPa','ksi','psi'].map((unit) => `<option value="${unit}" ${current === unit.toUpperCase() ? 'selected' : ''}>${unit}</option>`).join('')}</select>`;
}


/**
 * Read-only calculated wall in the same B31.3 review table. A model/basis
 * group may contain more than one *physical* Preview row; keep all occurrence
 * values separately and never present their wall as one shared group value.
 */
export function buildPreviewB313BasisWallCells(rows = [], config = {}, previewNodeRows = []) {
  const byBasis = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
    if (!row || typeof row !== 'object') return;
    const key = previewB313BasisKey(row, config);
    const result = buildPreviewB313CalculatedWallDisplay({
      row,config,previewNodeRows,rowIndex,
    });
    if (!byBasis.has(key)) byBasis.set(key, []);
    byBasis.get(key).push({
      rowIndex,lineKey:text(row.lineKey),branchName:text(row.branchName),
      sizeMm:text(row.sizeMm),result,
    });
  });
  return byBasis;
}

function wallCellHtml(entries = []) {
  if (!entries.length) return '<span style="color:#94a3b8;">— · no physical Preview row</span>';
  return entries.map(({rowIndex,lineKey,branchName,result},i) => {
    const identity=entries.length>1
      ? '<div style="font-size:10px;color:#94a3b8;">Row '+(rowIndex+1)+' · '+esc(lineKey||branchName||'?')+'</div>' : '';
    if (!result?.ok) return '<div data-b313-auto-wall-occurrence="'+rowIndex+'">'+identity+
      '<strong style="color:#fbbf24;">—</strong>'+
      '<div style="font-size:10px;color:#fbbf24;">'+esc(result?.reason||'Calculation inputs incomplete')+'</div></div>';
    const value=Number(result.requiredNominalThicknessMm);
    const status=result.hypotheticalKpa
      ? 'HYPOTHETICAL kPa(g) ONLY · P1 unit UNKNOWN · no Pull'
      : result.pressureUnitAssumed
        ? 'WHAT-IF · selected common P1 '+text(result.pressureUnit)+' · no Pull'
        : 'Calculated reference · P1 '+text(result.pressureUnit);
    return '<div data-b313-auto-wall-occurrence="'+rowIndex+'" '+
      (i?'style="margin-top:5px;padding-top:5px;border-top:1px solid #334155;"':'')+'>'+
      identity+'<strong style="font-size:13px;color:#e2e8f0;">'+value.toFixed(3)+' mm</strong>'+      '<div style="font-size:10px;color:#94a3b8;">Pressure t '+Number(result.pressureDesignThicknessMm).toFixed(3)+' mm · class '+esc(result.classNominalWallMm??'?')+' mm</div>'+      (result.outsideDiameterSource==='pipe-wall-master-exact-DN-SCREENING-ONLY'?'<div style="font-size:9px;color:#fbbf24;">OD from dimension master, NOT verified physical OD</div>':'')+
      '<div style="font-size:10px;color:'+(result.pressureUnitAssumed?'#fbbf24':'#94a3b8')+';">'+
      esc(status)+' · not Pull approved</div></div>';
  }).join('');
}

function refreshCalculatedWallPanelCells(panel, host, config, rows) {
  const previewNodeRows=Array.isArray(host?.__xmlCiiPreviewResult?.nodeBoreWallRows)
    ?host.__xmlCiiPreviewResult.nodeBoreWallRows:[];
  const byBasis=buildPreviewB313BasisWallCells(rows,config,previewNodeRows);
  panel?.querySelectorAll?.('[data-b313-auto-key]').forEach(tr=>{
    const cell=tr.querySelector?.('[data-b313-auto-calculated-wall]');
    if(cell)cell.innerHTML=wallCellHtml(byBasis.get(text(tr.dataset?.b313AutoKey))||[]);
  });
}

function panelHtml(models, config = {}, physicalRows = [], previewNodeRows = []) {
  const physicalRowCount = physicalRows.length;
  const calculatedWalls = buildPreviewB313BasisWallCells(physicalRows,config,previewNodeRows);
  const tolerance = config?.b313WallUpdate?.millTolerance || { basis: 'percent', value: 12.5 };
  const csFallback = config?.b313WallUpdate?.materialFallback?.enabled !== false;
  const commonPUnit = text(config?.b313WallUpdate?.commonPressureUnitFallback || 'AUTO').toUpperCase();
  // A source header is a suggestion for the one shared fallback, not proof
  // that every effective Preview P1 still matches its original source cell.
  const sourceUnits = [...new Set((config?.linelist?.masterRows || [])
    .filter(r => /^line-list-header-band:/i.test(text(r?._sourceP1HeaderSource))
      && Array.isArray(r?._sourceP1HeaderTexts)
      && r._sourceP1HeaderTexts.some(h => /PRESSURE\s+(MAX|MAXIMUM)|DESIGN\s+PRESSURE/i.test(text(h))))
    .map(r => text(r?._sourceP1Unit).toUpperCase()).filter(Boolean))];
  const lineListHint = sourceUnits.length === 1
    ? 'Selected Line List design-pressure header: ' + (sourceUnits[0] === 'KPA' ? 'kPa(g)' : sourceUnits[0])
      + '. This is a shared fallback suggestion, NOT row-level P1 verification.'
    : sourceUnits.length > 1 ? 'Selected Line List has conflicting design-pressure units; verify before fallback.'
      : 'No consistent selected Line List design-pressure header receipt is available.';
  const rowsHtml = models.map((model) => {
    const source = model.materialSource ? `source ${esc(model.materialSource)}` : 'source unknown';
    const t1 = model.t1 ? `${esc(model.t1)} °C` : 'unresolved';
    const route = model.route || '—';
    const routeSource = model.routeSource || 'unresolved';
    const pressureTrace = model.previewP1
      ? `P1 ${esc(model.previewP1)} ${esc(model.previewP1Unit || '(unit unresolved)')}` : 'P1 unresolved';
    const hydroTrace = model.previewHydroPressure ? ` · test ${esc(model.previewHydroPressure)}` : '';
    const iconDisabled = model.tableContext?.materialId ? '' : 'disabled';
    const identityHint = model.materialIdentityNeedsReview && !model.materialIdentityReviewed
      ? '<div style="font-size:9px;color:#fbbf24;">Family-default grade is only a candidate; verify the exact material specification.</div>'
      : '';
    const seedHint = model.fallback?.ok && model.statusCode !== 'CONTROLLED_FALLBACK_READY'
      ? `<div style="font-size:9px;color:#fbbf24;margin-top:2px;">Seed ${esc(model.fallback.seedTemperatureC)} °C · ${esc(model.fallback.selectionDirection || '')} · no interpolation</div>`
      : '';
    const prefill=previewB313FactorPrefill(model);
    const sourceEvidence=prefill.evidence;
    const evidenceText=sourceEvidence
      ?`Source ${sourceEvidence.basisId} · ${sourceEvidence.sourceReference} · ${sourceEvidence.editionBasis} · S ${sourceEvidence.stressLookupMethod} at ${model.t1}°C`
      :prefill.qualification==='QUALIFIED_ACTIVE_MASTER'?'Active strict qualified factor master':'No numeric screening master evidence at this Preview T1';
    const refreshDisabled = model.tableContext?.materialId && model.t1 ? '' : 'disabled';
    return `<tr data-b313-auto-key="${esc(model.basisKey)}" data-b313-auto-material-id="${esc(model.tableContext?.materialId || '')}" data-b313-auto-temperature="${esc(model.tableContext?.temperatureC ?? '')}">
      <td style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;"><strong>${esc(model.material || '—')}</strong><div style="font-size:10px;color:#94a3b8;">${source} · T1 ${t1} · ${pressureTrace}${hydroTrace}</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;min-width:210px;"><strong>${esc(model.materialId || model.identityCode)}</strong><div data-b313-auto-status style="font-size:10px;color:${statusColor(model)};font-weight:700;">${esc(model.statusLabel)}</div><div style="font-size:10px;color:#cbd5e1;">${esc(model.factorSummary)}</div>${renderPreviewB313NumericScreeningReference(model)}<div data-b313-source-trace style="font-size:9px;color:#94a3b8;margin-top:3px;">${esc(model.sourceTrace || 'Exact-DN class evidence unavailable')}</div>${identityHint}${seedHint}</td>
      <td data-b313-auto-calculated-wall style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;min-width:166px;max-width:260px;">${wallCellHtml(calculatedWalls.get(model.basisKey)||[])}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;min-width:180px;">
        <strong>${esc(route)}</strong><div style="font-size:10px;color:#94a3b8;">${esc(routeSource)}</div>
        <input type="text" data-b313-auto-route aria-label="Actual pipe manufacturing route" placeholder="SEAMLESS / EFW_..." value="${esc(model.storedBasis?.manufacturingRoute || (model.routeSource==='confirmed ASTM A106 product specification'?model.route:''))}" style="margin-top:4px;width:98%;">
        <input type="text" data-b313-auto-route-source aria-label="Physical route source reference" placeholder="Pipe spec / MTR source reference" value="${esc(model.storedBasis?.manufacturingRouteSourceReference || '')}" style="margin-top:4px;width:98%;">
        <label style="display:block;font-size:10px;"><input type="checkbox" data-b313-auto-route-reviewed ${model.storedBasis?.manufacturingRouteEvidenceReviewed === true?'checked':''}> Route source independently reviewed</label>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;">${fallbackInputCell(model, 'S', 'allowableStress', { width: '82px' })}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;">${stressUnitCell(model)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;">${fallbackInputCell(model, 'E', 'qualityFactorE', { min: 0, max: 1 })}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;">${fallbackInputCell(model, 'W', 'weldStrengthReductionW', { min: 0, max: 1 })}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;">${fallbackInputCell(model, 'Y', 'coefficientY', { min: 0, max: 1 })}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #334155;vertical-align:top;min-width:260px;">
        <div style="display:flex;gap:4px;"><span data-b313-auto-preview-punit style="font-size:10px;">P1 unit ${esc(model.previewP1Unit || (text(model.storedBasis?.pressureUnit) && text(model.storedBasis.pressureUnit).toUpperCase() !== 'AUTO' ? 'legacy basis '+model.storedBasis.pressureUnit : 'unresolved'))}</span>
        <select data-b313-auto-field="dimensionStandard" aria-label="Pipe dimension standard"><option value="AUTO">Dimension AUTO</option>${['ASME B36.10M','ASME B36.19M'].map((u)=>`<option value="${u}" ${text(model.storedBasis?.dimensionStandard)===u?'selected':''}>${u}</option>`).join('')}</select></div>
        <div style="font-size:9px;color:#fbbf24;margin:3px 0;">Use the common P1-unit fallback above when the Preview source unit is missing; S/E/W/Y remain unapproved.</div>
        <div data-b313-auto-factor-qualification data-b313-qualification="${esc(prefill.qualification)}" style="font-size:10px;color:#fbbf24;font-weight:700;">Qualification: ${esc(prefill.qualification)} · ${prefill.eligibleForPull?'qualified values':'not approved for Pull'}</div>
        <div data-b313-auto-evidence style="font-size:9px;color:#cbd5e1;max-width:360px;overflow-wrap:anywhere;">Evidence: ${esc(evidenceText)}</div>
        <input type="text" data-b313-auto-source-reference aria-label="Factor source reference; replace screening evidence to qualify" placeholder="Qualified source reference (required to approve)" value="${esc(prefill.sourceReference)}" style="margin-top:4px;width:98%;">
        <label style="display:block;font-size:10px;"><input type="checkbox" data-b313-auto-design-approved ${model.storedBasis?.designApproved === true && prefill.qualification!=='SCREENING_NOT_QUALIFIED' ? 'checked' : ''}> Qualified manual basis reviewed</label>
        ${model.materialFallbackApplied ? `<label style="display:block;font-size:10px;"><input type="checkbox" data-b313-auto-cs-reviewed ${model.storedBasis?.csFallbackReviewed === true ? 'checked' : ''}> Confirm CS fallback applies</label>` : ''}
        ${model.materialIdentityNeedsReview && !model.materialFallbackApplied ? `<label style="display:block;font-size:10px;"><input type="checkbox" data-b313-auto-identity-reviewed ${model.storedBasis?.identityReviewed === true ? 'checked' : ''}> Exact material grade verified against controlled source</label>` : ''}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #334155;text-align:center;vertical-align:middle;white-space:nowrap;"><button type="button" data-b313-auto-refresh ${refreshDisabled} aria-label="Accept current fallback and recalculate" title="Accept current fallback values and recalculate B31.3 wall" style="width:24px;height:24px;padding:0;border:1px solid #64748b;border-radius:4px;background:#111827;color:#fbbf24;cursor:pointer;font-size:16px;line-height:22px;">↻</button> <button type="button" data-b313-auto-open-material ${iconDisabled} aria-label="Open B31.3 Material Factors table" title="Open B31.3 Material Factors table" style="width:24px;height:24px;padding:0;border:1px solid #64748b;border-radius:4px;background:#111827;color:#e2e8f0;cursor:pointer;font-size:14px;line-height:22px;">▦</button></td>
    </tr>`;
  }).join('');

  return `<div data-mc-b313-auto-basis-panel style="margin:8px 0;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;padding:8px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;"><strong>Wall Thickness Review — DTXR evidence, B31.3 basis &amp; results</strong><span style="font-size:10px;color:#94a3b8;">${physicalRowCount} physical Preview row(s) · ${models.length} occurrence-scoped basis entry/entries</span></div>
    <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">Primary path: effective Preview Material → 8 Config material-code mapping and exact-DN Piping Class evidence → qualified S at T1 and governed E/W/Y rules → calculated wall → explicit Pull. The source trace is identification evidence, not ASME factor approval. Unqualified candidates cannot calculate automatically. Manual S/E/W/Y remains a separately reviewed fallback, not strict factor data. Only source-confirmed ASTM A106 pipe may imply seamless manufacturing; generic CS does not.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0;">
      <label>Common P1 unit fallback <select data-b313-common-pressure-unit aria-label="Shared pressure unit fallback for 4 Preview B31.3 screening"><option value="AUTO" ${commonPUnit==='AUTO'?'selected':''}>None / AUTO</option>${['KPA','MPA','BARG','BAR','PSIG','PSI','PA'].map(u=>`<option value="${u}" ${commonPUnit===u?'selected':''}>${u==='KPA'?'kPa(g)':u}</option>`).join('')}</select></label>
      <small style="color:#fbbf24;">${esc(lineListHint)} Fallback applies only to missing P1 units, gives a WHAT-IF number and never permits Pull.</small>
      <label>Mill tolerance <select data-b313-mill-basis><option value="percent" ${tolerance.basis==='percent'?'selected':''}>%</option><option value="absolute" ${tolerance.basis==='absolute'?'selected':''}>mm</option></select></label>
      <input type="number" step="any" min="0" data-b313-mill-value value="${esc(tolerance.value ?? 12.5)}" style="width:80px;">
      <label><input type="checkbox" data-b313-cs-fallback ${csFallback?'checked':''}> Use CS fallback for unknown material</label>
      <small>Changed tolerance requires recalculation; qualified factors are still mandatory.</small>
    </div>
    <div style="overflow:auto;"><table style="border-collapse:collapse;width:100%;font-size:11px;min-width:1420px;"><thead><tr><th style="text-align:left;padding:5px;">Preview Material / T1</th><th style="text-align:left;padding:5px;">B31.3 identity / status</th><th style="text-align:left;padding:5px;">Calculated wall (mm)<div style="font-size:9px;font-weight:400;">Read-only · no Pull</div></th><th style="text-align:left;padding:5px;">Route</th><th style="text-align:left;padding:5px;">Fallback S</th><th style="text-align:left;padding:5px;">S unit</th><th style="text-align:left;padding:5px;">E</th><th style="text-align:left;padding:5px;">W</th><th style="text-align:left;padding:5px;">Y</th><th>Basis / source / review</th><th style="text-align:center;padding:5px;">Recalc / Table</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    <div data-mc-dtxr-unified-review-slot style="margin-top:10px;border-top:1px solid #475569;padding-top:8px;"><div style="font-size:11px;color:#94a3b8;">DTXR schedule proposals: use Review DTXR wall candidates above. No source candidate is applied without checking individual physical keys. Existing overrides and B31.3 accepted walls remain protected.</div></div>
    <div data-mc-b313-unified-audit-slot style="margin-top:10px;border-top:1px solid #475569;padding-top:8px;">
      <div style="font-size:11px;color:#94a3b8;">Calculation results appear here after the B31.3 calculate action. DTXR source wall and B31.3 design wall remain separate authorities. Calculating does not update wall thickness: explicit Pull remains required.</div>
    </div>
  </div>`;
}

function bindInfoPopups(panel) {
  panel?.querySelectorAll?.('[data-b313-factor-info-button]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const row = button.closest('[data-b313-auto-key]');
    const factor = button.dataset.b313FactorInfoButton;
    const popup = row?.querySelector?.(`[data-b313-factor-info="${factor}"]`);
    if (!popup) return;
    row.querySelectorAll?.('[data-b313-factor-info]').forEach((node) => { if (node !== popup) node.hidden = true; });
    popup.hidden = !popup.hidden;
  }));
}

function bindTableLinks(panel) {
  panel?.querySelectorAll?.('[data-b313-auto-open-material]').forEach((button) => button.addEventListener('click', () => {
    const rowEl = button.closest('[data-b313-auto-material-id]');
    const materialId = text(rowEl?.dataset?.b313AutoMaterialId);
    const rawTemperature = text(rowEl?.dataset?.b313AutoTemperature);
    const temperatureC = rawTemperature === '' ? undefined : Number(rawTemperature);
    if (!materialId || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('app:switch-tab', {
      detail: {
        tabId: 'b313-material-factors',
        context: {
          materialId,
          temperatureC: Number.isFinite(temperatureC) ? temperatureC : undefined,
        },
      },
    }));
  }));
}

function ensureBasisBucket(config) {
  if (!config.b313WallUpdate || typeof config.b313WallUpdate !== 'object' || Array.isArray(config.b313WallUpdate)) config.b313WallUpdate = {};
  if (!config.b313WallUpdate.bases || typeof config.b313WallUpdate.bases !== 'object' || Array.isArray(config.b313WallUpdate.bases)) config.b313WallUpdate.bases = {};
  return config.b313WallUpdate.bases;
}

function numericField(rowEl, field) {
  const raw = text(rowEl?.querySelector?.(`[data-b313-auto-field="${field}"]`)?.value);
  const value = Number(raw);
  return raw !== '' && Number.isFinite(value) ? value : null;
}

function validateFallbackRecord(record) {
  return record.allowableStress > 0
    && record.qualityFactorE > 0 && record.qualityFactorE <= 1
    && record.weldStrengthReductionW > 0 && record.weldStrengthReductionW <= 1
    && record.coefficientY !== null && record.coefficientY !== undefined
    && Number.isFinite(Number(record.coefficientY))
    && record.coefficientY >= 0 && record.coefficientY <= 1
    && text(record.stressUnit);
}

function bindRefresh(panel, host, config, models, options) {
  const byKey = new Map(models.map((model) => [text(model.basisKey), model]));
  panel?.querySelectorAll?.('[data-b313-auto-refresh]').forEach((button) => button.addEventListener('click', async () => {
    const rowEl = button.closest('[data-b313-auto-key]');
    const key = text(rowEl?.dataset?.b313AutoKey);
    const model = byKey.get(key);
    if (!model?.tableContext?.materialId || !key) return;

    const record = {
      ...(ensureBasisBucket(config)[key] || {}),
      material: model.material,
      materialId: model.materialId,
      designTemperature: model.t1,
      manufacturingRoute: text(rowEl?.querySelector?.('[data-b313-auto-route]')?.value),
      manufacturingRouteSourceReference: text(rowEl?.querySelector?.('[data-b313-auto-route-source]')?.value),
      manufacturingRouteEvidenceReviewed: rowEl?.querySelector?.('[data-b313-auto-route-reviewed]')?.checked === true,
      allowableStress: numericField(rowEl, 'allowableStress'),
      stressUnit: text(rowEl?.querySelector?.('[data-b313-auto-field="stressUnit"]')?.value || model.fallback?.stressUnit),
      qualityFactorE: numericField(rowEl, 'qualityFactorE'),
      weldStrengthReductionW: numericField(rowEl, 'weldStrengthReductionW'),
      coefficientY: numericField(rowEl, 'coefficientY'),
      fallbackSeedTemperatureC: model.fallback?.seedTemperatureC ?? null,
      fallbackSeedEvidence: model.fallback?.factorSources || {},
      sourceReference: text(rowEl?.querySelector?.('[data-b313-auto-source-reference]')?.value),
      designApproved: rowEl?.querySelector?.('[data-b313-auto-design-approved]')?.checked === true,
      csFallbackReviewed: rowEl?.querySelector?.('[data-b313-auto-cs-reviewed]')?.checked === true,
      identityReviewed: rowEl?.querySelector?.('[data-b313-auto-identity-reviewed]')?.checked === true,
      // Preserve any older per-basis unit for compatibility; common fallback
      // is edited once above and never duplicated into per-row basis records.
      pressureUnit: text(model.storedBasis?.pressureUnit || 'AUTO'),
      dimensionStandard: text(rowEl?.querySelector?.('[data-b313-auto-field="dimensionStandard"]')?.value || 'AUTO'),
    };
    const status = rowEl.querySelector?.('[data-b313-auto-status]');
    const strictReady = model.factorBasis?.ok && model.factorBasis?.mode === 'ACTIVE_MASTER_STRICT';
    const routeOnly = !!record.manufacturingRoute
      && !!record.manufacturingRouteSourceReference
      && record.manufacturingRouteEvidenceReviewed === true;
    const sourceIsScreening=/^SCREENING_ONLY:/i.test(record.sourceReference);
    // SCREENING candidate numbers and their master reference are
    // automatically displayed but do NOT count as a reviewed source.
    // Auto-filled input fields cannot be silently serialized into the
    // controlled manual factor basis, even if the review checkbox is set.
    if(sourceIsScreening){
      if(record.designApproved){
        if(status){
          status.textContent='SCREENING SOURCE IS NOT QUALIFIED; REPLACE WITH AN INDEPENDENT CONTROLLED SOURCE';
          status.style.color='#fca5a5';
        }
        return;
      }
      // Preserve any previously reviewed route evidence separately without
      // storing S/E/W/Y as authoritative material factors.
      if(routeOnly){
        const prior=ensureBasisBucket(config)[key]||{};
        ensureBasisBucket(config)[key]={...prior,
          manufacturingRoute:record.manufacturingRoute,
          manufacturingRouteSourceReference:record.manufacturingRouteSourceReference,
          manufacturingRouteEvidenceReviewed:true};
        await options?.onSaveConfigPreservePreview?.(config);
      }
      if(status){
        status.textContent='SCREENING VALUES POPULATED; QUALIFICATION PENDING — CONDITIONAL RECALCULATION ONLY';
        status.style.color='#fbbf24';
      }
      host?.querySelector?.('[data-mc-b313-wall-update]')?.click?.();
      return;
    }
    const manualFactorsComplete = validateFallbackRecord(record) && !!text(record.sourceReference);
    // Allow physical route evidence to be saved independently of manual
    // factor overrides; a newly verified route may unlock strict code data.
    if (!strictReady && !manualFactorsComplete && !routeOnly) {
      if (status) {
        status.textContent = 'REVIEW ROUTE SOURCE OR COMPLETE MANUAL FACTORS';
        status.style.color = '#fca5a5';
      }
      return;
    }

    button.disabled = true;
    try {
      ensureBasisBucket(config)[key] = record;
      await options?.onSaveConfigPreservePreview?.(config);
      if (status) {
        status.textContent = 'MANUAL FACTOR BASIS SAVED — RECALCULATING';
        status.style.color = '#93c5fd';
      }
      const wallButton = host?.querySelector?.('[data-mc-b313-wall-update]');
      wallButton?.click?.();
    } finally {
      button.disabled = false;
    }
  }));
}

function applyT1Guard(host, models) {
  const button = host?.querySelector?.('[data-mc-b313-wall-update]');
  if (!button) return;
  const missing = models.filter((model) => model.statusCode === 'B313_PREVIEW_T1_REQUIRED').length;
  // A missing T1 holds that model only; it must not disable unrelated rows.
  // Blank T1 is never treated as 0 °C.
  if (!button.dataset.mcB313AutoBasisOriginalTitle) button.dataset.mcB313AutoBasisOriginalTitle = button.title || '';
  button.title = missing
    ? `${missing} material/T1 group(s) require T1; other valid Preview rows can still be calculated.`
    : button.dataset.mcB313AutoBasisOriginalTitle;
}
/**
 * Selecting the 4 Preview B31.3 pressure-unit basis is NOT approval of
 * screening stress coefficients. This action is deliberately independent
 * of the "Accept manual factors" refresh button and preserves all existing
 * factor/route fields unchanged.
 */
export function setPreviewB313PressureUnitOnly(config, basisKey, pressureUnit) {
  const allowed = new Set(['AUTO','PA','KPA','MPA','BAR','BARG','PSI','PSIG']);
  const chosen = text(pressureUnit).toUpperCase();
  if (!text(basisKey) || !allowed.has(chosen)) return {ok:false,code:'INVALID_PREVIEW_P_UNIT'};
  const bases=ensureBasisBucket(config);
  const prior=bases[basisKey] || {};
  bases[basisKey]={
    ...prior,pressureUnit:chosen,
    pressureUnitSelectionSource:chosen==='AUTO'?'AUTO_FROM_4_PREVIEW'
      :'USER_SELECTED_4_PREVIEW_B313_BASIS',
  };
  return {ok:true,code:'SCREENING_PRESSURE_UNIT_RECALCULATE',
    basisKey,pressureUnit:chosen,eligibleForPull:false};
}

/** One common P1 fallback for all unresolved 4 Preview rows, never a row override. */
export function setPreviewB313CommonPressureUnitFallback(config, pressureUnit) {
  const allowed=new Set(['AUTO','PA','KPA','MPA','BAR','BARG','PSI','PSIG']);
  const chosen=text(pressureUnit).toUpperCase();
  if(!config || !allowed.has(chosen)) return {ok:false,code:'INVALID_COMMON_P1_UNIT'};
  if(!config.b313WallUpdate || typeof config.b313WallUpdate!=='object'
      || Array.isArray(config.b313WallUpdate)) config.b313WallUpdate={};
  config.b313WallUpdate.commonPressureUnitFallback=chosen;
  config.b313WallUpdate.commonPressureUnitFallbackSource=chosen==='AUTO'
    ?'DISABLED':'USER_SELECTED_SHARED_SCREENING_ASSUMPTION';
  return {ok:true,code:'COMMON_P1_UNIT_SCREENING_ONLY',pressureUnit:chosen,
    eligibleForPull:false};
}

function bindScreeningPressureUnit(panel,host,config,models,options) {
  const select=panel?.querySelector?.('[data-b313-common-pressure-unit]');
  select?.addEventListener('change',async()=>{
    const result=setPreviewB313CommonPressureUnitFallback(config,select.value);
    if(!result.ok)return;
    await options?.onSaveConfigPreservePreview?.(config);
    // Refresh only the display cells. Do not invoke the governed B31.3
    // action, mutate proposalsByBranch or alter saved Wall Thk/CII.
    const liveRows=Array.isArray(host?.__xmlCiiPreviewResult?.branchRows)
      ?host.__xmlCiiPreviewResult.branchRows:[];
    if(liveRows.length) {
      const report=buildPreviewB313AutomaticWallColumnReport({rows:liveRows,config,host});
      renderPreviewB313CalculatedWallCells(host,report);
      refreshCalculatedWallPanelCells(panel,host,config,liveRows);
    }
  });
}

function bindMillAndCsControls(panel, host, config, rows, options) {
  const tolerance = config.b313WallUpdate || (config.b313WallUpdate = {});
  const type = panel.querySelector?.('[data-b313-mill-basis]');
  const value = panel.querySelector?.('[data-b313-mill-value]');
  const cs = panel.querySelector?.('[data-b313-cs-fallback]');
  const save = async () => {
    const mode = text(type?.value) === 'absolute' ? 'absolute' : 'percent';
    const raw = text(value?.value);
    const number = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(number) || number < 0 || (mode === 'percent' && number >= 100)) {
      value?.setCustomValidity?.('Enter a valid nonnegative mill tolerance; percentage must be below 100.');
      value?.reportValidity?.();
      return;
    }
    value?.setCustomValidity?.('');
    tolerance.millTolerance = mode === 'percent'
      ? { basis: 'percent', value: number }
      : { basis: 'absolute', value: number, unit: 'mm' };
    tolerance.materialFallback = {
      ...(tolerance.materialFallback || {}),
      enabled: cs?.checked !== false, family: 'CS', mode: 'PROPOSE_FOR_REVIEW'
    };
    await options?.onSaveConfigPreservePreview?.(config);
    const liveRows=Array.isArray(host?.__xmlCiiPreviewResult?.branchRows)
      ?host.__xmlCiiPreviewResult.branchRows:rows;
    refreshCalculatedWallPanelCells(panel,host,config,liveRows);
  };
  type?.addEventListener('change', async () => {
    if (value) value.value = type.value === 'absolute' ? '1.5' : '12.5';
    await save();
  });
  value?.addEventListener('change', save);
  cs?.addEventListener('change', async () => {
    await save();
    installPreviewB313AutoBasisPanel({ host, config, rows, options, watchLive: false });
  });
}

function watchLivePreviewRows({ host, config, rows, options }) {
  host.__xmlCiiB313AutoBasisObserver?.disconnect?.();
  let scheduled = false;
  let renderedResult = null;
  const refresh = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const liveResult = host.__xmlCiiPreviewResult;
      const currentRows = Array.isArray(liveResult?.branchRows) ? liveResult.branchRows : rows;
      const panel = host.querySelector?.('[data-mc-b313-auto-basis-panel]');
      if (!currentRows.length) {
        panel?.remove?.();
        renderedResult = liveResult;
        return;
      }
      if (!host.querySelector?.('[data-mc-b313-wall-update]')) return;
      const legacyEditor = host.querySelector?.('[data-mc-b313-basis-editor]');
      if (renderedResult === liveResult && panel && (!legacyEditor || legacyEditor.hidden)) return;
      installPreviewB313AutoBasisPanel({ host, config, rows: currentRows, options, watchLive: false });
      renderedResult = liveResult;
    });
  };
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(refresh);
    observer.observe(host, { childList: true, subtree: true });
    host.__xmlCiiB313AutoBasisObserver = observer;
  }
  refresh();
}

export function installPreviewB313AutoBasisPanel({ host, config, rows = [], options = {}, watchLive = true } = {}) {
  if (!host) return [];
  if (watchLive) watchLivePreviewRows({ host, config, rows, options });
  const models = buildPreviewB313AutoBasisRows(rows, config);
  const legacyEditor = host.querySelector?.('[data-mc-b313-basis-editor]');
  if (legacyEditor) {
    legacyEditor.hidden = true;
    legacyEditor.style.display = 'none';
    legacyEditor.dataset.mcB313AutoBasisReplaced = 'true';
  }

  host.querySelector?.('[data-mc-b313-auto-basis-panel]')?.remove?.();
  if (models.length) {
    if (legacyEditor) legacyEditor.insertAdjacentHTML('afterend', panelHtml(models, config, rows,
      host?.__xmlCiiPreviewResult?.nodeBoreWallRows || []));
    else {
      const actionBar = host.querySelector?.('[data-mc-preview-build]')?.parentElement;
      actionBar?.parentElement?.insertAdjacentHTML?.('afterend', panelHtml(models, config, rows,
        host?.__xmlCiiPreviewResult?.nodeBoreWallRows || []));
    }
    const panel = host.querySelector?.('[data-mc-b313-auto-basis-panel]');
    // The audit may run before this lazy-rendered editor mounts. In that case
    // the legacy renderer placed it above the editor as a sibling. Physically
    // MOVE the existing report (rather than copying or displaying two reports)
    // into the sole B31.3 review workspace.
    const slot = panel?.querySelector?.('[data-mc-b313-unified-audit-slot]');
    if (slot) {
      const reports = [...(host.querySelectorAll?.('[data-mc-b313-report]') || [])];
      if (reports.length) {
        const latest = reports[reports.length - 1];
        slot.replaceChildren(latest);
        reports.slice(0, -1).forEach((other) => other.remove());
      }
    }
    bindTableLinks(panel);
    bindInfoPopups(panel);
    bindRefresh(panel, host, config, models, options);
    bindScreeningPressureUnit(panel, host, config, models, options);
    bindMillAndCsControls(panel, host, config, rows, options);
  }
  applyT1Guard(host, models);
  return models;
}
