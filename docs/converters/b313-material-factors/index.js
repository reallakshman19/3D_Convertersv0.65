import { B313_MATERIAL_FACTOR_MASTER } from './default-b313-material-factor-data.js';
import { calculateB313Thickness } from '../b313-thickness/index.js';
import { resolvePublishedB313CodeFactor, B313_GOVERNED_CODE_RULE_PACK } from './code-factor-rule-engine.js';
import { selectRequiredPipeWall } from '../pipe-wall-master/index.js';

const KSI_TO_MPA = 6.894757293168361;
const KNOWN_FAMILIES = new Set(B313_MATERIAL_FACTOR_MASTER.families || []);
function norm(value){return String(value??'').trim().toUpperCase().replace(/[._]+/g,' ').replace(/\s+/g,' ');}
const FAMILY_ALIASES = new Map(Object.entries(B313_MATERIAL_FACTOR_MASTER.familyAliases||{}).map(([k,v])=>[norm(k),v]));
function fail(code,message,details={}){return{ok:false,code,message,details};}
export function normalizeB313MaterialFamily(value){const key=norm(value);if(!key)return null;if(KNOWN_FAMILIES.has(key))return key;return FAMILY_ALIASES.get(key)||null;}
function aliasesFor(row){return new Set([row.materialId,row.spec,row.grade,row.uns,...(row.aliases||[])].filter(Boolean).map(norm));}
export function resolveB313MaterialIdentity(input={}){
 const material=input.material&&typeof input.material==='object'?input.material:input;
 const requestedId=norm(material.materialId||material.id), requestedName=norm(material.name||material.materialName||material.specGrade||material.spec), requestedGrade=norm(material.grade), requestedFamily=normalizeB313MaterialFamily(material.family||material.materialFamily||material.category);
 let matches=B313_MATERIAL_FACTOR_MASTER.materials||[];
 if(requestedId)matches=matches.filter(r=>norm(r.materialId)===requestedId);
 else if(requestedName)matches=matches.filter(r=>{const a=aliasesFor(r);if(a.has(requestedName))return !requestedGrade||a.has(requestedGrade)||norm(r.grade)===requestedGrade;return a.has(`${requestedName} ${requestedGrade}`.trim());});
 else if(requestedFamily)matches=matches.filter(r=>r.family===requestedFamily); else return fail('MATERIAL_IDENTITY_REQUIRED','Provide materialId, material name/spec, or material family.');
 if(matches.length===0)return fail('B313_MATERIAL_NOT_FOUND','No material identity matched the request.',{requestedId,requestedName,requestedGrade,requestedFamily});
 if(matches.length>1){const defaults=matches.filter(r=>r.defaultForFamily===true);if(requestedFamily&&defaults.length===1&&input.allowProjectFamilyDefault===true)matches=defaults;else return fail('B313_MATERIAL_AMBIGUOUS','Material request matches multiple identities.',{candidates:matches.map(r=>r.materialId)});}
 return{ok:true,code:'B313_MATERIAL_RESOLVED',material:{...matches[0]},resolution:requestedFamily&&!requestedId&&!requestedName?'FAMILY':'EXACT'};
}
function acceptedStatuses(mode,explicit){if(Array.isArray(explicit)&&explicit.length)return new Set(explicit);if(mode==='benchmark')return new Set(['VERIFIED','PROJECT_APPROVED','BENCHMARK_ONLY']);if(mode==='screening')return new Set(['VERIFIED','PROJECT_APPROVED','BENCHMARK_ONLY','SCREENING']);return new Set(['VERIFIED','PROJECT_APPROVED']);}
function tempC(input){const raw=input.designTemperature??input.temperature??input.temperatureC;if(String(raw??'').trim()==='')return null;const n=Number(raw);if(!Number.isFinite(n))return null;const u=norm(input.temperatureUnit||(input.temperatureC!==undefined?'C':'C'));if(u==='C'||u==='CELSIUS')return n;if(u==='F'||u==='FAHRENHEIT')return(n-32)*5/9;return null;}
function exact(records,id,t,statuses,extra={}){
 let matches=(records||[]).filter(r=>r.materialId===id&&Math.abs(Number(r.temperatureC)-t)<=1e-9&&statuses.has(r.status));
 for(const [key,value] of Object.entries(extra)){
  if(value){const specific=matches.filter(r=>r[key]&&norm(r[key])===norm(value));matches=specific.length?specific:matches.filter(r=>!r[key]);}
  else matches=matches.filter(r=>!r[key]);
 }
 return matches[0];
}
function stressMPa(record){if(!record)return null;const v=Number(record.value),u=norm(record.unit||'MPA');if(!(v>0))return null;return u==='KSI'?v*KSI_TO_MPA:u==='MPA'?v:null;}

