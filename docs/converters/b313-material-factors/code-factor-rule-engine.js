import { B313_GOVERNED_CODE_RULE_PACK } from './default-b313-code-rule-data.js';

const norm = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const present = value => String(value ?? '').trim() !== '';
const validStatus = new Set(['VERIFIED', 'PROJECT_APPROVED']);

/**
 * Pure code-rule evaluator. Rules must be drawn from a controlled pack at the
 * calling boundary. No default E=1, W=1 or Y=0.4; no route inference.
 *
 * Allowed rule scopes are EXACT_MATERIAL and CODE_MATERIAL_FAMILY; a family
 * rule must explicitly state that B31.3 permits that scope. Product form,
 * edition, code applicability and temperature range are always required.
 * E additionally requires an explicit physical manufacturing route.
 */
export function resolveB313GovernedCodeFactor({
  factor, materialId, materialFamily, productForm = 'PIPE',
  manufacturingRoute, temperatureC, edition, rules = [],
} = {}) {
  const f = norm(factor), t = Number(temperatureC), route = norm(manufacturingRoute);
  const id = norm(materialId), family = norm(materialFamily), form = norm(productForm);
  if (!['E','W','Y'].includes(f)) return { ok:false, code:'B313_RULE_FACTOR_UNSUPPORTED' };
  if (!id || !form || !present(temperatureC) || !Number.isFinite(t)
      || t <= -273.15 || !present(edition)) {
    return { ok:false, code:'B313_RULE_CONTEXT_INCOMPLETE' };
  }
  const relevant = (Array.isArray(rules) ? rules : []).filter(r => {
    if (norm(r.factor) !== f || String(r.edition) !== String(edition)
        || !validStatus.has(r.status) || !present(r.sourceAuthority)
        || !present(r.sourceReference) || !present(r.codeClause)
        || /SCREENING|BENCHMARK|CANDIDATE/i.test(String(r.sourceAuthority))
        || (r.status === 'PROJECT_APPROVED' && !present(r.approvalReference))
        || norm(r.productForm) !== form) return false;
    const exactlyScoped = r.scope === 'EXACT_MATERIAL' && norm(r.materialId) === id;
    const groupScoped = r.scope === 'CODE_MATERIAL_FAMILY'
      && r.familyScopeCodeApproved === true && !!family
      && norm(r.materialFamily) === family;
    if (!exactlyScoped && !groupScoped) return false;
    if (r.routeApplicability === 'EXACT') {
      if (!route || norm(r.manufacturingRoute) !== route) return false;
    } else if (r.routeApplicability !== 'ALL_ROUTES_CODE_CONFIRMED') return false;
    // E cannot be inferred without positive evidence of the construction route.
    if (f === 'E' && (!route || r.routeApplicability !== 'EXACT')) return false;
    if (r.temperatureApplicability === 'EXACT_T') return Number(r.temperatureC) === t;
    if (r.temperatureApplicability === 'CONSTANT_RANGE') {
      if (!present(r.validFromC) || !present(r.validToC)) return false;
      const a=Number(r.validFromC), b=Number(r.validToC);
      return Number.isFinite(a)&&Number.isFinite(b)&&a<=t&&t<=b&&a<=b;
    }
    return false; // Never extrapolate or infer an unapproved rule.
  });
  const exact = relevant.filter(r=>r.scope==='EXACT_MATERIAL');
  const matched = exact.length ? exact : relevant;
  if (matched.length > 1) {
    return { ok:false, code:'B313_RULE_AUTHORITY_AMBIGUOUS',
      details:{factor:f,sourceReferences:matched.map(r=>r.sourceReference)} };
  }
  if (!matched.length) {
    return { ok:false, code:f==='E' && !route
      ? 'B313_MANUFACTURING_ROUTE_REQUIRED' : 'B313_QUALIFIED_CODE_RULE_UNAVAILABLE',
      details:{factor:f,materialId:id,materialFamily:family,temperatureC:t} };
  }
  const row=matched[0],value=Number(row.value);
  const valid = Number.isFinite(value) && (f==='Y' ? value>=0 && value<=1 : value>0 && value<=1);
  if (!valid) return {ok:false,code:'B313_CODE_RULE_VALUE_INVALID'};
  return {ok:true,code:'B313_QUALIFIED_CODE_RULE_RESOLVED',factor:f,value,
    factorSource:{
      authority:'GOVERNED_B313_CODE_RULE',status:row.status,
      edition:String(row.edition),codeClause:row.codeClause,
      sourceAuthority:row.sourceAuthority,sourceReference:row.sourceReference,
      approvalReference:row.approvalReference||null,scope:row.scope,
      manufacturingRoute:route||null,productForm:form,
      temperatureC:t,temperatureApplicability:row.temperatureApplicability,
      ruleId:row.ruleId||null,
    }};
}

/** Runtime path uses ONLY repository-published code rules; never caller data. */
export function resolvePublishedB313CodeFactor(context = {}) {
  if (String(context.edition) !== String(B313_GOVERNED_CODE_RULE_PACK.edition)) {
    return {ok:false,code:'B313_CODE_EDITION_RULE_PACK_MISMATCH'};
  }
  return resolveB313GovernedCodeFactor({...context,rules:B313_GOVERNED_CODE_RULE_PACK.records});
}
export { B313_GOVERNED_CODE_RULE_PACK };
