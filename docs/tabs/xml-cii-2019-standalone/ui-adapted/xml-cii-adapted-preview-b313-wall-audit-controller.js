import {
  B313_PREVIEW_ACTION_LABEL,
  B313_PREVIEW_REPORT_SCHEMA,
  buildPreviewB313WallUpdateReport,
  buildPreviewB313CalculatedWallDisplay,
  buildPreviewB313SourceToWallLedger,
  previewB313LedgerCsv,
  installPreviewB313WallUpdateController,
  selectPreviewB313ActionRows,
} from './xml-cii-adapted-preview-b313-wall-update.js?v=20261118-glrd-numeric-2';
import {buildPreviewB36SelectedThickness} from './xml-cii-adapted-preview-b313-b36-selected.js?v=20261119-b36-selected-1';
import { XML_CII_PREVIEW_LEGACY_CACHE_KEY } from './xml-cii-adapted-preview-cache-v7.js';

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
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fixed(value, digits = 3) {
  const number = finite(value);
  return number === null ? '—' : number.toFixed(digits);
}

function compact(value, digits = 4) {
  const number = finite(value);
  if (number === null) return '—';
  return Number(number.toFixed(digits)).toString();
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
}

function snapshotRows(rows) {
  return normalizeRows(rows).map((row) => ({ ...row }));
}

function readLegacyBranchRows() {
  try {
    const payload = typeof localStorage !== 'undefined'
      ? JSON.parse(localStorage.getItem(XML_CII_PREVIEW_LEGACY_CACHE_KEY) || 'null')
      : null;
    return normalizeRows(payload?.data?.branchRows);
  } catch {
    return [];
  }
}

function currentPreviewRows(host, suppliedRows = []) {
  return selectPreviewB313ActionRows({
    host,
    suppliedRows,
    legacyRows: readLegacyBranchRows(),
  });
}

export function selectPreviewB313AuditRows(snapshot = [], live = []) {
  const liveRows = normalizeRows(live);
  if (liveRows.length) return liveRows;
  return normalizeRows(snapshot);
}

export function derivePreviewB313AuditSummary(report = {}) {
  const rows = normalizeRows(report?.rows);
  const declaredInput = Math.max(0, finite(report?.summary?.inputRows) ?? 0);
  const evaluatedRows = Math.max(declaredInput, rows.length);
  const updatedRows = rows.filter((row) => row.status === 'UPDATED').length;
  const calculatedRows = rows.filter((row) => row.status === 'CALCULATED').length;
  const explicitNotUpdatedRows = rows.filter((row) => !['UPDATED', 'CALCULATED'].includes(row.status)).length;
  const notUpdatedRows = Math.max(explicitNotUpdatedRows, evaluatedRows - updatedRows - calculatedRows);
  const declaredUpdated = Math.max(0, finite(report?.summary?.updatedRows) ?? 0);
  const declaredCalculated = Math.max(0, finite(report?.summary?.calculatedRows) ?? 0);
  const declaredSkipped = Math.max(0, finite(report?.summary?.skippedRows) ?? 0);
  const summaryMismatch = declaredInput !== evaluatedRows
    || declaredUpdated !== updatedRows
    || declaredCalculated !== calculatedRows
    || declaredSkipped !== notUpdatedRows;
  return {
    evaluatedRows,
    updatedRows,
    calculatedRows,
    notUpdatedRows,
    summaryMismatch,
    hasInput: evaluatedRows > 0,
    allUpdated: evaluatedRows > 0 && updatedRows === evaluatedRows,
  };
}

function statusPill(status) {
  const updated = status === 'UPDATED';
  const calculated = status === 'CALCULATED';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.03em;background:${updated ? '#dcfce7' : '#fef3c7'};color:${updated ? '#166534' : '#92400e'};border:1px solid ${updated ? '#86efac' : '#fcd34d'};">${updated ? 'UPDATED' : calculated ? 'CALCULATED · PULL REQUIRED' : 'NOT UPDATED'}</span>`;
}

function authorityLabel(mode) {
  if (mode === 'ACTIVE_MASTER_STRICT') return 'ACTIVE MASTER / STRICT';
  if (mode === 'MANUAL_EXPLICIT_FALLBACK') return 'MANUAL CONTROLLED FALLBACK';
  return text(mode) || 'UNRESOLVED';
}

/**
 * The real numeric B31.3 wall is a separate audit column, even when the
 * source/master approval path has not produced an authorized Pull proposal.
 */
function calculatedWallAuditCell(row) {
  const r=row?.calculatedWallDisplay;
  const hypothetical=r?.ok!==true&&r?.hypotheticalScenario?.ok===true;
  const shown=hypothetical?r.hypotheticalScenario:r;
  const hasValue=shown?.ok===true;
  const note=hypothetical
    ?'HYPOTHETICAL kPa(g) ONLY; source unit unresolved; governing result INPUT REQUIRED; NO Pull'
    :hasValue?(shown.pressureUnitAssumed
      ?'what-if · common fallback '+text(shown.pressureUnit)
      :'P unit '+text(shown.pressureUnit)):(text(r?.reason)||'Input incomplete');
  return `<td data-b313-calculated-audit style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;min-width:145px;">
    <strong data-b313-calculated-audit-value style="color:#0f172a;font-size:13px;">${hasValue?fixed(shown.requiredNominalThicknessMm,3):'—'}</strong>
    <div style="color:#64748b;font-size:10px;">${esc(note)}</div>
    ${hasValue?`<div style="color:#64748b;font-size:10px;">t ${fixed(shown.pressureDesignThicknessMm,3)} mm · E ${compact(shown.factors.E)}</div>`:''}
  </td>`;
}

