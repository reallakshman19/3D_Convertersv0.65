# GLRD PSI-02 — PR 1–6 RCA and unified Step 4 wall review (2026-11-17)

**Disposition: Engineering HOLD / release HOLD.** This is a reproducible code/CI root-cause review, NOT permission to assume qualified ASME factors or release 30 GLRD lines.

## Evidence baseline and exact source limitations

- Baseline main `6435070c82bfa458da821b6d14db4d7180ebfa44` (PR #4 final merge; PR #5 and PR #6 already merged).
- Selected connected Drive folder `https://drive.google.com/drive/folders/1F09it3WmRiyakUitwg2XjOPUiaxxUNlI` was accessed using the matching reallakshman19@gmail.com connection and returned **zero direct children** on both fetch and list; do not claim current saved GLRD session/config was replayed.
- `engineering/b313/glrd-pinned-source-manifest.json` pins authentic public GitHub XML and historical masters. The 30-branch / 1,224-node target is **GLRD-1000-PSI-02.xml**, SHA-256 `164163380dccffb8f9d6bd7853eabd36eea89e508da2215443e81969144d4a45`; it is distinct from historical 31-branch / 1,196-node BM2.
- Source-custody CI PASS `https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44042794282`. The effective PSI-02 config remains not verified and stage JSON was originally BM2-named. GitHub source fixtures are not a replacement for the actual saved owner session.

## Recent PR sequence and why a merged PR did not fix the live GLRD 30/30 HOLD

| PR | Merged change | Verified technical outcome | What remained |
|---|---|---|---|
| #1 | Step 4 Calculate proposal vs explicit occurrence-signed Pull, with tolerance and CS fallback | Protected Pull architecture | Active factor sources for DSS/LTCS not qualified |
| #2 | GitHub Pages configuration/bootstrap repair | Pages can deploy | Successful deployment != data qualification |
| #3 | Step 8 Material Code / piping class exact material custody | Reject material contradictions and ambiguous family default | This intentionally creates true material/route HOLDs |
| #5 | Governed edition-specific E/W/Y source-rule engine, exact DN/route evidence, PSI02 custody and diagnostics | Step 4 unit and Chromium PASS `https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44042794599`; GLRD source custody PASS | Code-rule pack `docs/Masters/b313-code-factor-rules.json` has **zero VERIFIED/PROJECT_APPROVED E/W/Y records**. DSS/LTCS active S similarly lacks project-qualified records; source edition/route/real config not supplied |
| #6 | EPCC/MatSEng read-only interoperability and provenance | Independent reference lookup only | Never wired dimensional comparisons or approved S/E/W/Y into live 4 Preview |
| #4 (merged last) | Retired legacy workflows, kept release-functional gates, deployed site | Deployment PASS `https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44057674261` | Workflow removal does not fix source HOLDS; some retained tests still fail |

Chronology matters: #5 is merged before #6, and #4 was merged later. One should not infer the current UI's provenance solely from PR numbering.

## Root-cause grouping explained

**30 physical Preview branches** are audited. The editable B31.3 automatic basis originally said **29 material-temperature groups**, but `buildPreviewB313AutoBasisRows()` deduplicates by `previewB313BasisKey()`, which includes occurrence-specific lineage and source identity. These 29 are therefore **basis entries, not 29 materials** and should not be confused with the separate 3 root-cause buckets in the audit:

- 26 DSS/A790 S31803 at 120 C: SCREENING S/W/Y excluded and E needs documented physical manufacturing route.
- 2 LTCS/A333 Grade 6 at 82 C: no qualified strict factor bracket / row for T1; source candidates do not create approved interpolation.
- 2 exact-DN class-vs-Preview material identity conflicts: source contradiction must be reviewed before calculation.

In the user's effective Preview the rows showed `P1=13001`, `test=22905` and **P1 unit unresolved**. The existing calculation checks factor basis before pressure-unit validation and thus initially **masks an independent second blocker** behind the 30-row factor/identity HOLD. No 13001-to-kPa/psi interpretation is allowed without source authority. Changing S/E/W/Y alone will not clear those rows.

## What are the two wall actions?

`Update Wall thickness based on DTXR` is source/geometry matching and can modify the DTXR-derived override; it is **not** a pressure design check. `Update wall thickness as per B31.3 Sec II` calculates an eligible pressure-design proposal using the governed B31.3 API and project wall master; it must not write to the effective Preview until the user explicitly accepts a physical occurrence through **Pull**.

The **B31.3 automatic basis** editor and **B31.3 wall update audit** are also NOT separate calculators: they are the input/evidence and output/diagnostic halves of one calculation, and should be displayed together. DTXR vs B31.3 still have independent engineering authority and must not automatically overwrite one another.

## Confirmed CI/tooling failures, distinct from GLRD factor HOLDS

- PR #5: **54** exact-head runs, **23 PASS / 31 FAIL**. Step 4 unit+Chromium and authentic source checks were PASS. Full repo was not green.
- PR #6: final head `6e8ebae4fa7ec5e71ab7823c39bf7b7844b034a4` accumulated failures unrelated to successful read-only reference comparison.
- `https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44049561040` (Piping Class cold hydration): Playwright 1.52 on `ubuntu-latest` resolved to **ubuntu26.04-x64** and failed before running browser tests: `Playwright does not support chromium on ubuntu26.04-x64`. Confirmed log in job 133923640118.
- `https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44054237568` (published Pages browser smoke): same Ubuntu 26.04 / Playwright 1.52 installation failure, job 133939433359. This failure is **not proof** the deployed page itself fails.
- `https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44049560991` (HP Piping Class): stale/failed source assertion inside the real workbench test, job 133923641494. Not caused by factor qualification.
- `https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44049560940` (Issue 776): browser installation failed on Ubuntu 26.04; the separate focused-regressions job also failed with mismatched FIT qualification/labels. These are different root causes and require separate resolution.

**Note:** PR #4 retained 31 critical workflows but older workflow run history still contains now-retired suites. Pinning the active Playwright jobs to Ubuntu 24.04 removes one environment break; it does not turn unrelated source assertions or academic/engineering HOLDS green.

## This draft correction

1. Preserve the existing 4 Preview table and two distinct DTXR/B31.3 source authorities; add one shared **B31.3 Wall Review — Basis & Results** workspace with the full editable basis and a nested 30-physical-row audit.
2. Change misleading `29 material-temperature groups` to `N physical Preview rows · M occurrence-scoped basis entries`.
3. Continue to report the distinct root-cause groups separately, never grouping actual approval keys by material temperature.
4. Add independent per-row P1 unit, P1 presence, T1 source, and physical-route evidence diagnostics even when factor/identity failure fires first; **no changes to factor master, route assumptions, CII writer, Calculate formula or Pull acceptance**.
5. Synchronize the three runtime modules exactly to their `docs/` mirrors.
6. Pin five active Chromium-relevant workflows (ten `ubuntu-latest` runner jobs) to Ubuntu 24.04, already validated by B31.3 Step 4 successful workflow.
7. Add unit and browser tests for one-panel audit, row/group counts, excluded factors and zero automatic Pull.

## Remaining independent gates

1. Recover actual effective PSI02 saved configuration; verify selected Linelist sheet, pressure P1 **and units**, class exact-DN product/route; use source hashes and per-branch lineage.
2. Resolve two LTCS versus class 93833 contradictions without overwriting Line List.
3. Verify source-authorized ASME B31.3 edition, actual pipe manufacture/MTR and independently reviewed S/E/W/Y original Code sources. Publish only under existing `VERIFIED` / `PROJECT_APPROVED` authorisation and code-table notes.
4. Perform true 30-row Calculated/HOLD, explicit accepted Pull, rebuilt enriched XML, native CII emitted-field parity run. Do not claim all 30 will qualify.
5. Obtain full impacted CI, Chromium and project engineering approval; then owner decides merge/deploy.

**No manufacturing route, pressure unit, factor or material grade is inferred in this fix.**
