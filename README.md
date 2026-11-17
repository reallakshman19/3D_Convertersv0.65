# FormatConverters

Standalone static app generated from `F:\CODE-4\3D_Viewer\viewer`.

## Tabs
- 3D Model Converters (`model-converters`)
- Basic GLB-PCF (`basic-glb-pcf`)
- Universal XML (`universal-xml`)
- Model Exchange (`model-exchange`)
- Interchange Config (`interchange-config`)
- Support Mapping (`support-mapping-config`)
- Adapter Mapping (`adapter-mapping`)

## Run locally

Serve this folder as a static web root:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080/`.

## External reference interoperability

Engineering Calculations → External Reference Review supports opt-in, read-only inspection of locally supplied EPCC standards-pack JSON and a MatSEng-style piping calculation comparison. No upstream code, proprietary standard tables or unqualified B31.3 factors are bundled. See [read me.txt](read%20me.txt) for exact upstream commit IDs, scope, limitations and usage.

The existing PR #5 Config 8 / Piping Class / 4 Preview B31.3 authority remains the source of truth; the future in-place dimensional audit is scoped in [PR5–PR6 Integration Plan](engineering/external-reference-port/PR5-PR6-INTEGRATION-PLAN.md).

### GLRD Step 4 B31.3 source-unit and Piping Class wall custody (2026-11-17)

The 4 Preview B31.3 calculation reads an exact selected Line List P1 pressure-unit header only when the physical line and P1 numeric value match; unrelated hydro/test pressures, missing headers and conflicting units remain HOLD. After the central B31.3 API calculates required nominal thickness, the exact-DN Piping Class schedule/wall is verified against the pipe-wall master, and only an eligible class wall can form a CALCULATED proposal for explicit Pull. This does not publish screening S/E/W/Y, approve GLRD 30 rows or modify the Python CII converter. [Implementation and GLRD qualification limits](engineering/b313/GLRD-STEP4-P1-CLASS-WALL-SOURCE-FIX-20261117.md).