function updatedRowHtml(row) {
  const evidence = row?.evidence || {};
  const result = row?.result || {};
  const calculation = result?.calculation || evidence?.calculation || {};
  const schedule = Array.isArray(result?.equivalentSchedules) && result.equivalentSchedules.length
    ? result.equivalentSchedules.join(' / ')
    : text(result?.selectedSchedule) || '—';
  const material = text(evidence.previewMaterial) || text(row.materialId) || '—';
  const materialId = text(row.materialId) || text(evidence.materialId) || '—';
  const t1 = text(evidence.designTemperature) || '—';
  const factorMode = authorityLabel(row.factorBasisMode || evidence.factorBasisMode);
  const factorSource = evidence.factorDesignAuthority === true ? 'design-authority factor record' : 'non-design-authority fallback';
  const factorDetail = `S ${compact(evidence.allowableStress)} ${esc(evidence.stressUnit || '')} · E ${compact(evidence.qualityFactorE)} · W ${compact(evidence.weldStrengthReductionW)} · Y ${compact(evidence.coefficientY)}`;
  const wallDetail = `OD ${fixed(result.outsideDiameterMm, 3)} mm · P ${compact(result.designPressure)} ${esc(result.pressureUnit || '')} · CA ${compact(result.corrosionAllowanceMm)} mm`;
  const resultDetail = `required nominal ${fixed(calculation.requiredNominalThicknessMm, 4)} mm → selected ${fixed(result.selectedNominalWallMm, 4)} mm · Sch ${esc(schedule)} · margin ${fixed(result.selectionMarginMm, 4)} mm`;
  return `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-family:monospace;font-size:11px;color:#0f172a;">${esc(row.branchName || '—')}</div><div style="font-size:10px;color:#64748b;margin-top:2px;">Line ${esc(row.lineKey || '—')}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;">${esc(material)}</div><div style="font-size:10px;color:#64748b;">${esc(materialId)} · T1 ${esc(t1)} °C</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;color:#166534;">${esc(factorMode)}</div><div style="font-size:10px;color:#475569;">${factorDetail}</div><div style="font-size:10px;color:#64748b;">${esc(factorSource)}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div>${wallDetail}</div><div style="font-size:10px;color:#475569;margin-top:2px;">${resultDetail}</div></td>
    ${calculatedWallAuditCell(row)}
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">${statusPill(row.status || 'UPDATED')}</td>
  </tr>`;
}

function factorAvailabilityFrom(details = {}) {
  return details?.factorAvailability
    || details?.factorBasis?.factorAvailability
    || details?.factorBasis?.details?.factorAvailability
    || details?.result?.details?.factorAvailability
    || null;
}

function factorBlockerText(details = {}) {
  const availability = factorAvailabilityFrom(details);
  if (!availability?.factors) return '';
  const strictStatuses = Array.isArray(availability.strictAcceptedStatuses)
    ? availability.strictAcceptedStatuses.join(' / ')
    : 'VERIFIED / PROJECT_APPROVED';
  const rows = [];
  for (const factor of ['S', 'E', 'W', 'Y']) {
    const item = availability.factors[factor];
    if (!item || item.strictAvailable) continue;
    const statuses = Array.isArray(item.candidateStatuses) ? item.candidateStatuses.filter(Boolean).join(' / ') : '';
    const temperatures = Array.isArray(item.availableTemperaturesC) ? item.availableTemperaturesC.join(', ') : '';
    const routes = Array.isArray(item.availableManufacturingRoutes) ? item.availableManufacturingRoutes.filter(Boolean).join(' / ') : '';
    let detail = item.status || 'STRICT_RECORD_UNAVAILABLE';
    if (item.status === 'QUALIFICATION_STATUS_REJECTED') detail = `candidate status ${statuses || 'unqualified'} excluded; strict accepts ${strictStatuses}`;
    else if (item.status === 'MANUFACTURING_ROUTE_REQUIRED') detail = `manufacturing route required${routes ? `; available ${routes}` : ''}`;
    else if (item.status === 'MANUFACTURING_ROUTE_NO_MATCH') detail = `route ${item.requestedManufacturingRoute || '?'} not matched${routes ? `; available ${routes}` : ''}`;
    else if (item.status === 'NO_QUALIFIED_TEMPERATURE_BASIS') detail = `no qualified T1 basis; nearby source data may be screening only${temperatures ? `; available T °C: ${temperatures}` : ''}`;
    rows.push(`${factor}: ${detail}`);
  }
  return rows.join(' · ');
}


/** Screening result is visual evidence only; never a Pull or strict factor. */

function screeningFactorHtml(reference) {
  if (!reference?.ok) return '';
  const S=reference.S||{}, bracket=Array.isArray(S.bracket)?S.bracket:[];
  const bracketText=bracket.map(x=>esc(x.temperatureC)+'°C:'+compact(x.Sksi,5)+' ksi').join(' → ');
  const routes=Array.isArray(reference.routeOptions)?reference.routeOptions:[];
  const routeOptions=routes.map(route=>`<option value="${esc(route.route)}" data-b313-e="${compact(route.value)}"${route.route===reference.conditionalManufacturing?' selected':''}>${esc(route.route==='SEAMLESS'?'Seamless':route.route.replaceAll('_',' '))}</option>`).join('');
  const routeSelect=routes.length
    ? `<label>Conditional manufacturing <select data-b313-conditional-manufacturing aria-label="Conditional manufacturing (screening only)" style="padding:3px;border:1px solid #d97706;border-radius:4px;">${routeOptions}</select></label>`
    : 'Conditional manufacturing unavailable';
  const eValue=reference.conditionalE===null?'unresolved':compact(reference.conditionalE);
  return `<div data-b313-screening-reference style="margin-top:7px;padding:6px;border:1px solid #f59e0b;border-radius:5px;color:#7c2d12;background:#fffbeb;">
    <strong>SCREENING MASTER LOOKUP — NOT PULL ELIGIBLE</strong>
    <div>Source: ${esc(reference.basisId)} · ${esc(reference.basisStatus)} · T1 ${esc(reference.temperatureC)}°C</div>
    <div>S ${fixed(S.MPa,3)} MPa (${compact(S.ksi,5)} ksi) · ${esc(S.method)} ${bracketText ? '('+bracketText+')':''}</div>
    <div>${routeSelect} · E = <strong data-b313-conditional-e-value>${esc(eValue)}</strong> · W ${compact(reference.W)} · Y ${compact(reference.Y)}</div>
    <div style="font-size:10px;">${reference.conditionalRouteAssumed?'Default Seamless: screening assumption, NOT verified pipe manufacture.':'Declared route: screening only.'} Selector does not authorize Pull.</div>
  </div>`;
}

