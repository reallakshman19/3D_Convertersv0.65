import {normalizePreviewInsulationThickness,normalizePreviewInsulationType} from '../../../converters/xml-cii2019-core/preview-insulation.js';
import {runPreviewButtonSession} from './xml-cii-adapted-preview-facts-button-session.js';
import { b313PullProposal } from '../../../converters/xml-cii2019-core/b313-preview-pull-authority.js';
import { XmlCiiAdaptedEditablePreviewTable } from './xml-cii-adapted-editable-preview-table.js';
import { renderBranchLineMapPanel } from './xml-cii-adapted-branch-line-map-panel.js';
import { _xmlCiiLineListKeys } from './xml-cii-adapted-preview-diagnostics-audit.js?v=20261001-weight-output-2';
import { applyAdaptedPreviewOverrideFillDown, applyAdaptedPreviewProcessFillDown, markAdaptedPreviewOverrideManual, markAdaptedPreviewProcessManual, applyAdaptedPreviewSmartFillByClass, applyAdaptedPreviewSmartProcessFillByClass } from './xml-cii-adapted-preview-filldown.js';
import { replaceJsonObject, runAtomicPreviewClassTransaction } from './xml-cii-adapted-preview-class-transaction.js';
import {
  _toText,
  _esc,
  _ratingKeys,
  _bucketText,
  _classSizeKey,
  _classKey,
  _uniqueKeys,
  _hasOwn,
  xmlCiiDryRunPreview
} from './xml-cii-adapted-preview-dryrun.js?v=20261116-b313-pull-v065';

const PV_CACHE_KEY = 'xml-cii-pv-cache-v9-class-insulation';
const _PV_CACHE_MAX_BYTES = 2500000;

function pvCacheFingerprint(xmlText, cfg) {
  const xmlSig = `${(xmlText || '').length}:${(xmlText || '').slice(0, 80)}`;
  const llSig = cfg?.linelist?.masterRows?.length || 0;
  const pcSig = cfg?.pipingClass?.masterRows?.length || 0;
  const fieldMapSig = JSON.stringify(cfg?.linelist?.fieldMap || {});
  const defaultSig = JSON.stringify(cfg?.processDefaults || {}).slice(0, 120);
  const overrideSig = JSON.stringify(cfg?.overrides || {});
  const b313Sig = JSON.stringify(cfg?.b313WallUpdate || {});
  // Saved Format 1/2 click order and joiners change source identity.
  // Never reuse a Preview from a prior regex configuration.
  const regexSig = JSON.stringify(cfg?.regexTester?.formats ?? cfg?.formats ?? []);
  return `pv7|${xmlSig}|${llSig}:${pcSig}|${fieldMapSig}|${defaultSig}|${overrideSig}|${b313Sig}|${regexSig}`;
}

function readCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeCache(key, fp, data) {
  try {
    const payload = JSON.stringify({ fp, data, ts: Date.now() });
    if (payload.length <= _PV_CACHE_MAX_BYTES) localStorage.setItem(key, payload);
  } catch {}
}

/** Display-only candidates are joined by source branch occurrence, never name alone. */
export function xml229PreviewLineKeyCandidateRows(rows = [], passes = []) {
  return rows.map((row, occurrenceIndex) => {
    if (row?.extractionStatus !== 'AMBIGUOUS') return { ...row };
    const choices = passes.flatMap(pass => {
      const candidate = pass?.branchRows?.[occurrenceIndex];
      if (!candidate || candidate.branchName !== row.branchName ||
          candidate.extractionStatus !== 'MATCHED' || !String(candidate.lineKey || '').trim()) return [];
      return [{ formatIndex: pass.formatIndex, lineKey: candidate.lineKey }];
    });
    return { ...row, formatLineKeyCandidates: choices };
  });
}

function publishPreviewResult(host, branchRows = [], nodeRows = [], formatPreviewPasses = [], nodeBoreWallRows = []) {
  const result = {
    branchRows: Array.isArray(branchRows) ? branchRows : [],
    nodeRows: Array.isArray(nodeRows) ? nodeRows : [],
    nodeBoreWallRows: Array.isArray(nodeBoreWallRows) ? nodeBoreWallRows : [],
    formatPreviewPasses: Array.isArray(formatPreviewPasses) ? formatPreviewPasses : [],
  };
  if (host) { host.__xmlCiiPreviewResult = result; host.dataset.mcB313PreviewDirty = 'false'; }
  return result;
}

function _overrideSource(overrides, bucket, key) {
  return _hasOwn(overrides?.[bucket], key) ? 'override' : 'auto';
}

function _isDefaultSource(source) {
  return source === 'default' || source === 'config-default' || source === 'default-zero';
}

function _percentText(confidence) {
  const numeric = Number(confidence);
  return Number.isFinite(numeric) ? `${Math.max(0, Math.min(100, Math.round(numeric * 100)))}%` : '';
}

function _setProcessDataField(overrides, key, field, value) {
  if (!key) return;
  if (!overrides.processData || typeof overrides.processData !== 'object' || Array.isArray(overrides.processData)) overrides.processData = {};
  overrides.processData[key] = overrides.processData[key] && typeof overrides.processData[key] === 'object' && !Array.isArray(overrides.processData[key]) ? { ...overrides.processData[key] } : {};
  overrides.processData[key][field] = value;
}

function _fieldOverrideKey(editType, derivedKey) {
  return _toText(derivedKey).trim();
}

function _savePreviewOverride({ config, ensureOverrides, editType, row, derivedKey, value }) {
  const overrides = ensureOverrides(config);
  const cleanValue = _toText(value).trim();
  if (editType === 'rating') {
    const keys = _ratingKeys(row, derivedKey);
    overrides.rating = overrides.rating && typeof overrides.rating === 'object' && !Array.isArray(overrides.rating) ? { ...overrides.rating } : {};
    for (const key of keys) overrides.rating[key] = cleanValue;
    for (const key of _uniqueKeys([row?.lineKey, row?.branchName])) _setProcessDataField(overrides, key, 'rating', cleanValue);
    return keys[0] || derivedKey || row?.lineKey || row?.branchName || '';
  }
  if (!overrides[editType] || typeof overrides[editType] !== 'object') overrides[editType] = {};
  const key = _fieldOverrideKey(editType, derivedKey) || row?.lineKey || row?.branchName || '';
  if (key) overrides[editType] = { ...overrides[editType], [key]: cleanValue };
  return key;
}