/**
 * Qualified temperature-resolution rule for one already identified material.
 * A source row is usable only if its qualification and product/route identity
 * match. Exact rows win. Only S may be linearly interpolated by default under
 * B31.3 Table A-1/A-1C rules; W/Y require an EXPLICIT code-reviewed
 * LINEAR_APPROVED policy on both source records. E and all other constant
 * intervals require a qualified range record. Never extrapolate.
 *
 * This pure helper accepts synthetic records so the code rule can be
 * independently tested without adding fictitious approved records to master.
 */
export function resolveB313QualifiedTemperatureFactor({
  factor, records = [], materialId, temperatureC, manufacturingRoute = '',
  productForm = 'PIPE', allowedStatuses = ['VERIFIED','PROJECT_APPROVED'],
  edition = '2024',
} = {}) {
  const f = norm(factor), t = Number(temperatureC), id = String(materialId || '');
  if (!['S','E','W','Y'].includes(f) || String(temperatureC ?? '').trim() === '' || !Number.isFinite(t) || !id) return null;
  const statuses = new Set(allowedStatuses);
  const route = norm(manufacturingRoute);
  const candidates = records.filter(row => row.materialId === id
    && statuses.has(row.status)
    // Status alone never qualifies a factor. Retain a traceable code source;
    // project-approved rows also need an explicit approval reference.
    && String(row.sourceAuthority || '').trim()
    && String(row.sourceReference || '').trim()
    && !/SCREENING|BENCHMARK|CANDIDATE/i.test(String(row.sourceAuthority))
    && (row.status !== 'PROJECT_APPROVED' || String(row.approvalReference || '').trim())
    && (row.edition == null || String(row.edition) === String(edition))
    && (!row.productForm || norm(row.productForm) === norm(productForm)));
  const routeRows = candidates.filter(row => !row.manufacturingRoute || (route && norm(row.manufacturingRoute) === route));
  // When there are explicit route-specific records, do not silently use one
  // for a missing/unknown route. Generic records remain valid if supplied.
  function preferRoute(rows) {
    const specific = route ? rows.filter(row => row.manufacturingRoute && norm(row.manufacturingRoute) === route) : [];
    return specific.length ? specific : rows.filter(row => !row.manufacturingRoute);
  }
  function unique(rows) {
    if (rows.length !== 1) return null; // duplicate or conflicting authority: HOLD
    const row = rows[0];
    const value = f === 'S' ? stressMPa(row) : Number(row.value);
    return Number.isFinite(value) && (f === 'Y' ? value >= 0 : value > 0) ? row : null;
  }
  const exactMatches = preferRoute(routeRows.filter(row => Number(row.temperatureC) === t));
  const eq = unique(exactMatches);
  if (eq) return { record: eq, resolution: 'EXACT_QUALIFIED', sourceTemperaturesC: [t] };
  if (exactMatches.length) return null; // invalid/ambiguous exact rows block interpolation
  const intervals = preferRoute(routeRows.filter(row =>
    row.temperatureApplicability === 'CONSTANT_RANGE'
    && row.validFromC !== '' && row.validFromC != null
    && row.validToC !== '' && row.validToC != null
    && Number.isFinite(Number(row.validFromC)) && Number.isFinite(Number(row.validToC))
    && Number(row.validFromC) <= t && t <= Number(row.validToC)));
  const within = unique(intervals);
  if (within && f !== 'S') return {
    record: { ...within, temperatureC: t, resolution: 'QUALIFIED_CONSTANT_RANGE',
      sourceTemperaturesC: [Number(within.validFromC), Number(within.validToC)] },
    resolution: 'QUALIFIED_CONSTANT_RANGE',
    sourceTemperaturesC: [Number(within.validFromC), Number(within.validToC)],
  };
  if (intervals.length) return null;
  if (!['S','W','Y'].includes(f)) return null;
  const temps = [...new Set(routeRows.map(row => Number(row.temperatureC)).filter(Number.isFinite))].sort((a,b)=>a-b);
  const lowerT = temps.filter(n => n < t).at(-1), upperT = temps.find(n => n > t);
  if (lowerT === undefined || upperT === undefined) return null; // no extrapolation
  const low = unique(preferRoute(routeRows.filter(row => Number(row.temperatureC) === lowerT)));
  const high = unique(preferRoute(routeRows.filter(row => Number(row.temperatureC) === upperT)));
  if (!low || !high || !low.sourceAuthority || low.sourceAuthority !== high.sourceAuthority) return null;
  if (low.status !== high.status || String(low.approvalReference || '') !== String(high.approvalReference || '')) return null;
  if (String(low.edition || edition) !== String(high.edition || edition)) return null;
  if (norm(low.productForm || productForm) !== norm(high.productForm || productForm)) return null;
  if (norm(low.manufacturingRoute || '') !== norm(high.manufacturingRoute || '')) return null;
  if (f !== 'S' && (low.interpolationPolicy !== 'LINEAR_APPROVED' || high.interpolationPolicy !== 'LINEAR_APPROVED')) return null;
  const lowValue = f === 'S' ? stressMPa(low) : Number(low.value);
  const highValue = f === 'S' ? stressMPa(high) : Number(high.value);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)
      || (f !== 'Y' && (lowValue <= 0 || highValue <= 0))
      || (f === 'Y' && (lowValue < 0 || highValue < 0))) return null;
  const value = lowValue + (highValue - lowValue) * (t - lowerT) / (upperT - lowerT);
  const record = { ...low, temperatureC: t, value, ...(f === 'S' ? {unit:'MPa'} : {}),
    resolution: 'LINEAR_QUALIFIED', sourceTemperaturesC: [lowerT,upperT],
    sourceRecords: [low.sourceReference || low.recordId || '', high.sourceReference || high.recordId || ''] };
  return { record, resolution: 'LINEAR_QUALIFIED', sourceTemperaturesC: [lowerT,upperT] };
}

