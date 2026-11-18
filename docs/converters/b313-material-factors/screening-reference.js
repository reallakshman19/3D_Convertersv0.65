/**
 * Non-authoritative B31.3 reference lookup from the project's EXISTING
 * material-factor master screeningBases. Independent of strict S/E/W/Y.
 *
 * This returns numerical screening E/S/W/Y, interpolation brackets and
 * provenance but NEVER a qualified factor or a Pull-ready result.
 */
import { B313_MATERIAL_FACTOR_MASTER } from './default-b313-material-factor-data.js';

const KSI_TO_MPA = 6.894757293168361;
const finite = value => value !== '' && value !== null && value !== undefined
  && Number.isFinite(Number(value));
const upper = value => String(value ?? '').trim().toUpperCase();
const round = value => Number(Number(value).toFixed(10));

export function lookupB313ScreeningFactors({
  materialId, temperatureC, manufacturingRoute = '', master = B313_MATERIAL_FACTOR_MASTER,
} = {}) {
  const id = String(materialId ?? '').trim();
  const t = Number(temperatureC);
  const context = {
    schema: 'b313-screening-factor-reference/v1',
    authority: 'SCREENING_REFERENCE_ONLY',
    materialId: id,
    temperatureC: finite(temperatureC) ? t : null,
    eligibleForPull: false,
    eligibleForActiveFactorPublication: false,
  };
  if (!id || !finite(temperatureC) || t <= -273.15) {
    return { ...context, ok: false, code: 'SCREENING_MATERIAL_OR_T1_REQUIRED' };
  }
  const editions = Object.entries(master?.screeningBases || {});
  const matching = editions.filter(([, basis]) => basis && basis.materials
    && Object.prototype.hasOwnProperty.call(basis.materials, id));
  if (matching.length !== 1) {
    return { ...context, ok: false, code: 'SCREENING_BASIS_UNAVAILABLE_OR_AMBIGUOUS',
      matchedBasisCount: matching.length };
  }
  const [basisId, basis] = matching[0];
  const material = basis.materials[id];
  const values = Array.isArray(material.Sksi) ? material.Sksi : [];
  const temperatures = Array.isArray(basis.temperaturesC) ? basis.temperaturesC.map(Number) : [];
  const pairs = temperatures.map((temperature, i) => ({
    temperatureC: temperature, Sksi: values[i],
  })).filter(p => Number.isFinite(p.temperatureC) && finite(p.Sksi));
  if (!pairs.length || pairs.length !== values.filter(finite).length
      || new Set(pairs.map(p => p.temperatureC)).size !== pairs.length) {
    return { ...context, ok: false, code: 'SCREENING_STRESS_TABLE_MALFORMED', basisId };
  }
  pairs.sort((a,b) => a.temperatureC - b.temperatureC);
  const exact = pairs.find(p => p.temperatureC === t);
  const lower = pairs.filter(p => p.temperatureC < t).at(-1);
  const upperRow = pairs.find(p => p.temperatureC > t);
  if (!exact && (!lower || !upperRow)) {
    return { ...context, ok: false, code: 'SCREENING_STRESS_OUTSIDE_TABLE_RANGE',
      basisId, availableTemperaturesC: pairs.map(p => p.temperatureC) };
  }
  const bracket = exact ? [exact] : [lower,upperRow];
  const ksi = exact ? Number(exact.Sksi)
    : Number(lower.Sksi) + (Number(upperRow.Sksi) - Number(lower.Sksi))
      * (t - lower.temperatureC) / (upperRow.temperatureC - lower.temperatureC);
  if (!(ksi > 0) || !Number.isFinite(ksi)) {
    return { ...context, ok: false, code: 'SCREENING_STRESS_INVALID', basisId };
  }
  // E is a manufacturing/joint-quality choice, never inferred from Material
  // or temperature. Enumerate alternatives but do not pick an unknown route.
  const routes = Object.entries(material.EByRoute || {})
    .filter(([,v]) => finite(v) && Number(v)>0 && Number(v)<=1)
    .map(([route,v])=>({ route, value:Number(v) }));
  const requestedRoute = upper(manufacturingRoute);
  const selected = routes.find(r => upper(r.route)===requestedRoute) || null;
  const w=Number(basis.commonFactors?.W), y=Number(basis.commonFactors?.Y);
  // The source explicitly supplies common W/Y across its listed range; the
  // bounds are checked here independently of the S interpolation bracket.
  const baseTemps = temperatures.filter(Number.isFinite);
  const within = baseTemps.length && t>=Math.min(...baseTemps) && t<=Math.max(...baseTemps);
  if (!within || !(w>0 && w<=1) || !(y>=0 && y<=1)
      || !finite(basis.commonFactors?.W) || !finite(basis.commonFactors?.Y)) {
    return { ...context, ok:false,code:'SCREENING_COMMON_FACTOR_INVALID_OR_OUTSIDE_RANGE',basisId };
  }
  return {
    ...context, ok: true,
    code: selected ? 'SCREENING_FACTORS_RESOLVED_FOR_ROUTE' : 'SCREENING_ROUTE_SELECTION_REQUIRED',
    basisId,
    basisStatus: basis.status,
    sourceAuthority: basis.sourceAuthority,
    sourceReference: basis.sourceReference,
    editionBasis: basis.editionBasis,
    S: { ksi: round(ksi), MPa: round(ksi*KSI_TO_MPA),
      method: exact?'EXACT':'LINEAR_INTERPOLATION',
      bracket: bracket.map(p=>({temperatureC:p.temperatureC,Sksi:Number(p.Sksi)})) },
    E: selected?.value ?? null,
    selectedRoute: selected?.route ?? null,
    requestedRoute: requestedRoute || null,
    routeOptions: routes,
    W: w, Y: y,
    // This value intentionally can never satisfy the strict active-master path.
    strictQualification: 'NOT_QUALIFIED',
  };
}