function _useParsedCustomInputSource(config) {
  return config?.useJsonTraceStagedSource === true || config?.useParsedCustomInputSource === true || config?.useParsedCustomInputSourceForPreview === true;
}

function _manualPreviewActionHtml(label = 'Build Preview', includeDtxrWall = false, config = {}) {
  return `<div class="model-converters-workflow-master-card mc-preview-manual-card" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;"><div class="model-converters-workflow-detail-text" style="margin:0;">Preview is manual to protect saved overrides. Edit Regex/Masters freely, then click Build Preview.</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><label class="xml-cii-native-check" title="Use the imported JSON Trace staged source instead of the sidebar staged JSON when available." style="margin:0;"><input type="checkbox" data-mc-use-parsed-custom-source ${_useParsedCustomInputSource(config)?'checked':''}> Use JSON Trace staged source</label><button type="button" class="model-converters-run-btn" data-mc-preview-build style="padding:8px 14px;min-width:140px;">${_esc(label)}</button></div></div>${includeDtxrWall ? "<details data-mc-wall-review open style=\"margin:8px 0;border:1px solid #64748b;border-radius:8px;padding:9px;background:#f8fafc;color:#0f172a;\"><summary style=\"cursor:pointer;font-weight:700;\">Wall Thickness Review — DTXR source / ASME B31.3 pressure design</summary><div style=\"font-size:11px;margin:5px 0 8px;\">One review workspace, two independent evidence paths. DTXR suggests source schedule walls; B31.3 calculates a code minimum and class-eligible proposal. Neither action silently replaces a saved wall: DTXR requires selected approval; B31.3 requires Pull.</div><div data-mc-wall-review-actions style=\"display:flex;gap:8px;flex-wrap:wrap;\"><button type=\"button\" class=\"model-converters-download-btn\" data-mc-dtxr-wall-update style=\"padding:8px 14px;\">Review DTXR wall candidates</button></div></details>" : ''}`;
}

function _bindParsedCustomSourceToggle(host, config, options = {}) {
  host?.querySelector('[data-mc-use-parsed-custom-source]')?.addEventListener('change', (event) => {
    const enabled = !!event.target.checked;
    config.useJsonTraceStagedSource = enabled;
    config.useParsedCustomInputSource = enabled;
    config.useParsedCustomInputSourceForPreview = enabled;
    options.onSaveConfig?.(config);
    _markPreviewSaved(host, enabled ? 'JSON Trace staged source enabled. Click Build/Rebuild Preview to recompute DTXR matches from traced JSON.' : 'JSON Trace staged source disabled. Click Build/Rebuild Preview to use sidebar staged JSON.');
  });
}

async function _resolvePreviewStagedJsonText(options = {}, config = {}) {
  if (typeof options.resolveStagedJsonText === 'function') {
    const resolved = await options.resolveStagedJsonText(config);
    if (resolved && typeof resolved === 'object') return { text: _toText(resolved.text ?? resolved.stagedJsonText), label: _toText(resolved.label || resolved.sourceLabel) };
    return { text: _toText(resolved), label: '' };
  }
  return { text: _toText(options.stagedJsonText), label: _toText(options.stagedSourceLabel) };
}

function _bindManualPreviewButton(host, rootEl, xmlText, config, options, label = 'Building preview...') {
  host?.querySelectorAll('[data-mc-preview-build]').forEach((button) => {
    button.addEventListener('click', () => {
      // Actual Build/Rebuild button: Worker-backed, awaited and classified.
      // The existing editable table is still rendered from existing authority.
      void runPreviewButtonSession({
        host, rootEl, xmlText, config, options,
        renderResult: (result, staged) => xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, {
          ...options, forceBuild: true, skipLegacyCache: true,
          precomputedPreview: result, precomputedStagedSource: staged,
        }),
      }).catch((error) => {
        host.innerHTML = `<div role="alert" class="model-converters-workflow-detail-note">Preview session failed: ${_esc(error?.message || error)}</div>`;
      });
    });
  });
}

/**
 * Programmatic rebuilds must share the same Worker, InputBasis and stale-job
 * fences as the actual Build Preview button. Unlike a button click, callers
 * such as atomic class transactions need a rejection on failure in order to
 * roll back their saved authority instead of claiming success.
 */
export async function xmlCiiRebuildPreviewThroughWorker(rootEl, xmlText, config, options = {}) {
  const host = rootEl?.querySelector('#mc-preview-table-host');
  if (!host) throw Object.assign(new Error('Preview host is unavailable'),
    { code: 'PREVIEW_HOST_UNAVAILABLE' });
  const rendered = await runPreviewButtonSession({
    host, rootEl, xmlText, config, options,
    renderResult: (result, staged) => xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, {
      ...options, forceBuild: true, skipLegacyCache: true,
      precomputedPreview: result, precomputedStagedSource: staged,
    }),
  });
  if (!rendered) {
    throw Object.assign(new Error('Worker Preview did not complete; the update must not be accepted'),
      { code: 'PREVIEW_REBUILD_INCOMPLETE' });
  }
  return rendered;
}

function _renderManualPreviewIdle(host, rootEl, xmlText, config, options) {
  if (!host) return;
  host.innerHTML = `${_manualPreviewActionHtml('Build Preview', false, config)}<div class="model-converters-workflow-detail-note" style="text-align:center;padding:18px;">Preview has not been built for this visit. Click <strong>Build Preview</strong> when ready.</div>`;
  _bindManualPreviewButton(host, rootEl, xmlText, config, options);
  _bindParsedCustomSourceToggle(host, config, options);
}

