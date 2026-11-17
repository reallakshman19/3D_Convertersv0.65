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