export function resolveB313DesignFactors(input={}){
 const identity=resolveB313MaterialIdentity(input);if(!identity.ok)return identity;const t=tempC(input);if(t==null)return fail('INVALID_DESIGN_TEMPERATURE','A finite design temperature in C or F is required.');
 const mode=String(input.qualificationMode||'strict').toLowerCase();
 if(mode==='strict' && Array.isArray(input.acceptedStatuses))return fail('B313_STRICT_STATUS_OVERRIDE_FORBIDDEN',
   'Strict source qualification cannot be overridden by caller-supplied acceptedStatuses.');
 const statuses=acceptedStatuses(mode,input.acceptedStatuses),id=identity.material.materialId;
 const route=input.manufacturingRoute||input.material?.manufacturingRoute
   ||(mode!=='strict'&&id==='CS-A106-B'?'SEAMLESS':null);
 const f=B313_MATERIAL_FACTOR_MASTER.factors;
 const strict=mode==='strict';
 const resolve=(factor)=>strict
   ? resolveB313QualifiedTemperatureFactor({factor,records:f[factor].records,materialId:id,temperatureC:t,manufacturingRoute:route,productForm:identity.material.productForm||'PIPE',edition:B313_MATERIAL_FACTOR_MASTER.edition})?.record
   : exact(f[factor].records,id,t,statuses,factor==='E'||factor==='W'?{manufacturingRoute:route}:{});
 const sr=resolve('S'),er=resolve('E'),wr=resolve('W'),yr=resolve('Y'),o=input.factorOverrides||input.factors||{};
 // Code tables may supply qualified E/W/Y rules across valid temperature
 // ranges, but only from the published, edition-specific, source-verified pack.
 // Caller-provided rule arrays are intentionally ignored.
 const rule=(factor)=>strict?resolvePublishedB313CodeFactor({
   factor,materialId:id,materialFamily:identity.material.family,
   productForm:identity.material.productForm||'PIPE',
   manufacturingRoute:route,temperatureC:t,edition:B313_MATERIAL_FACTOR_MASTER.edition,
 }):null;
 const rE=rule('E'),rW=rule('W'),rY=rule('Y');
 const conflicts=[['E',er,rE],['W',wr,rW],['Y',yr,rY]].filter(([key,record,ru])=>
   record&&ru?.ok&&Math.abs(Number(record.value)-Number(ru.value))>1e-12);
 if(conflicts.length)return fail('B313_FACTOR_AUTHORITY_CONFLICT',
   'Qualified material-factor data and governed code-rule data disagree; resolve sources before calculation.',
   {factors:conflicts.map(x=>x[0]),materialId:id,temperatureC:t});
 const S=o.allowableStressMPa??o.S??stressMPa(sr),
   E=o.qualityFactorE??o.E??er?.value??(rE?.ok?rE.value:null),
   W=o.weldStrengthReductionW??o.W??wr?.value??(rW?.ok?rW.value:null),
   Y=o.coefficientY??o.Y??yr?.value??(rY?.ok?rY.value:null),missing=[];
 if(!(Number(S)>0))missing.push('S');
 if(!(Number(E)>0))missing.push('E');
 if(!(Number(W)>0))missing.push('W');
 if(Y===null||Y===undefined||!Number.isFinite(Number(Y))||Number(Y)<0||Number(Y)>1)missing.push('Y');
 const sources={
   S:o.allowableStressMPa!==undefined||o.S!==undefined?{authority:'CALLER_OVERRIDE'}:sr?{...sr}:null,
   E:o.qualityFactorE!==undefined||o.E!==undefined?{authority:'CALLER_OVERRIDE'}:er?{...er}:rE?.ok?rE.factorSource:null,
   W:o.weldStrengthReductionW!==undefined||o.W!==undefined?{authority:'CALLER_OVERRIDE'}:wr?{...wr}:rW?.ok?rW.factorSource:null,
   Y:o.coefficientY!==undefined||o.Y!==undefined?{authority:'CALLER_OVERRIDE'}:yr?{...yr}:rY?.ok?rY.factorSource:null,
 };
 if(missing.length)return fail('B313_FACTOR_DATA_INCOMPLETE','Material identity resolved, but one or more design factors are unavailable at this temperature/qualification level.',{material:identity.material,temperatureC:t,missing,qualificationMode:mode});
 return{ok:true,code:'B313_FACTORS_RESOLVED',material:identity.material,temperatureC:t,qualificationMode:mode,factors:{allowableStressMPa:Number(S),qualityFactorE:Number(E),weldStrengthReductionW:Number(W),coefficientY:Number(Y)},factorSources:sources,designAuthority:Object.values(sources).every(s=>s?.status==='VERIFIED'||s?.status==='PROJECT_APPROVED')};
}
export function getB313MaterialFactorCoverage(){const f=B313_MATERIAL_FACTOR_MASTER.factors;return(B313_MATERIAL_FACTOR_MASTER.materials||[]).map(m=>({materialId:m.materialId,family:m.family,hasS:f.S.records.some(r=>r.materialId===m.materialId),hasE:f.E.records.some(r=>r.materialId===m.materialId),hasW:f.W.records.some(r=>r.materialId===m.materialId),hasY:f.Y.records.some(r=>r.materialId===m.materialId)}));}
export function calculateB313MaterialDesign(input={}){
 const fr=resolveB313DesignFactors(input);if(!fr.ok)return fr;const q=fr.factors,calc=calculateB313Thickness({...input,allowableStress:q.allowableStressMPa,stressUnit:'MPa',qualityFactorE:q.qualityFactorE,weldStrengthReductionW:q.weldStrengthReductionW,coefficientY:q.coefficientY});if(!calc.ok)return{...calc,materialFactors:fr};
 const wants=input.selectPipeWall!==false&&(input.dn!=null||input.nps!=null);if(!wants)return{ok:true,code:'B313_MATERIAL_DESIGN_CALCULATED',materialFactors:fr,calculation:calc};const standard=input.dimensionStandard||input.pipeDimensionStandard;if(!standard)return{ok:false,code:'PIPE_DIMENSION_STANDARD_REQUIRED',message:'Pipe-wall selection requires an explicit dimensionStandard/pipeDimensionStandard; material family does not imply B36.10M or B36.19M.',materialFactors:fr,calculation:calc};
 const wall=selectRequiredPipeWall({dimensionStandard:standard,dn:input.dn,nps:input.nps,requiredNominalThicknessMm:calc.requiredNominalThicknessMm});return{ok:wall.ok,code:wall.ok?'B313_MATERIAL_DESIGN_AND_WALL_SELECTED':wall.code,materialFactors:fr,calculation:calc,pipeWall:wall};
}
export { B313_MATERIAL_FACTOR_MASTER, B313_GOVERNED_CODE_RULE_PACK };