/**
 * User-facing stale Preview notice. Saving a master/override does not trigger
 * a new Worker build. The existing Build/Rebuild Preview button is the only
 * operation that starts the ordinary Preview rebuild.
 */
export function suggestManualPreviewRebuild(host, detail = 'Inputs were saved.') {
  if (!host) return;
  host.dataset.mcB313PreviewDirty='true';
  host.dataset.mcPreviewNeedsRebuild='true';
  const message='Preview needs rebuilding — '+_toText(detail)+
    ' Displayed Preview values remain from the previous build. Select Rebuild Preview to apply changes.';
  let note=host.querySelector?.('[data-mc-preview-save-note]');
  if (!note) {
    note=host.ownerDocument?.createElement?.('div');
    if (!note) return;
    note.dataset.mcPreviewSaveNote='true';
    note.className='model-converters-workflow-detail-note';
    note.style.cssText='margin:0 0 8px;border:1px solid #d97706;color:#92400e;background:#fffbeb;padding:9px;border-radius:6px;';
    host.prepend(note);
  }
  note.setAttribute('role','status');
  note.setAttribute('aria-live','polite');
  note.textContent=message;
}

function _markPreviewSaved(host, message = 'Saved. Click Rebuild Preview when you want to recompute suggestions.') {
  if (/rebuild preview|rebuild required/i.test(message)) {
    suggestManualPreviewRebuild(host,message);
    return;
  }
  const existing = host?.querySelector('[data-mc-preview-save-note]');
  if (existing) {
    existing.textContent = message;
    return;
  }
  host?.insertAdjacentHTML('afterbegin', `<div data-mc-preview-save-note class="model-converters-workflow-detail-note" style="margin:0 0 8px;border-color:#2f855a;color:#14532d;background:#f0fff4;">${_esc(message)}</div>`);
}

function _updateEditedPreviewCell(td, newVal) {
  const val = _toText(newVal).trim() || '—';
  const span = td?.querySelector?.('.mc-preview-editable-val');
  if (span) span.textContent = val;
}

function _renderClassTransactionStatus(host, value) {
  if (!host) return;
  host.innerHTML = `<div class="model-converters-workflow-detail-note" style="text-align:center;padding:18px;border-color:#2b6cb0;color:#1e3a8a;background:#eff6ff;">Resolving Piping Class <strong>${_esc(value)}</strong>, loading exact authority if needed, and recomputing dependent fields…</div>`;
}

async function _hydrateEffectiveClassConfig(config, xmlText) {
  const { hydrateXmlCiiEffectivePipingClassShards } = await import('../../xml-cii-effective-class-shard-hydrator.js');
  const configInput = {
    value: JSON.stringify(config),
    dispatchEvent() {},
  };
  const result = await hydrateXmlCiiEffectivePipingClassShards({
    input: configInput,
    xmlText,
    force: true,
  });
  const hydratedConfig = JSON.parse(configInput.value || '{}');
  replaceJsonObject(config, hydratedConfig);
  return result;
}

function _classTransactionSuccessMessage(hydrationResult, value) {
  const unmatched = Array.isArray(hydrationResult?.unmatched)
    ? hydrationResult.unmatched.map((item) => _toText(item?.value || item?.normalized || item).trim()).filter(Boolean)
    : [];
  if (unmatched.length) {
    return `Piping Class ${value} saved and the full Preview row was recomputed. No exact shard exists for ${unmatched.join(', ')}; dependent fields remain review-required.`;
  }
  const loaded = Array.isArray(hydrationResult?.loadedClasses) ? hydrationResult.loadedClasses.filter(Boolean) : [];
  return loaded.length
    ? `Piping Class ${value} saved. Loaded ${loaded.join(', ')} and atomically recomputed Rating, material, wall, corrosion, and Weight Match.`
    : `Piping Class ${value} saved and atomically recomputed Rating, material, wall, corrosion, and Weight Match.`;
}

import {
  _dtxrWallCandidateForRow,
  _dtxrWallCandidateIndex
} from './xml-cii-adapted-preview-dryrun.js?v=20261001-weight-output-2';
import { buildDtxrWallReview, validateDtxrWallSelection } from './xml-cii-adapted-preview-dtxr-wall-review.js';

