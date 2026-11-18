function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * Mode A Preview must remain user-operated. Previous visibility wiring called
 * Build Preview programmatically on open (including after lazy DOM mounting),
 * potentially discarding unsaved review context. This function is now only
 * a presentation aid; explicit Build/Rebuild button handlers are unchanged.
 */
export function installModeAIndividualPreviewToolVisibility(workspace) {
  if (!workspace) return false;
  let labeled = false;
  for (const details of workspace.querySelectorAll('details[data-mode-a-source-phase]')) {
    const summary = details.querySelector('summary');
    if (!/Preview\\s*\\/\\s*Review/i.test(text(summary?.textContent))) continue;
    if (details.dataset.modeAPreviewToolsBound === 'true') continue;
    details.dataset.modeAPreviewToolsBound = 'true';
    const span=details.ownerDocument?.createElement?.('span');
    if (span && summary) {
      span.dataset.modeAPreviewManualHint = 'true';
      span.textContent = ' · Manual Build/Rebuild Preview';
      span.style.cssText = 'font-size:11px;color:#fbbf24;font-weight:500;';
      summary.appendChild(span);
      labeled = true;
    }
  }
  return labeled;
}