function screeningWallHtml(reference) {
  if (!reference?.ok) return '';
  const scenarios=Array.isArray(reference.scenarios)?reference.scenarios:[];
  const odProvenance=reference.outsideDiameterReferenceOnly
    ? `<div data-b313-screening-od-source style="font-size:10px;font-weight:700;color:#92400e;">OD ${fixed(reference.outsideDiameterMm,3)} mm from exact-DN dimensional master (screening assumption; 4 Preview node OD unavailable)</div>`
    :reference.outsideDiameterSourceMatched
      ? `<div data-b313-screening-od-source style="font-size:10px;">OD ${fixed(reference.outsideDiameterMm,3)} mm from actual Preview node ledger</div>`
      :'';
  if (!scenarios.length) return `<div style="margin-top:7px;color:#92400e;"><strong>Screening wall not calculated:</strong> ${esc((reference.holdReasons||[]).join(' · ')||'Route or dimensional inputs unavailable')}
    ${odProvenance}
    ${(reference.holdReasons||[]).includes('P1 pressure unit unresolved')?'<div>Select the actual documented P unit in the existing B31.3 basis; no unit is inferred from P1 magnitude.</div>':''}
  </div>`;
  return `<div data-b313-screening-wall style="margin-top:7px;padding:6px;border:1px solid #f59e0b;border-radius:5px;background:#fffbeb;color:#7c2d12;">
    <strong>CONDITIONAL REFERENCE ONLY — not design approved</strong>
    <div>P1 ${compact(reference.pressure)} ${esc(reference.pressureUnit)} · OD ${fixed(reference.outsideDiameterMm,3)} mm · CA ${compact(reference.corrosionAllowanceMm)} mm</div>
    ${odProvenance}
    ${scenarios.map(s=>`<div data-b313-screening-scenario="${esc(s.manufacturingRoute)}" style="border-top:1px solid #fde68a;padding-top:4px;margin-top:4px;${s.manufacturingRoute===reference.conditionalManufacturing?'':'display:none;'}">
      Conditional manufacturing: ${esc(s.manufacturingRoute==='SEAMLESS'?'Seamless':s.manufacturingRoute.replaceAll('_',' '))}${s.routeAssumed?' (what-if; not verified)':''} · E = ${compact(s.E)}:
      ${s.calculationOk
        ? `pressure wall ${fixed(s.pressureDesignThicknessMm,4)} mm → required nominal ${fixed(s.requiredNominalThicknessMm,4)} mm · class ${fixed(s.classNominalWallMm,4)} mm / ${esc(s.classSchedule||'?')} · ${s.classPass?'class reference PASS':'class reference HOLD '+esc(s.classCode||'UNAVAILABLE')}`
        : `no result (${esc(s.code)})`}
    </div>`).join('')}
  </div>`;
}

export function bindPreviewB313ConditionalManufacturing(host) {
  for (const select of host?.querySelectorAll?.('[data-b313-conditional-manufacturing]') || []) {
    if (select.dataset.b313ConditionalBound==='true') continue;
    select.dataset.b313ConditionalBound='true';
    select.addEventListener('change', () => {
      const tr=select.closest('tr');
      if (!tr) return;
      const option=Array.from(select.options).find(o=>o.value===select.value);
      const eEl=tr.querySelector('[data-b313-conditional-e-value]');
      if (eEl) eEl.textContent=option?.dataset?.b313E??'unresolved';
      for (const scenario of tr.querySelectorAll('[data-b313-screening-scenario]'))
        scenario.style.display=scenario.dataset.b313ScreeningScenario===select.value?'':'none';
    });
  }
}