function _bindDtxrWallUpdateButtonBranchScoped({ host, branchRows, config, ensureOverrides, onSaveConfig, stagedSourceLabel = '' }) {
  const action = host?.querySelector('[data-mc-dtxr-wall-update]');
  if (!action) return;
  const review = () => {
    const currentRows = Array.isArray(host.__xmlCiiPreviewResult?.branchRows)
      ? host.__xmlCiiPreviewResult.branchRows : branchRows;
    const proposals = buildDtxrWallReview({
      rows: currentRows,
      existingWalls: config?.overrides?.wallThickness || {},
      acceptedWallByBranch: config?.b313WallUpdate?.acceptedWallByBranch || {},
      candidateIndex: _dtxrWallCandidateIndex,
      candidateForRow: _dtxrWallCandidateForRow,
      keyForRow: row => row.wallThicknessKey || _classSizeKey(row) || row.lineKey || row.branchName,
    });
    let slot = host.querySelector('[data-mc-dtxr-unified-review-slot]');
    if (!slot) {
      slot = document.createElement('section');
      slot.dataset.mcDtxrUnifiedReviewSlot = 'true';
      (host.querySelector('[data-mc-wall-review]') || action.parentElement).appendChild(slot);
    }
    const rowsHtml = proposals.items.map((item, idx) => {
      const blocked = !item.eligible;
      const existing = item.existingValue === '' ? '—' : item.existingValue;
      return `<tr data-mc-dtxr-plan-row="${idx}"><td style="padding:4px;"><input type="checkbox" data-mc-dtxr-review-select="${idx}" ${blocked?'disabled':''} aria-label="Approve DTXR candidate for physical key ${_esc(item.key)}"></td>
        <td style="padding:4px;">${_esc(item.branchNames.join(' / '))}</td>
        <td style="padding:4px;">${_esc(item.key)}</td><td style="padding:4px;">${_esc(existing)}</td>
        <td style="padding:4px;">${_esc(item.value)} mm · ${_esc(item.schedule || 'schedule unknown')}</td>
        <td style="padding:4px;">${_esc(item.status)}</td></tr>`;
    }).join('');
    slot.innerHTML = `<section data-mc-dtxr-review-results style="margin:9px 0;padding:9px;border:1px solid #94a3b8;border-radius:6px;background:#fff;color:#0f172a;">
      <strong>DTXR source-wall candidates — review before applying</strong>
      <div style="font-size:11px;margin:5px 0;">${proposals.inputRows} physical rows · ${proposals.matchedRows} schedule matches · ${proposals.items.length} unique override keys · ${proposals.eligibleKeys} eligible to review. ${_esc(stagedSourceLabel)}. Existing overrides are never selected automatically. Accepted B31.3 walls and conflicting shared keys are blocked.</div>
      <div style="overflow:auto;max-height:350px"><table style="font-size:11px;width:100%;border-collapse:collapse"><thead><tr><th>Approve</th><th>Branch</th><th>Override key</th><th>Existing wall</th><th>DTXR source proposal</th><th>Review status</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="6">No source-matched DTXR schedule candidates.</td></tr>'}</tbody></table></div>
      <button type="button" data-mc-dtxr-apply-selected class="model-converters-run-btn" style="margin-top:7px;padding:7px 12px;">Apply selected DTXR overrides</button>
      <div data-mc-dtxr-review-feedback role="status" style="font-size:11px;margin-top:4px;">Only checked physical-key proposals will be committed. Rebuild Preview afterward.</div>
    </section>`;
    slot.querySelector('[data-mc-dtxr-apply-selected]')?.addEventListener('click', () => {
      const selected = [...slot.querySelectorAll('[data-mc-dtxr-review-select]:checked')]
        .map(input => proposals.items[Number(input.dataset.mcDtxrReviewSelect)]?.key).filter(Boolean);
      if (!selected.length) {
        slot.querySelector('[data-mc-dtxr-review-feedback]').textContent = 'No DTXR proposal selected; saved walls unchanged.';
        return;
      }
      const outcome = validateDtxrWallSelection({
        review: proposals, selectedKeys: selected,
        currentWalls: config?.overrides?.wallThickness || {},
        acceptedWallByBranch: config?.b313WallUpdate?.acceptedWallByBranch || {},
      });
      if (!outcome.approved.length) {
        slot.querySelector('[data-mc-dtxr-review-feedback]').textContent = `No changes: ${outcome.skipped.length} selection(s) held by accepted-wall, source-conflict or stale-override guards.`;
        return;
      }
      const overrides = ensureOverrides(config);
      if (!overrides.wallThickness || typeof overrides.wallThickness !== 'object' || Array.isArray(overrides.wallThickness)) overrides.wallThickness = {};
      if (!overrides.__dtxrWallKeys || typeof overrides.__dtxrWallKeys !== 'object' || Array.isArray(overrides.__dtxrWallKeys)) overrides.__dtxrWallKeys = {};
      for (const item of outcome.approved) {
        overrides.wallThickness[item.key] = item.value;
        overrides.__dtxrWallKeys[item.key] = true;
        markAdaptedPreviewOverrideManual({ config, ensureOverrides, field: 'wallThickness', key: item.key, value: item.value });
        for (const ri of item.rowIndices) {
          const cell = host.querySelector(`[data-mc-edit-type="wallThickness"][data-mc-edit-row="${ri}"]`);
          _updateEditedPreviewCell(cell, item.value);
          if (!cell) continue;
          cell.dataset.mcFillState = 'manual';
          cell.title = `DTXR source schedule ${item.schedule}; explicitly approved in Wall Thickness Review.`;
          const badge = cell.querySelector('.mc-preview-badge');
          if (badge) { badge.textContent = 'DTXR approved'; badge.className = 'mc-preview-badge exact'; }
          else cell.insertAdjacentHTML('beforeend', ' <span class="mc-preview-badge exact">DTXR approved</span>');
        }
      }
      host.dataset.mcB313PreviewDirty = 'true';
      onSaveConfig?.(config);
      _markPreviewSaved(host, `${outcome.approved.length} explicitly selected DTXR wall key(s) saved; ${outcome.skipped.length} held. Rebuild Preview to refresh engineering output. B31.3 acceptance remains separate.`);
      review();
    });
  };
  action.addEventListener('click', review);
}

function _bindDtxrWallUpdateButton(args) {
  return _bindDtxrWallUpdateButtonBranchScoped(args);
}

export function xmlCiiRenderPreviewPhase(xmlFile, config) {
  const llRows = Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows.length : 0;
  const pcRows = Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows.length : 0;
  const matRows = Array.isArray(config.material?.mapRows) ? config.material.mapRows.length : 0;
  const wtRows = Array.isArray(config.weight?.masterRows) ? config.weight.masterRows.length : 0;

  if (!xmlFile) return `<div class="model-converters-workflow-detail-title">4 Preview</div><div class="model-converters-workflow-detail-note">⚠ Load an XML file in the sidebar first, then return here to preview enrichment.</div>`;

  const masterStatusRow = (label, rows, required = false) => {
    const ok = rows > 0;
    const icon = ok ? '✓' : (required ? '⚠' : '○');
    const style = ok ? 'color:#22c55e' : (required ? 'color:#f59e0b;font-weight:600' : 'color:#64748b');
    return `<span style="${style}">${icon} ${_esc(label)}: ${ok ? `${rows} row(s)` : 'not loaded'}</span>`;
  };
  const masterStatusHtml = `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;padding:8px 0 4px;">
    ${masterStatusRow('Line List', llRows)}
    ${masterStatusRow('Piping Class', pcRows)}
    ${masterStatusRow('Material Map', matRows, false)}
    ${masterStatusRow('Valve Weights', wtRows, false)}
  </div>`;



  return `<div class="model-converters-workflow-detail-title">4 Preview</div><div class="model-converters-workflow-detail-text">Optional enrichment preview per branch. Masters, rating and format assignment are not needed to convert XML→CII. Conflicting Format 1 / Format 2 identities are shown as separate review passes; neither is silently selected.</div>${masterStatusHtml}<div id="mc-preview-table-host" data-mc-preview-source-id="${_esc(xmlFile.name || '')}">${_manualPreviewActionHtml('Build Preview', false, config)}<div class="model-converters-workflow-detail-note" style="text-align:center;padding:18px;">Preview is not auto-built. Click <strong>Build Preview</strong> after loading XML/master data.</div></div>`;
}

