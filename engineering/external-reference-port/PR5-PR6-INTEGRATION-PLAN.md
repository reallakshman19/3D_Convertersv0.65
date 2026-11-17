# PR #5 → PR #6 integration plan — EPCC dimensional audit inside existing 4 Preview

**Date:** 2026-11-17  
**Repo:** \`reallakshman19/3D_Convertersv0.65\`  
**Baseline:** \`main@8712fc17015433509d0d7a0942fdb0fe0549c66c\` (PR #5 merged)  
**Rebased PR:** #6 \`feat/external-standards-matseng-review-port\`  
**Disposition:** PLAN ONLY / no additional 4 Preview implementation or engineering authority promotion. PR #6 remains draft.

## Decision

**Reuse PR #5's existing B31.3 source chain and audit UI.** The EPCC reference pack must be an independent **dimensional comparison provider**, not a substitute material, P1/T1, S/E/W/Y, pressure-design wall or automated Pull authority. Do not create another 4 Preview tab, new calculation engine, bulk defaults, or second source-of-truth table.

PR #5 has merged and already implemented (1) Config 8 → piping class exact-DN → 4 Preview source/corroboration, (2) per-physical-occurrence factor/route authority, (3) B31.3 rule engine and source-approval discipline, (4) true Calculate vs explicit Pull, (5) an external B31.3 reference candidate receipt and readiness report. The published E/W/Y rule pack remains empty and target GLRD S is not independently qualified: merging PR #5 does NOT imply calculations are approved.

PR #6 currently introduces read-only local JSON import, source hash checks, exact NPS/schedule lookup and a manually entered MatSEng screening comparison under Engineering Calculations. It does **not** yet compare with live 4 Preview rows; that is the NEXT scope.

## A. Current architecture and exact interface owners

| Layer | Existing authority/interface | Proposed work | May mutate? |
|---|---|---|---|
| Source custody | \`engineering/b313/glrd-pinned-source-manifest.json\`; exact PSI02 source verification | Bind source IDs/hashes and distinguish PSI02 from BM2 | NO |
| Upstream reference | PR #6 \`converters/external-engineering/reference-review.js\` and \`source-inventory.json\` | Add a separate pure, read-only dimensional comparison function | NO |
| Preview row source | \`selectPreviewB313ActionRows()\` in \`xml-cii-adapted-preview-b313-wall-update.js\` | Consume already assembled LIVE rows; do not reconstruct line list from unrelated cache if live exists | NO |
| Preview material/pipe trace | \`derivePreviewB313AutoBasisRow()\`, \`previewB313SourceTrace()\` | Reuse exact DN class material, schedule, wall, OD, P1/T1 and physical occurrence | NO |
| Status UI | \`renderPreviewB313WallAuditHtml()\`, \`derivePreviewB313AuditRootCauseGroups()\` | Add a compact external-reference mismatch column/badge and expandable receipt in CURRENT audit panel | UI ONLY |
| Governed factors | \`resolveB313QualifiedTemperatureFactor()\` and \`resolvePublishedB313CodeFactor()\` | Do NOT read unqualified EPCC values into strict engine | NO |
| Pull custody | \`b313PreviewInputSignature()\`, \`b313PullProposal()\`, accepted wall by branch/node signatures | Preserve EXACT signatures; external audit never accepts/changes proposals | NO |
| Final CII | Existing rebuild and emitted-output validation | Regression only; no conversion code changes | NO |

**Three levels upstream:** original XML physical node/OD → Config8/Line List/Piping Class exact-DN source → 4 Preview material/dimension row.  
**Three levels downstream:** 4 Preview audit/diagnostic → strict Calculate and explicit, independently eligible Pull → rebuilt enriched XML and emitted CII verification.

## B. Proposed in-place UI (minimal)

Existing 4 Preview B31.3 Auto Basis/Audit panel gains ONE small optional control:
\`[Compare EPCC dimensions]\` with badge \`External REF · review only\`.

Do NOT replace the seven existing Config 8 columns. Do NOT introduce a second wall-thickness Pull/Fill button. Details are expandable inside the existing audit result; users can still use the separate Engineering Calculations > External Reference Review for one-off manual source inspection.

Optional dimensional audit row:

| Branch/occurrence | DN / NPS | Preview physical OD | Config8/class exact-DN pipe product | Class schedule / wall | EPCC OD / exact schedule wall | ΔOD / Δwall | Source evidence | Review status |
|---|---|---|---|---|---|---|---|---|

A row belongs to a specific physical occurrence. No grouping approval at material/T1 level. Node/branch lineage visible on expansion.

Suggested statuses:
- \`MATCH\`: same approved comparison identity, within declared geometry tolerance; **not** a wall design approval.
- \`DIMENSION_DIFFERENCE_REVIEW\`: OD/wall difference under unambiguous identity; informational until engineer reviews project dimensional authority.
- \`CLASS_DN_PRODUCT_CONFLICT\`: exact-DN class material/source is inconsistent; preserve existing PR #5 HOLD.
- \`NPS_SCHEDULE_UNLISTED\`: pair absent in sparse EPCC pack; do not select another schedule, infer from STD/XS or set zero.
- \`REFERENCE_UNVERIFIED\`: file missing/mismatched SHA; show provenance issue, disable numerical review lookup.
- \`PREVIEW_SOURCE_UNRESOLVED\`: absent live source or physical row identity; NO fabricated comparison.
- \`NOT_APPLICABLE\`: non-pipe/no authentic NPS-schedule physical dimension.

A standalone EPCC discrepancy **must not block unrelated valid existing XML→CII output**; any project material/pressure/code HOLD continues to originate from PR #5 authorities. Explicit engineer review is required before changing actual project masters.

## C. Data normalization and identity contract

1. Only actual Git-blob-matched EPCC \`pipe-sizes.ref.json\` and \`pipe-schedules.ref.json\` are eligible for local reference lookup. No auto-fetch, untrusted edit, or persistent factor publication.
2. Map DN to NPS **by the exact reference row**, not by DN/25 rounding. OD always comes from the physical node/row and exact source path. Preserve inlet/outlet reducer boundary: no inherited bore/OD across transition.
3. Normalize schedules textually only; represent \`STD\`, \`XS\`, \`40\`, \`40S\`, \`80\`, \`80S\` as distinct identities unless a specific verified reference explicitly lists each pair. Preserve NPS/schedule sparsity.
4. Key comparison receipt by \`branchOccurrenceIndex + branchName + nodeScope + sourceXmlDigest + effectiveConfigDigest + pipingClassExactDnRow + EPCC blob SHA\`. Recalculate when any input or physical source changes; never reuse a stale result.
5. Show units explicitly: OD/wall/ID in mm. Report \`deltaOdMm\`, \`deltaNominalWallMm\`, percentage differences only where both values exist; do not interpret nominal inside diameter as CII bore.
6. No default material, route, thickness, code edition, temperature or design pressure. No EPCC source factor may replace approved S/E/W/Y or imply approved W/Y interpolation.
7. Audit JSON is \`REVIEW_ONLY\`; source SHA pin ≠ licensed Code-source SHA-256 ≠ approved factor provenance. Retain original reference filename, source commit, source table/row, applicable edition and review disposition.

## D. Workpacks (ordered)

### D0 — Rebase and regression boundary (completed for PR #6 branch)
- Replay PR #6 onto merged PR #5 main, with original source/engine changes intact.
- Include four \`docs/\` JavaScript mirrors for GitHub Pages; compare source/mirror blob SHAs.
- Verify the PR diff has no modification to PR #5 factor-rule engine, Config8/Preview calculator/Pull, XML→CII writer or master.
- Keep PR #6 draft. Unit, browser and full CI acceptance are separately tracked.

### D1 — Pure dimensional comparator (small)
- Add \`compareEpccPreviewDimensions({physicalRow, classPipeRow, epccSizes, epccSchedules, sourceCustody})\`.
- Input adapters to consume existing PR #5 Preview row and exact-DN class data rather than new workbook parsing.
- Implement explicit field-level results, source traces, missing-pair fail-closed tests, and reducer/multiple-DN tests.
- Tests: valid NPS6/Sch40; 80 vs 80S; STD vs 40 at NPS > 10; mismatched schedule; absent OD; double-source conflict; unverified ref.

**Exit:** deterministic 1-row fixture, no writes to Preview/factor/writer modules.

### D2 — Existing 4 Preview audit UI hook (small-medium)
- Add optional Compare action inside existing auto-basis/audit panel. Reuse \`selectPreviewB313ActionRows\` live row selection.
- Render compact summary and expandable evidence on existing Audit view; no extra Preview screen or Config8 columns.
- Never change \`Pull\`, \`Fill\`, active material factor draft, \`proposalsByBranch\` or \`acceptedWallByBranch\`.

**Exit:** Chromium actual browser validation: file upload, compare, clear/reload, branch switching, cache expiry, no changes to emitted conversion unless user separately used approved Pull.

### D3 — Reconcile external B31.3 candidate evidence with PR #5 (small, non-authoritative)
- Reuse \`engineering/b313/glrd-b313-2024-external-reference-intake-v1.json\`; do NOT create parallel active S/E/W/Y tables.
- Show source candidate identity and explicit \`ENGINEERING_HOLD\`/review missing reasons next to existing PR #5 factor basis.
- Any future factor publication passes PR #5 generator, exact edition and original controlled-source SHA-256, independent reviewer, project sign-off and physical route qualification.

**Exit:** no promotion of screening/unverified EPCC data to VERIFIED/PROJECT_APPROVED.

### D4 — Authentic GLRD 30-row custody and parity (medium-large; blocked on inputs/evidence)
- Target exact \`GLRD-1000-PSI-02.xml\` 30 branches/1,224 nodes, SHA-256 \`164163380dccffb8f9d6bd7853eabd36eea89e508da2215443e81969144d4a45\`.
- DO NOT substitute BM2 31 branches/1,196 nodes or its config. Recover effective PSI02 Step4 config and source Line List \`Linelist\` sheet.
- Run 30/30 branch-ordered **audit** rows grouped 26 DSS/120C + 2 LTCS/120C + 2 LTCS/82C with exact physical class DN/OD/schedule, source, result and HOLD codes.
- Only separately qualified cases can achieve \`CALCULATED_PULL_READY\` and then an explicit accepted \`PULLED\`; verify rebuilt XML and emitted CII per physical occurrence.

**Exit:** reproducible artifact receipt; no claim of 30/30 engineering PASS merely because comparison completed.

### D5 — Optional, separately approved production factor qualification (requires licensed evidence)
- Obtain governing project code edition, MTR/product/manufacturing route, controlled ASME source document and approved S/E/W/Y/code-rule evidence.
- Independently review table notes and temperature applicability. Populate existing qualified master only after review and publish/CI gates.
- Do not merge with the basic EPCC dimensional-audit PR.

## E. Acceptance commands and evidence

- \`npm run verify:external-reference\`
- \`node --test tests/b313-material-factors.test.mjs tests/xml-cii-b313-governed-factor-engine.test.mjs tests/xml-cii-b313-preview-wall-audit-controller.test.mjs tests/xml-cii-b313-preview-wall-update.test.mjs tests/xml-cii-b313-glrd-config8-sourcechain.test.mjs\`
- \`node scripts/glrd-b313-qualification-readiness.mjs\` (audit-only evidence, NOT accepted Preview)
- GitHub Pages mirror SHA identity root vs \`docs/\` for changed runtime JS
- Chromium E2E on real import + existing 4 Preview panel: source switching, bad SHA, exact product selection, explicit Pull/Fill separation, no stale approval
- Classification of all failing exact-head jobs; do not call entire CI green based only on B31.3 jobs

## F. Stop/continue rule

**Continue with D1/D2 read-only only.** Any attempt to activate external S/E/W/Y, overwrite Config8/Step4 source, infer route or change wall automatically is a separate engineering-gated change and remains HOLD. No merge/deploy without full impacted integration acceptance.