function failedRowHtml(row) {
  const details = row?.details || {};
  const identity = details.materialIdentity || details.factorBasis?.materialIdentity || details.factorBasis?.details?.materialIdentity || null;
  const factorBasis = details.factorBasis || null;
  const materialId = identity?.ok ? identity.material?.materialId : '';
  const materialSource = text(identity?.materialSource || identity?.resolutionSource || identity?.requestMode);
  const factorMode = factorBasis?.ok ? authorityLabel(factorBasis.mode) : text(factorBasis?.code) || 'NOT RESOLVED';
  const reason = text(row.message || row.code || 'Row was not updated.');
  const blockers = factorBlockerText(details);
  const strictMissing = factorBasis?.details?.strictResult?.details?.missing || [];
  const t1 = factorBasis?.details?.designTemperatureC ?? factorBasis?.designTemperatureC;
  const odReference = details.referenceOd ?? details.referenceOdMm ?? details.odBasis?.referenceOdMm;
  const odTolerance = details.toleranceMm ?? details.odBasis?.toleranceMm;
  const odHint = finite(odReference) === null ? '' : `OD reference ${fixed(odReference, 3)} mm${finite(odTolerance) === null ? '' : ` · tolerance ±${fixed(odTolerance, 3)} mm`}`;
  const factorHint = blockers || (strictMissing.length ? `Strict factors missing: ${strictMissing.join(', ')}` : '');
  const screeningReference = row?.screeningReference;
  const screeningFactor = screeningFactorHtml(screeningReference);
  const screeningWall = screeningWallHtml(screeningReference);
  const independentIssues = (Array.isArray(details.independentInputIssues) ? details.independentInputIssues : [])
    .filter((issue) => issue && issue.code !== row.code);
  const independentHint = independentIssues.length
    ? `<div style="font-size:10px;color:#92400e;margin-top:5px;"><strong>Also verify independently:</strong> ${independentIssues.map((issue) => esc(issue.message || issue.code)).join(' · ')}</div>`
    : '';
  return `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-family:monospace;font-size:11px;color:#0f172a;">${esc(row.branchName || '—')}</div><div style="font-size:10px;color:#64748b;margin-top:2px;">Line ${esc(row.lineKey || '—')}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;">${esc(materialId || 'Material identity unresolved')}</div>${materialSource ? `<div style="font-size:10px;color:#64748b;">identity source ${esc(materialSource)}${finite(t1) === null ? '' : ` · T1 ${esc(t1)} °C`}</div>` : ''}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;color:#92400e;">${esc(factorMode)}</div>${factorHint ? `<div style="font-size:10px;color:#92400e;margin-top:3px;">${esc(factorHint)}</div>` : ''}${screeningFactor}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;color:#991b1b;">${esc(row.code || 'B313_PREVIEW_NOT_UPDATED')}</div><div style="font-size:11px;color:#475569;margin-top:2px;">${esc(reason)}</div>${odHint ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">${esc(odHint)}</div>` : ''}${independentHint}${screeningWall}</td>
    ${calculatedWallAuditCell(row)}
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">${statusPill('NOT_UPDATED')}</td>
  </tr>`;
}

/**
 * A single factor-data gap can block many physical GLRD branches. Group
 * diagnostic causes without collapsing the individual engineering evidence.
 * These groups are READ-ONLY diagnostics, never approvals or Pull scopes.
 */
export function derivePreviewB313AuditRootCauseGroups(report = {}) {
  const groups = new Map();
  for (const row of normalizeRows(report?.rows)) {
    if (row.status === 'UPDATED' || row.status === 'CALCULATED') continue;
    const info=row.details||{}, basis=info.factorBasis||{};
    const identity=info.materialIdentity||basis.materialIdentity||basis.details?.materialIdentity||{};
    const mat=text(identity.material?.materialId||basis.details?.materialId||'UNRESOLVED');
    const temp=basis.details?.designTemperatureC??basis.designTemperatureC;
    const t1=temp===undefined||temp===null||text(temp)===''?'?':text(temp);
    const route=text(basis.details?.manufacturingRoute||basis.factorAvailability?.requestedManufacturingRoute||'UNRESOLVED');
    const code=text(row.code||'B313_PREVIEW_NOT_UPDATED');
    const cause=factorBlockerText(info)||text(row.message||code);
    const key=JSON.stringify([mat,t1,route,code,cause]);
    if(!groups.has(key))groups.set(key,{
      materialId:mat,designTemperatureC:t1,manufacturingRoute:route,
      code,cause,count:0,branches:[],
    });
    const group=groups.get(key);
    group.count++;
    group.branches.push({branchName:text(row.branchName),lineKey:text(row.lineKey)});
  }
  return [...groups.values()].sort((a,b)=>b.count-a.count||a.materialId.localeCompare(b.materialId));
}

export function renderPreviewB313WallAuditHtml(report = {}) {
  const rows = normalizeRows(report?.rows);
  const summary = derivePreviewB313AuditSummary(report);
  const rootCauses = derivePreviewB313AuditRootCauseGroups(report);
  const coverage = report?.lineListCoverage;
  const missingSource = coverage?.missingProcessRows > 0;
  const missingLineKeys = Array.isArray(coverage?.missingLineKeys) ? coverage.missingLineKeys : [];
  const sourceStatuses=Object.entries(coverage?.sourceCodeCounts||{})
    .map(([code,count])=>`${esc(code)}: ${count}`).join(' · ');

  const sourceCoverageHtml = missingSource
    ? `<div data-b313-linelist-coverage role="alert" style="margin:9px 0;padding:9px 10px;border:1px solid #c2410c;border-radius:7px;background:#fff7ed;color:#7c2d12;font-size:11px;">
        <strong>UPSTREAM LINE LIST COVERAGE HOLD — ${coverage.missingProcessRows} physical branches lack P1/T1 source evidence</strong>
        <div style="margin-top:4px;">Loaded Line List: <strong>${coverage.loadedLineListRows === null ? 'unavailable' : coverage.loadedLineListRows} rows</strong> · Line List matches ${coverage.matchedPhysicalRows} / ${coverage.physicalRows} physical branches · unmatched ${coverage.unmatchedPhysicalRows} · missing T1 ${coverage.missingT1Rows} · missing P1 ${coverage.missingP1Rows}.</div>
        <div style="margin-top:4px;"><strong>Independent selected-master cross-check:</strong> ${coverage.selectedMasterConfirmedPhysicalRows||0}/${coverage.physicalRows||0} physical matches; ${coverage.selectedMasterAmbiguousPhysicalRows||0} ambiguous, ${coverage.previewMasterOutOfSyncPhysicalRows||0} Preview/master mismatches. ${sourceStatuses}</div>
        <div style="margin-top:4px;">Check that the real <strong>Linelist</strong> worksheet—not Coversheet/summary—was selected in <strong>1 Source &amp; Masters</strong>. Then verify the missing line keys against the selected <strong>PSI-02</strong> model. If the workbook is BM2-specific or lacks those lines, import the correct governed PSI-02 Line List rather than borrowing neighboring values. Finally <strong>Rebuild Preview</strong>. No automatic 120°C/pressure values are assigned.</div>
        <div style="margin-top:4px;overflow-wrap:anywhere;"><strong>Missing line keys (${missingLineKeys.length}):</strong> ${esc(missingLineKeys.join(', ') || '(source keys unavailable)')}</div>
        <button type="button" data-b313-open-linelist-source style="margin-top:7px;padding:5px 9px;border:1px solid #c2410c;border-radius:5px;background:#fff;color:#7c2d12;cursor:pointer;font-weight:700;">Open 1 Source &amp; Masters</button>
      </div>`
    : '';
  const rootCauseHtml = rootCauses.length ? `<div style="margin:8px 0;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:10px;background:#f8fafc;">
    <strong>${rootCauses.length} distinct blocking factor/identity groups</strong> (physical rows remain individually audited).
    ${rootCauses.slice(0,8).map(g=>`<div style="padding-top:4px;"><strong>${g.count} row(s)</strong> · ${esc(g.materialId)} · T1 ${esc(g.designTemperatureC)} °C · route ${esc(g.manufacturingRoute)} · ${esc(g.code)}<div style="color:#64748b;">${esc(g.cause)}</div></div>`).join('')}
    ${rootCauses.length>8?`<div>… and ${rootCauses.length-8} more groups (see full rows below)</div>`:''}
  </div>` : '';
  const warning = !summary.hasInput
    ? '<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-size:11px;font-weight:700;">No Preview branch rows were available to evaluate. No wall-thickness change was made.</div>'
    : summary.summaryMismatch
      ? '<div style="margin-top:8px;padding:7px 10px;border-radius:6px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:10px;">Audit counters were recomputed from row evidence because the supplied summary was stale or inconsistent.</div>'
      : '';
  const border = summary.allUpdated ? '#86efac' : '#f59e0b';
  const countsLabel = summary.calculatedRows > 0
    ? `Calculated ${summary.calculatedRows} · Awaiting Pull · Held ${summary.notUpdatedRows}`
    : !summary.hasInput || summary.updatedRows > 0
      ? `Updated ${summary.updatedRows} · Not updated ${summary.notUpdatedRows}`
      : `Eligible proposals 0 · Held ${summary.notUpdatedRows}`;
  const titleColor = summary.allUpdated ? '#166534' : '#92400e';
  const tableRows = rows.map((row) => ['UPDATED', 'CALCULATED'].includes(row.status) ? updatedRowHtml(row) : failedRowHtml(row)).join('');
  const emptyRows = rows.length ? '' : '<tr><td colspan="6" style="padding:12px;text-align:center;color:#64748b;">No row-level audit evidence available.</td></tr>';

  return `<details data-mc-b313-report open style="margin:10px 0;border:1px solid ${border};border-radius:8px;background:#ffffff;padding:10px;box-shadow:0 1px 2px rgba(15,23,42,.06);">
    <summary style="cursor:pointer;font-weight:800;color:${titleColor};">B31.3 wall update audit · Evaluated ${summary.evaluatedRows} · ${countsLabel}</summary>
    <div style="font-size:11px;font-weight:700;color:#334155;margin-top:7px;">Calculation inputs: effective 4 Preview rows only · Material / T1 / P1 / pressure unit / DN / CA · Raw XML values are not used.</div>
    <div style="font-size:11px;color:#475569;margin:8px 0;">Line-list and Piping Class data may resolve the governed material identity. They do not invent numeric S/E/W/Y. Automatic factors must still come from strict VERIFIED / PROJECT_APPROVED B31.3 factor records at the row T1 and, where applicable, the manufacturing route. Factor lookups from the existing screening master are shown below as numerical references (including temperature interpolation). These results are <strong>not approved for Pull</strong>. Only qualified B31.3 S/E/W/Y or explicitly reviewed controlled manual factors can produce eligible Pull proposals.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 6px;">
      <span style="padding:4px 8px;border-radius:6px;background:#f1f5f9;color:#334155;font-size:10px;"><strong>Code basis</strong> ASME B31.3-2024 §304.1.2 Eq. (3a)</span>
      <span style="padding:4px 8px;border-radius:6px;background:#ecfdf5;color:#166534;font-size:10px;"><strong>Primary factors</strong> Preview Material → B31.3 identity → qualified stress S + governed E/W/Y sources at T1</span>
      <span style="padding:4px 8px;border-radius:6px;background:#fffbeb;color:#92400e;font-size:10px;"><strong>Fallback</strong> manual S/E/W/Y only when active master is incomplete; controlled source required</span>
      <span style="padding:4px 8px;border-radius:6px;background:#f8fafc;color:#475569;font-size:10px;"><strong>Excluded</strong> BENCHMARK_ONLY / SCREENING factors from Pull; shown as reference only</span>
      <span style="padding:4px 8px;border-radius:6px;background:#f8fafc;color:#475569;font-size:10px;"><strong>Mill tolerance</strong> ${esc(text(rows.find((row) => row.result?.calculation?.manufacturingTolerance)?.result?.calculation?.manufacturingTolerance?.inputValue ?? 12.5))}${rows.some((row) => row.result?.calculation?.manufacturingTolerance?.basis === 'absolute') ? ' mm absolute' : '% negative'}</span>
    </div>
    <div style="margin:9px 0;display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" data-b313-evidence-download="csv" style="padding:6px 10px;border:1px solid #94a3b8;border-radius:5px;">Download source → wall CSV (${rows.length} rows)</button>
      <button type="button" data-b313-evidence-download="json" style="padding:6px 10px;border:1px solid #94a3b8;border-radius:5px;">Download JSON evidence</button>
      <span style="font-size:10px;color:#475569;">Screening references and physical source HOLDs are separate from approved Pull.</span>
    </div>
    ${warning}
    ${sourceCoverageHtml}
    ${rootCauseHtml}
    <div style="overflow:auto;max-height:380px;margin-top:8px;border:1px solid #e2e8f0;border-radius:6px;">
      <table style="border-collapse:collapse;width:100%;font-size:11px;min-width:1120px;">
        <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;"><tr>
          <th style="text-align:left;padding:7px 10px;">Branch / Line</th>
          <th style="text-align:left;padding:7px 10px;">Material / T1</th>
          <th style="text-align:left;padding:7px 10px;">Factor authority / S-E-W-Y</th>
          <th style="text-align:left;padding:7px 10px;">Wall calculation / selection</th>
          <th style="text-align:left;padding:7px 10px;">Calculated required (mm)</th>
          <th style="text-align:left;padding:7px 10px;">Status</th>
        </tr></thead>
        <tbody>${tableRows}${emptyRows}</tbody>
      </table>
    </div>
  </details>`;
}

function zeroInputReport() {
  return {
    schema: B313_PREVIEW_REPORT_SCHEMA,
    action: B313_PREVIEW_ACTION_LABEL,
    authority: 'EXPLICIT_PREVIEW_ACTION_NOT_AUTOMATIC_WALL_AUTHORITY',
    summary: { inputRows: 0, updatedRows: 0, skippedRows: 0 },
    rows: [],
    diagnostics: [{
      code: 'B313_PREVIEW_ROWS_UNAVAILABLE',
      message: 'No Preview branch rows were available when the explicit wall update was requested.',
    }],
  };
}

function bindSourceNavigation(host) {
  const button = host?.querySelector?.('[data-b313-open-linelist-source]');
  button?.addEventListener?.('click', () => {
    // Navigate to existing source/master controls; never select a worksheet,
    // import a workbook or approve a temperature on the user's behalf.
    const sourcePhase = document.querySelector('[data-phase="source"]');
    sourcePhase?.click?.();
  });
}


function bindB313EvidenceDownload(host, report) {
  for(const button of host?.querySelectorAll?.('[data-b313-evidence-download]')||[]) {
    if(button.dataset.b313ExportBound==='true')continue;
    button.dataset.b313ExportBound='true';
    button.addEventListener('click',()=>{
      const ledger=buildPreviewB313SourceToWallLedger(report);
      const mode=button.dataset.b313EvidenceDownload;
      const isCsv=mode==='csv';
      const payload=isCsv?previewB313LedgerCsv(ledger):JSON.stringify(ledger,null,2);
      const blob=new Blob([payload],{type:isCsv?'text/csv;charset=utf-8'
        :'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      anchor.href=url;
      anchor.download='GLRD-4Preview-B313-Source-to-Wall.'+(isCsv?'csv':'json');
      anchor.style.display='none';
      document.body.appendChild(anchor);
      try {anchor.click();} finally {
        anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    });
  }
}


/**
 * Put the calculated B31.3 required nominal wall directly beside the
 * existing editable Wall Thk cell in 4 Preview, not in an approval dialog.
 * This is display-only; no row override, Pull proposal or source mutation.
 */
export function renderPreviewB313CalculatedWallCells(host,report={}) {
  const rows=normalizeRows(report?.rows);
  const physical=host?.querySelectorAll?.(
    'table[data-resizable-table="branch-preview"] tbody tr.mc-preview-row'
  )||[];
  let calculated=0,assumedUnits=0;
  for(let i=0;i<physical.length;i++){
    const cell=physical[i].querySelector?.('[data-mc-b313-calculated-row]');
    if(!cell) continue;
    const value=cell.querySelector?.('[data-mc-b313-calculated-value]');
    const detail=cell.querySelector?.('[data-mc-b313-calculated-detail]');
    const result=rows[i]?.calculatedWallDisplay;
    if(!result?.ok){
      const hypothetical=result?.hypotheticalScenario?.ok===true
        ?result.hypotheticalScenario:null;
      if(hypothetical){
        if(value)value.textContent=Number(hypothetical.requiredNominalThicknessMm).toFixed(3);
        if(detail)detail.textContent='HYPOTHETICAL kPa(g) ONLY · source P1 unit UNKNOWN · governing wall HELD';
        cell.title=[
          'HYPOTHETICAL, NOT ENGINEERING DESIGN / NO Pull',
          'Assume P1 '+hypothetical.pressure+' kPa(g) with UNVERIFIED unit',
          'Required nominal '+Number(hypothetical.requiredNominalThicknessMm).toFixed(4)+' mm',
          'Pressure-design t '+Number(hypothetical.pressureDesignThicknessMm).toFixed(4)+' mm',
          'S '+hypothetical.factors.S_MPa+' MPa · E '+hypothetical.factors.E+
          ' · W '+hypothetical.factors.W+' · Y '+hypothetical.factors.Y,
          'OD '+hypothetical.outsideDiameterMm+' mm · '+hypothetical.outsideDiameterSource,
          'Source P1 unit still unresolved; no basis, Pull, Wall Thk or CII changes',
        ].join('\n');
        cell.dataset.mcB313CalculatedStatus='HYPOTHETICAL_KPA_UNIT_UNKNOWN';
      }else{
        if(value)value.textContent='—';
        if(detail)detail.textContent=result?.reason||'Input incomplete';
        cell.title=result?.reason||'Calculate B31.3 to see result';
        cell.dataset.mcB313CalculatedStatus='INPUT_REQUIRED';
      }
      continue;
    }
    calculated++;
    if(result.pressureUnitAssumed)assumedUnits++;
    if(value)value.textContent=Number(result.requiredNominalThicknessMm).toFixed(3);
    if(detail)detail.textContent=result.pressureUnitAssumed
      ?'Common fallback '+result.pressureUnit+' · WHAT-IF only'
      :'P unit '+result.pressureUnit+' · t '+Number(result.pressureDesignThicknessMm).toFixed(3);
    const bracket=Array.isArray(result.interpolationBracket)
      ? result.interpolationBracket.map(x=>x.temperatureC+'°C='+x.Sksi+' ksi').join(' → '):'';
    cell.title=[
      'Calculated B31.3 required nominal: '+Number(result.requiredNominalThicknessMm).toFixed(4)+' mm',
      'Pressure-design wall t: '+Number(result.pressureDesignThicknessMm).toFixed(4)+' mm',
      'P1: '+result.pressure+' '+result.pressureUnit
        +(result.hypotheticalKpa?' (HYPOTHETICAL kPa(g) ONLY; SOURCE UNIT UNKNOWN; NO Pull)'
          :result.pressureUnitAssumed?' (WHAT-IF: selected common fallback, NOT SOURCE VERIFIED)':''),
      'P1 unit evidence: '+(result.pressureUnitSource||'unresolved'),
      'T1: '+result.temperatureC+'°C',
      'S '+result.factors.S_MPa+' MPa · E '+result.factors.E
        +' · W '+result.factors.W+' · Y '+result.factors.Y,
      'S lookup: '+result.stressLookupMethod+' '+bracket,
      'OD: '+result.outsideDiameterMm+' mm ('+result.outsideDiameterSource+')',
      'CA: '+result.corrosionAllowanceMm+' mm',
      'Class wall: '+result.classNominalWallMm+' mm · class pass: '+result.classPass,
      'Evidence: '+result.factorBasisId+' · '+result.factorSourceReference,
      'Edition/source qualification: '+result.factorCodeEditionBasis,
      'Independent calculation: NOT a saved Wall Thk or approved Pull',
    ].join('\\n');
    cell.dataset.mcB313CalculatedStatus=result.hypotheticalKpa?'HYPOTHETICAL_KPA_UNIT_UNKNOWN'
      :result.pressureUnitAssumed?'WHAT_IF_P_UNIT':'CALCULATED';
  }
  renderPreviewB36SelectedThicknessCells(host,report);
  return {physicalRows:physical.length,calculatedRows:calculated,assumedPressureUnitRows:assumedUnits};
}



/**
 * Separate ASME B36.10M/B36.19M nominal selection; do not mask required
 * B31.3 thickness or convert hypothetical pressure into a code approval.
 */
export function renderPreviewB36SelectedThicknessCells(host,report={}){
  const rows=normalizeRows(report?.rows);
  const physical=host?.querySelectorAll?.(
    'table[data-resizable-table="branch-preview"] tbody tr.mc-preview-row')||[];
  let available=0;
  for(let i=0;i<physical.length;i++){
    const cell=physical[i].querySelector?.('[data-mc-b36-selected-row]');
    if(!cell)continue;
    // Strict governed B31.3 reports do not own this independent display.
    if(rows[i] && !Object.hasOwn(rows[i],'selectedWallDisplay'))continue;
    const result=rows[i]?.selectedWallDisplay;
    const value=cell.querySelector('[data-mc-b36-selected-value]');
    const detail=cell.querySelector('[data-mc-b36-selected-detail]');
    const button=cell.querySelector('[data-mc-b36-selected-pull-row]');
    if(!result?.ok){
      if(value)value.textContent='—';
      if(detail)detail.textContent=result?.message||'Required wall or B36 dimension evidence unavailable';
      if(button)button.disabled=true;
      cell.dataset.mcB36SelectedStatus='INPUT_REQUIRED';
      cell.title=result?.message||'Build Preview for B36 selection';
      continue;
    }
    available++;
    if(value)value.textContent=Number(result.selectedNominalWallMm).toFixed(3);
    if(detail)detail.textContent=result.selectedSchedule+' · '+result.dimensionStandard.replace('ASME ','')
      +(result.hypothetical?' · WHAT-IF':' · reference')
      +(result.selectionAuthority.startsWith('EXACT_DN')?' · class schedule':'');
    if(button){
      button.disabled=result.eligibleForManualPreviewPull!==true;
      button.title=result.eligibleForManualPreviewPull
        ?'Explicit MANUAL Preview wall override; B31.3 engineering approval not implied'
        :(result.manualPullReason||'Selected pipe wall cannot be manually pulled');
    }
    cell.dataset.mcB36SelectedStatus=result.hypothetical?'HYPOTHETICAL_SELECTION':'SELECTED';
    cell.title=[
      'ASME '+result.dimensionStandard.replace('ASME ','')+' selected nominal wall: '
        +Number(result.selectedNominalWallMm).toFixed(4)+' mm',
      'Selected schedule '+result.selectedSchedule,
      'B31.3 numerical required nominal '+Number(result.requiredNominalThicknessMm).toFixed(4)+' mm',
      'Margin '+Number(result.marginMm).toFixed(4)+' mm',
      'Minimum adequate B36 catalog '+result.catalogMinimumWallMm+' mm / '+result.catalogMinimumSchedule,
      'Authority '+result.selectionAuthority+'; '+(result.classProduct||'class product unavailable'),
      'Source '+(result.masterSourcePath||'pipe-wall-master'),
      result.hypothetical?'PRESSURE UNIT UNVERIFIED — HYPOTHETICAL KPA, NOT ENGINEERING DESIGN':
        'SCREENING VALUES DO NOT CERTIFY B31.3 DESIGN',
      'Pull selected is a separate manual Preview override; governed B31.3 Pull unchanged',
    ].join('\n');
  }
  return {physicalRows:physical.length,selectedRows:available};
}

/**
 * Build numerical required-wall values from the already-effective 4 Preview,
 * WITHOUT running the strict Pull workflow, saving configuration, or reading
 * XML / earlier Line List values. Result is solely for the new table column.
 */
export function buildPreviewB313AutomaticWallColumnReport({rows=[],config={},host}={}) {
  const branchRows=normalizeRows(rows);
  const previewNodeRows=Array.isArray(host?.__xmlCiiPreviewResult?.nodeBoreWallRows)
    ?host.__xmlCiiPreviewResult.nodeBoreWallRows:[];
  return {
    schema:'b313-preview-display-only/v1',
    calculationInputAuthority:'EFFECTIVE_4_PREVIEW_ONLY',
    rows:branchRows.map((row,rowIndex)=>{
      const calculatedWallDisplay=buildPreviewB313CalculatedWallDisplay({
        row,config,previewNodeRows,rowIndex,
      });
      return {
        branchName:text(row.branchName),
        lineKey:text(row.lineKey),
        calculatedWallDisplay,
        selectedWallDisplay:buildPreviewB36SelectedThickness({
          row,config,previewNodeRows,rowIndex,calculatedWallDisplay,
        }),
      };
    }),
  };
}

function clearAutomaticCalculatedWalls(host) {
  for(const selected of host?.querySelectorAll?.('[data-mc-b36-selected-row]')||[]){
    const value=selected.querySelector('[data-mc-b36-selected-value]');
    const detail=selected.querySelector('[data-mc-b36-selected-detail]');
    const button=selected.querySelector('[data-mc-b36-selected-pull-row]');
    if(value)value.textContent='—';
    if(detail)detail.textContent='Rebuild Preview';
    if(button)button.disabled=true;
    selected.dataset.mcB36SelectedStatus='PREVIEW_DIRTY';
    selected.title='Effective Preview edits require explicit Rebuild before B36 wall selection/Pull.';
  }
  for(const cell of host?.querySelectorAll?.('[data-mc-b313-calculated-row]')||[]){
    const value=cell.querySelector('[data-mc-b313-calculated-value]');
    const detail=cell.querySelector('[data-mc-b313-calculated-detail]');
    if(value && value.textContent!=='—')value.textContent='—';
    if(detail && detail.textContent!=='Rebuild Preview')detail.textContent='Rebuild Preview';
    if(cell.dataset.mcB313CalculatedStatus!=='PREVIEW_DIRTY')
      cell.dataset.mcB313CalculatedStatus='PREVIEW_DIRTY';
    cell.title='Effective 4 Preview edited; rebuild before recalculating.';
  }
}

function renderReport(host, report) {
  renderPreviewB313CalculatedWallCells(host,report);
  host?.querySelector?.('[data-mc-b313-report]')?.remove?.();
  const sharedSlot = host?.querySelector?.('[data-mc-b313-unified-audit-slot]');
  if (sharedSlot) {
    sharedSlot.innerHTML = renderPreviewB313WallAuditHtml(report);
    bindSourceNavigation(host);
    bindPreviewB313ConditionalManufacturing(host);
    bindB313EvidenceDownload(host, report);
    return;
  }
  const editor = host?.querySelector?.('[data-mc-b313-basis-editor]');
  if (editor) {
    editor.insertAdjacentHTML('afterend', renderPreviewB313WallAuditHtml(report));
    bindSourceNavigation(host);
    bindPreviewB313ConditionalManufacturing(host);
    bindB313EvidenceDownload(host, report);
    return;
  }
  const actionBar = host?.querySelector?.('[data-mc-preview-build]')?.parentElement;
  actionBar?.parentElement?.insertAdjacentHTML?.('afterend', renderPreviewB313WallAuditHtml(report));
  bindSourceNavigation(host);
    bindPreviewB313ConditionalManufacturing(host);
    bindB313EvidenceDownload(host, report);
}

function bindAuditButton(host, config, xmlText, options, getSnapshotRows, getLiveRows) {
  const button = host?.querySelector?.('[data-mc-b313-wall-update]');
  if (!button || button.dataset.mcB313AuditV2Bound === 'true') return;
  button.dataset.mcB313AuditV2Bound = 'true';
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    const liveRows = normalizeRows(getLiveRows?.());
    const rows = selectPreviewB313AuditRows(getSnapshotRows(), liveRows);
    try {
      const report = rows.length
        ? buildPreviewB313WallUpdateReport({ rows, config, host })
        : zeroInputReport();
      await options?.onSaveConfig?.(config);
      await options?.onB313WallUpdateReport?.(report);
      renderReport(host, report);
    } catch (error) {
      const inputRows = rows.length;
      const report = {
        schema: B313_PREVIEW_REPORT_SCHEMA,
        action: B313_PREVIEW_ACTION_LABEL,
        authority: 'EXPLICIT_PREVIEW_ACTION_NOT_AUTOMATIC_WALL_AUTHORITY',
        summary: { inputRows, updatedRows: 0, skippedRows: inputRows },
        rows: [{
          branchName: '',
          lineKey: '',
          status: 'NOT_UPDATED',
          code: 'B313_PREVIEW_ACTION_EXCEPTION',
          message: text(error?.message || error),
        }],
      };
      await options?.onB313WallUpdateReport?.(report);
      renderReport(host, report);
    } finally {
      button.disabled = false;
    }
  }, { capture: true });
}

export function installPreviewB313WallUpdateAuditController({ host, config, xmlText, rows = [], options = {} } = {}) {
  if (!host || !config) return;
  const suppliedRows = snapshotRows(rows);
  installPreviewB313WallUpdateController({ host, config, xmlText, rows: suppliedRows, options });

  host.__xmlCiiB313WallAuditObserver?.disconnect?.();
  let retainedRows = snapshotRows(currentPreviewRows(host, suppliedRows));
  const getLiveRows = () => currentPreviewRows(host, suppliedRows);
  // Cheap fingerprint prevents observer feedback from our own table text
  // writes. Every rebuilt Preview row/source, selected B31.3 P unit, and
  // mill tolerance is included; auto display never invokes the Pull action.
  let lastAutoSignature='';
  const refresh = () => {
    const liveRows = getLiveRows();
    if (liveRows.length) retainedRows = snapshotRows(liveRows);
    bindAuditButton(host, config, xmlText, options, () => retainedRows, getLiveRows);
    const table=host.querySelector?.('table[data-resizable-table="branch-preview"]');
    const cells=table?.querySelectorAll?.('[data-mc-b313-calculated-row]')||[];
    if(!cells.length)return;
    if(host.dataset.mcB313PreviewDirty==='true'){
      lastAutoSignature='';
      clearAutomaticCalculatedWalls(host);
      return;
    }
    // Do not populate pre-build or stale partially rendered physical rows.
    const current=Array.isArray(host.__xmlCiiPreviewResult?.branchRows)
      ?host.__xmlCiiPreviewResult.branchRows:liveRows;
    if(!current.length || current.length!==cells.length)return;
    const signature=JSON.stringify({
      preview:current.map(row=>[
        row.branchName,row.lineKey,row.material,row.materialSource,
        row.t1,row.t1Source,row.p1,row.p1Source,row.p1Unit,row.p1UnitSource,
        row.sizeMm,row.boreMm,row.corrosion,
        row.pipingClass,row.pipingClassPipeDnMm,row.pipingClassPipeWallMm,
        row.pipingClassPipeSourceRow,row.pipingClassPipeSchedule,row.pipingClassPipeMaterial,
      ]),
      nodeRows:host.__xmlCiiPreviewResult?.nodeBoreWallRows?.length||0,
      bases:config?.b313WallUpdate?.bases||{},
      commonPressureUnitFallback:config?.b313WallUpdate?.commonPressureUnitFallback||'AUTO',
      tolerance:config?.b313WallUpdate?.millTolerance||{},
    });
    if(lastAutoSignature===signature
      && [...cells].every(cell=>cell.dataset.mcB313CalculatedStatus)
      && [...(table?.querySelectorAll('[data-mc-b36-selected-row]')||[])]
         .every(cell=>cell.dataset.mcB36SelectedStatus))return;
    lastAutoSignature=signature;
    const report=buildPreviewB313AutomaticWallColumnReport({rows:current,config,host});
    renderPreviewB313CalculatedWallCells(host,report);
  };
  refresh();
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(refresh);
    observer.observe(host, {
      childList:true,subtree:true,attributes:true,
      attributeFilter:['data-mc-b313-preview-dirty'],
    });
    host.__xmlCiiB313WallAuditObserver = observer;
  }
}