export async function xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, options = {}) {
  const { onSaveConfig, openOverridePopup, ensureOverrides, forceBuild = false } = options;
  const host = rootEl?.querySelector('#mc-preview-table-host');
  if (!host) return { branchRows: [], nodeRows: [] };

  const _pvFp = pvCacheFingerprint(xmlText, config);
  const _pvCached = !forceBuild && !options.skipLegacyCache ? readCache(PV_CACHE_KEY) : null;
  const _pvFromCache = _pvCached?.fp === _pvFp && Array.isArray(_pvCached?.data?.branchRows) && _pvCached.data.branchRows.length > 0;

  if (!forceBuild && !_pvFromCache) {
    const previewResult = publishPreviewResult(host);
    _renderManualPreviewIdle(host, rootEl, xmlText, config, options);
    return previewResult;
  }

  let stagedSource, branchRows, nodeRows, nodeBoreWallRows = [], formatPreviewPasses = [];
  if (_pvFromCache) {
    stagedSource = { text: '', label: '(from cache)' };
    branchRows = _pvCached.data.branchRows;
    nodeRows = _pvCached.data.nodeRows || [];
    nodeBoreWallRows = _pvCached.data.nodeBoreWallRows || [];
    formatPreviewPasses = _pvCached.data.formatPreviewPasses || [];
  } else if (options.precomputedPreview) {
    // A Worker result is already computed; do not rerun 10k-master matching in UI.
    const prepared = options.precomputedPreview;
    if (!Array.isArray(prepared.branchRows) || !Array.isArray(prepared.nodeRows)
        || !Array.isArray(prepared.sourceOccurrences?.branches)
        || !Array.isArray(prepared.sourceOccurrences?.nodes)
        || prepared.sourceOccurrences.branchCount !== prepared.branchRows.length) {
      throw Object.assign(new Error('Worker source/branch population was not complete'),
        { code: 'WORKER_SOURCE_COVERAGE_MISMATCH' });
    }
    stagedSource = options.precomputedStagedSource || { text: '', label: '' };
    ({ branchRows, nodeRows } = prepared);
    nodeBoreWallRows = prepared.nodeBoreWallRows || [];
    formatPreviewPasses = prepared.formatPreviewPasses || [];
  } else {
    stagedSource = await _resolvePreviewStagedJsonText(options, config);
    ({ branchRows, nodeRows, nodeBoreWallRows, formatPreviewPasses } =
      xmlCiiDryRunPreview(xmlText, config, stagedSource.text));
  }
  const previewResult = publishPreviewResult(host, branchRows, nodeRows, formatPreviewPasses, nodeBoreWallRows);

  if (!branchRows.length) {
    host.innerHTML = `${_manualPreviewActionHtml('Build Preview', false, config)}<div class="model-converters-workflow-detail-note">No branches found in XML.</div>`;
    _bindManualPreviewButton(host, rootEl, xmlText, config, options);
    _bindParsedCustomSourceToggle(host, config, options);
    return previewResult;
  }

  const nodesByBranch = new Map();
  if (Array.isArray(nodeRows)) {
    for (const nr of nodeRows) {
      const bKey = nr.branchName || '';
      if (!nodesByBranch.has(bKey)) nodesByBranch.set(bKey, []);
      nodesByBranch.get(bKey).push(nr);
    }
  }

  const table = new XmlCiiAdaptedEditablePreviewTable({
    branchRows: xml229PreviewLineKeyCandidateRows(branchRows, formatPreviewPasses),
    nodesByBranch,
    matchBadgeHtmlRenderer: (method, confidence, needsReview, value, derived) => {
      const valEsc = _esc(value || '—'), derivedEsc = _esc(derived || ''), pctText = _percentText(confidence);
      if (method === 'override') return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge exact" title="Manual override applied by user in Preview table${pctText ? ` (${pctText})` : ''}.">✓ override${pctText ? ` ${pctText}` : ''}</span>`;
      if (method === 'exact') return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge exact" title="Exact match (100% confidence) verified in master data for: ${derivedEsc || valEsc}.">✓ exact ${pctText || '100%'}</span>`;
      if (['startsWith', 'leading-numeric-base', 'prefix-base', 'leading-numeric-exact'].includes(method)) return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge amber" title="Approximate prefix/numeric match (${method}): resolved '${valEsc}' from raw value '${derivedEsc}'${pctText ? ` (${pctText} confidence)` : ''}.">approx${pctText ? ` ${pctText}` : ''}</span>`;
      if (['fuzzy', 'fuzzy-ratio', 'numeric-near'].includes(method)) return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge ${needsReview ? 'orange' : 'amber'}" title="Fuzzy similarity match (${method}): proposed '${valEsc}' for raw input '${derivedEsc}'${pctText ? ` (${pctText} confidence)` : ''}.">fuzzy${pctText ? ` ${pctText}` : ''}</span>`;
      if (method === 'ambiguous' || method === 'ambiguous-approximate') return `<span class="mc-preview-editable-val">—</span> <span class="mc-preview-badge bad" title="Ambiguous candidate match for '${derivedEsc}'. Multiple conflicting master rows match with similar scores; manual override required.">ambiguous${pctText ? ` ${pctText}` : ''}</span>`;
      if (needsReview) {
        const noCode = !value || value === '—';
        const badgeTitle = noCode
          ? `No material code found in the material map for: ${derived || 'unknown key'}. Click to override manually.`
          : `Review: material code "${value}" resolved from "${derived || ''}" but confidence is low.`;
        return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge bad" title="${_esc(badgeTitle)}">review${pctText ? ` ${pctText}` : ''}</span>`;
      }
      return `<span class="mc-preview-editable-val">${valEsc}</span>`;
    },
    processInputHtmlRenderer: (fieldKey, lineKey, val, src, ri, pcKey = '') => {
      const cls = src === 'override' ? 'mc-preview-pd-cell mc-preview-pd-override' : (src === 'linelist' || src.startsWith('linelist-density') ? 'mc-preview-pd-cell mc-preview-pd-linelist' : ((src === 'default' || src === 'default-zero') ? 'mc-preview-pd-cell mc-preview-pd-default' : 'mc-preview-pd-cell mc-preview-pd-empty'));
      const rangeOrig = ['t1', 't2', 't3','insThk'].includes(fieldKey) ? (branchRows[Number(ri)]?.[fieldKey + 'RangeOrig'] || null) : null;
      const inputStyle = rangeOrig ? ` style="color:#d97706;font-weight:600;" title="Original source value: '${_esc(rangeOrig)}'; normalized when valid"` : (src === 'default' ? ' style="color:#7f1d1d;font-weight:600;font-style:italic;" title="Config default value"' : (src === 'default-zero' ? ' style="color:#7f1d1d;font-weight:600;font-style:italic;" title="Converter default: no value found — converter writes 0. Enter a value here to override."' : ''));
      const pcKeyAttr = pcKey ? ` data-mc-pd-pckey="${_esc(pcKey)}"` : '';
      return `<div class="${cls}"><input type="text" class="mc-preview-pd-input" value="${_esc(val)}" placeholder="${fieldKey}" data-mc-pd-field="${_esc(fieldKey)}" data-mc-pd-linekey="${_esc(lineKey)}" data-mc-row="${ri}" data-mc-pd-row="${ri}"${pcKeyAttr}${inputStyle}><button type="button" class="mc-preview-filldown-btn mc-pd-filldown" data-mc-fill-field="${_esc(fieldKey)}" data-mc-fill-from="${ri}" title="Smart fill: hydroPressure by piping class, others by line key">↓</button></div>`;
    },
    onClassSourceSelect: ({rowIndex,source}) => {
      const row=branchRows[rowIndex];
      if(!row?.pipingClassConflict||!['regex','line-list'].includes(source))return;
      const value=source==='regex'?row.pipingClassRegex:row.pipingClassLineList;
      if(!value)return;
      _renderClassTransactionStatus(host,value);
      void runAtomicPreviewClassTransaction({
        config,
        applyOverride:async()=>{
          const overrides=ensureOverrides(config);
          overrides.pipingClassSource={...(overrides.pipingClassSource||{}),
            [row.branchName]:{source,regex:row.pipingClassRegex,lineList:row.pipingClassLineList}};
        },
        hydrateAuthority:async()=>_hydrateEffectiveClassConfig(config,xmlText),
        persistConfig:async()=>onSaveConfig?.(config),
        rebuildPreview:async({hydrationResult,rollback,error})=>{
          await xmlCiiRebuildPreviewThroughWorker(rootEl,xmlText,config,options);
          const rebuilt=rootEl?.querySelector('#mc-preview-table-host');
          _markPreviewSaved(rebuilt,rollback?'Piping Class selection rolled back: '+_toText(error?.message||error):_classTransactionSuccessMessage(hydrationResult,value));
        },
      }).catch(error=>{
        console.error('Piping Class source selection failed:',error);
        const rebuilt=rootEl?.querySelector('#mc-preview-table-host');
        if(error?.rollbackError&&rebuilt)_markPreviewSaved(rebuilt,'Selection failed; rebuild required: '+_toText(error.message));
      });
    },
    onB313PullClick: async ({ rowIndex, button }) => {
      const preview = host.__xmlCiiPreviewResult;
      if (host.dataset.mcB313PreviewDirty === 'true') {
        window.alert('Preview edits are pending. Rebuild Preview before pulling B31.3 wall.');
        return;
      }
      const row = preview?.branchRows?.[rowIndex];
      const prepared = b313PullProposal(config, row, rowIndex, preview?.nodeBoreWallRows);
      if (!prepared.ok) {
        window.alert(`B31.3 Pull unavailable (${prepared.code}). Recalculate or review the basis first.`);
        return;
      }
      const prior = _toText(row.wallThickness || 'not specified');
      if (!window.confirm(`Pull calculated B31.3 wall for ${row.branchName}?\nCurrent: ${prior} mm\nSelected: ${prepared.record.nominalWallMm} mm\nSchedule: ${prepared.record.selectedSchedule || 'unreported'}\nThis updates the validated same-OD branch node group, not Fill Down.`)) return;
      const basis = config.b313WallUpdate || (config.b313WallUpdate = {});
      basis.acceptedWallByBranch ||= {};
      const before = basis.acceptedWallByBranch[String(rowIndex)];
      button.disabled = true;
      try {
        basis.acceptedWallByBranch[String(rowIndex)] = prepared.record;
        await onSaveConfig?.(config);
        await xmlCiiRebuildPreviewThroughWorker(rootEl, xmlText, config, options);
        const latest = rootEl?.querySelector('#mc-preview-table-host');
        const effective = latest?.__xmlCiiPreviewResult?.branchRows?.[rowIndex];
        if (effective?.b313PullStatus !== 'ACCEPTED' || Number(effective.wallThickness) !== Number(prepared.record.nominalWallMm)) {
          throw Error('Accepted B31.3 wall did not survive Preview rebuild. Output remains unverified.');
        }
        _markPreviewSaved(latest, 'B31.3 wall pulled into Preview pipe occurrences. Native output verification remains required.');
      } catch (err) {
        if (before) basis.acceptedWallByBranch[String(rowIndex)] = before;
        else delete basis.acceptedWallByBranch[String(rowIndex)];
        try { await onSaveConfig?.(config); } catch { /* Preserve visible failure state. */ }
        _markPreviewSaved(rootEl?.querySelector('#mc-preview-table-host'), `B31.3 Pull rolled back: ${_toText(err?.message || err)}`);
        window.alert(`B31.3 Pull was rolled back because Preview verification failed: ${_toText(err?.message || err)}`);
      } finally { button.disabled = false; }
    },
    onWeightCandidateSelect: ({ key, weight }) => {
      const numeric = Number(weight);
      if (!key || !Number.isFinite(numeric) || numeric <= 0) return;
      const overrides = ensureOverrides(config);
      overrides.rigidWeight = { ...(overrides.rigidWeight || {}), [key]: numeric };
      onSaveConfig(config);
      _markPreviewSaved(host, 'Weight override saved. Click Rebuild Preview to recompute suggestions.');
    },
    onCellEditClick: ({ editType, derivedKey, currentVal, rowIndex, td }) => openOverridePopup({ editType, derivedKey, currentVal, config, onSave: (newVal) => {
      const row = branchRows[Number(rowIndex)] || {};
      if (editType === 'pipingClass') {
        _renderClassTransactionStatus(host, newVal);
        void runAtomicPreviewClassTransaction({
          config,
          applyOverride: async () => {
            const savedKey = _savePreviewOverride({ config, ensureOverrides, editType, row, derivedKey, value: newVal });
      host.dataset.mcB313PreviewDirty = 'true';
            markAdaptedPreviewOverrideManual({ config, ensureOverrides, field: editType, key: savedKey, value: newVal });
            return { savedKey, value: newVal };
          },
          hydrateAuthority: async () => _hydrateEffectiveClassConfig(config, xmlText),
          persistConfig: async () => onSaveConfig?.(config),
          rebuildPreview: async ({ hydrationResult, rollback, error }) => {
            await xmlCiiRebuildPreviewThroughWorker(rootEl, xmlText, config, options);
            const rebuiltHost = rootEl?.querySelector('#mc-preview-table-host');
            if (rollback) {
              _markPreviewSaved(rebuiltHost, `Piping Class update failed and was rolled back: ${_toText(error?.message || error)}`);
            } else {
              _markPreviewSaved(rebuiltHost, _classTransactionSuccessMessage(hydrationResult, newVal));
            }
          },
        }).catch((error) => {
          console.error('Atomic Piping Class Preview update failed:', error);
          const currentHost = rootEl?.querySelector('#mc-preview-table-host');
          if (error?.rollbackError) {
            currentHost.innerHTML = `<div class="model-converters-workflow-detail-note" style="border-color:#7f1d1d;color:#7f1d1d;background:#fff7f7;">Piping Class update failed, and the prior Preview could not be restored: ${_esc(error.rollbackError?.message || error.rollbackError)}</div>`;
          }
        });
        return;
      }
      const savedKey = _savePreviewOverride({ config, ensureOverrides, editType, row, derivedKey, value: newVal });
      host.dataset.mcB313PreviewDirty = 'true';
      markAdaptedPreviewOverrideManual({ config, ensureOverrides, field: editType, key: savedKey, value: newVal });
      if (editType === 'rating' && row.lineKey) markAdaptedPreviewProcessManual({ config, ensureOverrides, field: 'rating', lineKey: row.lineKey, value: newVal });
      onSaveConfig(config);
      td.dataset.mcFillState = 'manual';
      _updateEditedPreviewCell(td, newVal);
      _markPreviewSaved(host);
    } }),
    onFillDownClick: ({ field, fromRow, currentVal, sourceTd }) => {
      const pipingClassKey = sourceTd?.dataset?.mcPcKey || '';
      const filled = pipingClassKey ? applyAdaptedPreviewSmartFillByClass({ host, config, ensureOverrides, field, pipingClassKey, currentValue: currentVal }) : applyAdaptedPreviewOverrideFillDown({ host, config, ensureOverrides, field, fromRow, currentValue: currentVal });
      if (filled > 0) {
        host.dataset.mcB313PreviewDirty = 'true';
        if (field === 'rating') {
          const overrides = ensureOverrides(config);
          for (const row of branchRows) {
            const value = _bucketText(config, 'rating', _ratingKeys(row));
            if (value && row.lineKey) _setProcessDataField(overrides, row.lineKey, 'rating', value);
          }
        }
        onSaveConfig(config);
        _markPreviewSaved(host, `${filled} override${filled === 1 ? '' : 's'} saved (class smart fill). Click Rebuild Preview to recompute suggestions.`);
      }
    },
    onProcessInputChange: ({ field, fieldKey, lineKey, value, input }) => {
      const overrides = ensureOverrides(config);
      if (!overrides.processData) overrides.processData = {};
      if (!overrides.processData[lineKey]) overrides.processData[lineKey] = {};
      const actualField = field || fieldKey;
      let cleanVal = _toText(value).trim();
      if(actualField==='insThk'){
        const normalized=normalizePreviewInsulationThickness(cleanVal);
        if(normalized.status==='invalid'){input.setCustomValidity?.('Enter a nonnegative thickness, a valid range or an explicit no-insulation value.');input.reportValidity?.();return;}
        input.setCustomValidity?.('');cleanVal=normalized.value;input.value=cleanVal;
      }else if(actualField==='insType'){cleanVal=normalizePreviewInsulationType(cleanVal);input.value=cleanVal;}
      if (cleanVal === '') delete overrides.processData[lineKey][actualField];
      else overrides.processData[lineKey][actualField] = cleanVal;
      if (actualField === 'rating' && cleanVal) overrides.rating = overrides.rating && typeof overrides.rating === 'object' && !Array.isArray(overrides.rating) ? { ...overrides.rating, [lineKey]: cleanVal } : { [lineKey]: cleanVal };
      if (Object.keys(overrides.processData[lineKey]).length === 0) delete overrides.processData[lineKey];
      markAdaptedPreviewProcessManual({ config, ensureOverrides, field: actualField, lineKey, value: cleanVal });
      onSaveConfig(config);
      host.dataset.mcB313PreviewDirty = 'true';
      const cell = input.closest('.mc-preview-pd-cell');
      if (cell) cell.className = cleanVal ? 'mc-preview-pd-cell mc-preview-pd-override' : 'mc-preview-pd-cell mc-preview-pd-empty';
      _markPreviewSaved(host, 'Process override saved. Click Rebuild Preview to recompute suggestions.');
    },
    onProcessFillDownClick: ({ fieldKey, fromRow, value, pipingClassKey }) => {
      const sourceInput = host.querySelector(`[data-mc-pd-field="${fieldKey}"][data-mc-pd-row="${fromRow}"]`);
      const lineKey = sourceInput?.dataset?.mcPdLinekey || '';
      if(fieldKey==='insThk'){
        const normalized=normalizePreviewInsulationThickness(value);
        if(normalized.value==='')return;
        value=normalized.value;if(sourceInput)sourceInput.value=value;
      }else if(fieldKey==='insType'){value=normalizePreviewInsulationType(value);if(!value)return;}
      const isPcField = fieldKey === 'hydroPressure';
      const filled = (isPcField && pipingClassKey) ? applyAdaptedPreviewSmartProcessFillByClass({ host, config, ensureOverrides, field: fieldKey, pipingClassKey, lineKey: '', currentValue: value }) : (lineKey ? applyAdaptedPreviewSmartProcessFillByClass({ host, config, ensureOverrides, field: fieldKey, pipingClassKey: '', lineKey, currentValue: value }) : applyAdaptedPreviewProcessFillDown({ host, config, ensureOverrides, field: fieldKey, fromRow, currentValue: value }));
      if (filled > 0) {
        host.dataset.mcB313PreviewDirty = 'true';
        onSaveConfig(config);
        _markPreviewSaved(host, `${filled} process override${filled === 1 ? '' : 's'} saved (smart fill). Click Rebuild Preview to recompute suggestions.`);
      }
    }
  });

  const passReview = (formatPreviewPasses || []).length > 1
    ? '<section class="model-converters-workflow-detail-note" data-mc-format-review-passes="2">'+
      '<strong>Format 1 / Format 2 conflict: two independent 4 Preview passes (not applied automatically).</strong>'+
      '<div style="overflow:auto;max-height:460px"><table><thead><tr><th>Pass</th><th>Branch</th><th>Line Key</th><th>Piping Class</th><th>Rating (optional)</th><th>Result</th></tr></thead><tbody>'+
      formatPreviewPasses.flatMap(pass=>(pass.branchRows||[])
        .filter((row, occurrenceIndex)=>branchRows[occurrenceIndex]?.branchName===row.branchName &&
          branchRows[occurrenceIndex]?.extractionStatus==='AMBIGUOUS')
        .map(row=>'<tr><td>Format '+(pass.formatIndex+1)+'</td><td>'+_esc(row.branchName)+
          '</td><td>'+_esc(row.lineKey||'UNMATCHED')+'</td><td>'+
          _esc(row.pipingClass||'UNMATCHED')+'</td><td>'+_esc(row.rating||'—')+'</td><td>'+
          _esc(row.extractionStatus)+'</td></tr>')).join('')+
      '</tbody></table></div><p>Review both passes and assign the intended source identity in Regex Tester. XML→CII may still run without master enrichment.</p></section>'
    : '';
  host.innerHTML = `${_manualPreviewActionHtml('Rebuild Preview', true, config)}${passReview}<div class="bulk-map-container-host"></div>${table.renderHTML()}`;
  const mapContainer = host.querySelector('.bulk-map-container-host');
  if (mapContainer) {
    const lineListKeys = _xmlCiiLineListKeys(config);
    renderBranchLineMapPanel(mapContainer, {
      branchRows,
      lineListKeys,
      config,
      onSaveConfig: (cfg) => {
        if (typeof onSaveConfig === 'function') onSaveConfig(cfg);
        _markPreviewSaved(host, 'Branch mappings saved. Click Rebuild Preview to apply.');
      },
      onRebuildPreview: () => {
        // Save & Apply is a config write, not permission to rebuild without
        // pressing the native Rebuild Preview button.
        suggestManualPreviewRebuild(host,'Branch mappings saved.');
      }
    });
  }
  _bindManualPreviewButton(host, rootEl, xmlText, config, options, 'Rebuilding preview...');
  _bindParsedCustomSourceToggle(host, config, options);

  const defaultFields = ['p1', 'hydroPressure', 't1', 't2', 't3', 'density', 'wallThickness', 'corrosion','insThk','insType'];
  const defaultRows = branchRows.map((row, ri) => ({ row, ri, fields: defaultFields.filter((field) => _isDefaultSource(row[`${field}Source`])) })).filter((item) => item.fields.length > 0);

  if (stagedSource.label) host.insertAdjacentHTML('afterbegin', `<div class="model-converters-workflow-detail-note" style="margin:0 0 8px;border-color:#2b6cb0;color:#1e3a8a;background:#eff6ff;">DTXR staged source: ${_esc(stagedSource.label)}</div>`);
  if (defaultRows.length) host.insertAdjacentHTML('afterbegin', `<div class="model-converters-workflow-detail-note" style="margin:0 0 8px;border-color:#7f1d1d;color:#7f1d1d;background:#fff7f7;">${defaultRows.length} line${defaultRows.length === 1 ? '' : 's'} use config defaults. Default values are shown in dark red.</div>`);

  if (!_pvFromCache && !options.skipLegacyCache) {
    writeCache(PV_CACHE_KEY, _pvFp, { branchRows, nodeRows, nodeBoreWallRows, formatPreviewPasses });
  }

  table.bind(host);
  _bindDtxrWallUpdateButton({ host, branchRows, config, ensureOverrides, onSaveConfig, stagedSourceLabel: stagedSource.label });
  return previewResult;
}
