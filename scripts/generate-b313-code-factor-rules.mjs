import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'docs/Masters/b313-code-factor-rules.json');
const targets = [
  path.join(root, 'converters/b313-material-factors/default-b313-code-rule-data.js'),
  path.join(root, 'docs/converters/b313-material-factors/default-b313-code-rule-data.js'),
];
const pack = JSON.parse(fs.readFileSync(source, 'utf8'));
if (pack.schema !== 'b313-code-factor-rules/v1' || pack.standard !== 'ASME B31.3'
    || !/^20\d{2}$/.test(String(pack.edition)) || !Array.isArray(pack.records)) {
  throw new Error('Invalid governed B31.3 code-rule pack schema/edition');
}
const unique = new Set();
for (const [i,r] of pack.records.entries()) {
  const label = `rules[${i}]`;
  if (!['E','W','Y'].includes(r.factor)
      || !['VERIFIED','PROJECT_APPROVED'].includes(r.status)
      || !['EXACT_MATERIAL','CODE_MATERIAL_FAMILY'].includes(r.scope)
      || (r.scope === 'EXACT_MATERIAL' && !r.materialId)
      || (r.scope === 'CODE_MATERIAL_FAMILY' && (!r.materialFamily || r.familyScopeCodeApproved !== true))
      || !r.productForm || !r.sourceAuthority || !r.sourceReference || !r.codeClause
      || !/^[a-f0-9]{64}$/i.test(String(r.sourceDocumentSha256||''))
      || !String(r.sourceReviewedBy||'').trim()
      || !/^20\d{2}-\d{2}-\d{2}$/.test(String(r.sourceReviewDate||''))
      || !String(r.sourceRevision||'').trim()
      || /SCREENING|BENCHMARK|CANDIDATE/i.test(String(r.sourceAuthority))
      || String(r.edition) !== String(pack.edition)
      || (r.status === 'PROJECT_APPROVED' && !r.approvalReference)
      || !Number.isFinite(Number(r.value)) || Number(r.value)<0 || Number(r.value)>1
      || (r.factor !== 'Y' && Number(r.value)===0)) {
    throw new Error(`${label}: invalid source-qualified rule, scope, factor, approval or edition`);
  }
  if (r.routeApplicability !== 'EXACT' && r.routeApplicability !== 'ALL_ROUTES_CODE_CONFIRMED') {
    throw new Error(`${label}: explicit code-approved route applicability required`);
  }
  if ((r.factor === 'E' && r.routeApplicability !== 'EXACT')
      || (r.routeApplicability === 'EXACT' && !r.manufacturingRoute)) {
    throw new Error(`${label}: exact manufacturing route evidence required`);
  }
  if (r.temperatureApplicability === 'EXACT_T') {
    if (r.temperatureC === '' || r.temperatureC == null || !Number.isFinite(Number(r.temperatureC))) {
      throw new Error(`${label}: exact temperature invalid`);
    }
  } else if (r.temperatureApplicability === 'CONSTANT_RANGE') {
    if (r.validFromC == null || r.validToC == null || r.validFromC === '' || r.validToC === ''
        || !Number.isFinite(Number(r.validFromC)) || !Number.isFinite(Number(r.validToC))
        || Number(r.validFromC)>Number(r.validToC)) throw new Error(`${label}: invalid temperature interval`);
  } else throw new Error(`${label}: unsupported temperature applicability`);
  const key=JSON.stringify([r.factor,r.edition,r.scope,r.materialId,r.materialFamily,r.productForm,
    r.routeApplicability,r.manufacturingRoute,r.temperatureApplicability,r.temperatureC,r.validFromC,r.validToC]);
  if(unique.has(key))throw new Error(`${label}: duplicate rule scope`);
  unique.add(key);
}
const expected="// GENERATED from docs/Masters/b313-code-factor-rules.json. Do not edit by hand.\n// An empty approved rule pack intentionally cannot supply any E/W/Y.\n"+
  'export const B313_GOVERNED_CODE_RULE_PACK = Object.freeze('+JSON.stringify(pack,null,2)+');\n';
const mode=process.argv.includes('--write')?'write':'check';
for(const target of targets) {
  if(mode==='write')fs.writeFileSync(target,expected);
  else if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==expected)
    throw new Error('Code-factor rule pack mismatch: '+path.relative(root,target));
}
console.log('B31.3 governed code-rule pack '+mode+' PASS ('+pack.records.length+' approved rule rows)');
