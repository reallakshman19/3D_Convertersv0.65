# GLRD 30-row Step 4: source-bound P1 units and exact-DN class wall
Date: 2026-11-17 | Scoped implementation | ENGINEERING HOLD

## Before
The B31.3 report used `inferPreviewPressureUnit(..., previewOnly=true)`. That mode rejected a source-verified Line List pressure header whenever `row.p1Unit` was blank, even though the same resolver already knew how to read an exact numeric match from a unit-bearing selected Line List column. This left a second P1-unit HOLD masked behind unresolved factors.

`calculateAndSelectPreviewB313Wall()` correctly computed a pressure-minimum schedule from the general pipe-wall master but had **no exact-DN class schedule eligibility check**. In 4 Preview this could propose a nominal wall not permitted by the user's actual Piping Class.

The first post-PR7 B31.3 report could also render separately above the lazily mounted basis panel; the UI had not fully unified both DOM blocks.

## Implemented in this scope only
- Pressure unit inference is enabled in Preview ONLY for the same selected Line List row and its **explicit design/maximum/P1 unit header**, with numerical value identical to Preview P1, and `p1Source` proving Line List provenance. Never from hydro/test, numeric magnitude or project name. Conflicting explicit/Preview/Line List units HOLD.
- After the existing central `PIPE.B313.THICKNESS` engine returns a successful calculation, the exact-DN class product must contain positive DN, product, source row, schedule and nominal wall. The listed schedule must match the **same dimensional-standard pipe-wall master**, including nominal wall within 0.08 mm.
- If class nominal wall is less than calculated minimum, the row becomes `B313_PREVIEW_CLASS_WALL_INSUFFICIENT`: no automatic change to a different schedule. If class wall is sufficient, the exact class thickness/schedule—not an arbitrary master minimum—forms the **CALCULATED** proposal. Original API calculation and ungoverned minimum selection remain in evidence; explicit Pull is unchanged.
- When lazy editor mounts after the audit, physically relocate the unique audit report into the single B31.3 workspace, rather than duplicate it.
- Existing JavaScript 4 Preview/B31.3 test suite extended with source-value and class-wall checks; runtime and Pages `docs/` JS mirrors kept byte-identical.

## Actual project-data evidence
- `docs/Masters/SpecwisePipingClass/93833.json`: exact DN50 / NPS2 ASTM A790 UNS S31803 / Sch40S / 3.9116 mm; DN150 / NPS6 same material / Sch40S / 7.112 mm; DN200 / NPS8 same material / Sch80S / 12.7 mm.
- `docs/Masters/b313-code-factor-rules.json`: **zero** strict E/W/Y code records.
- `docs/Masters/b313-material-factor-master.json`: active rows at target DSS/LTCS not verified/project approved.
- `engineering/b313/glrd-b313-2024-external-reference-intake-v1.json`: A790 S31803 reference source invalid at T1=120 C; A333-6 82 C screening stress candidate 138 MPa not project qualified. Do not extrapolate 225 C A790 S to 120 C.
- The pinned PSI02 30-branch XML exists in the repo. The owner-linked `GLRD-INPUTS` manifest points to an older BM2 31-branch model, which is **not** a verified effective PSI02 Step4 master/config receipt. Do not claim a real 30-row qualified conversion.

## What remains HOLD
- For the 26 DSS rows: approved original-code S at 120 C; physical manufacturing route / route source; qualified E/W/Y basis.
- For the 2 LTCS rows at 82 C: approved T1 factor basis (no silent screening-source promotion), manufacturing route.
- For the 2 P4110003 rows: LTCS Line List material vs class 93833 DSS exact DN conflict; owner engineering resolution.
- For any line with P1 unit still missing an exact unit-labeled design-pressure column: explicit P1-unit source review, not numerical guessing.
- Full PSI02 source/config custody, physical row/node ledger, accepted Pull and actual native emitted CII wall parity. No Python converter changes authorized or made.

**This fix enables correctly source-bound calculations as soon as qualified factors exist; it does not fabricate the missing factors, force 30/30 acceptance or imply that a successful app deployment is an approved stress analysis.**

## Pull-time stale P1 source prevention (additional correction)

A calculated proposal generated from `line-list-column:Pressure Max kPa(g)` now carries the **actual resolved pressure unit** in its evidence. `converters/xml-cii2019-core/b313-preview-line-list-pressure-receipt.js` independently rechecks the exact selected Line List header, value and unit at explicit Pull, and `b313ReadAcceptedWall()` rechecks the same receipt when accepted wall is replayed to Preview. A changed/removed header, altered P1 or conflicting unit returns `B313_PULL_P1_UNIT_SOURCE_CHANGED`, without modifying an old accepted record. This is a source-custody protection, not a substitute for a qualified factor or proof of physical manufacture.

New tests exercise a synthetic A106 calculated source-bound proposal, its Pull acceptance, and rejection of header replacement (`kPa` → `PSIG`) or an additional contradictory pressure header; authentic DSS Class 93833 still remains factor-HOLD. Source and `docs/` JS modules are synchronized. No Python converter edit.
