#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(ROOT, 'docs', 'Masters', 'b313-material-factor-master.json');
const target = path.join(ROOT, 'converters', 'b313-material-factors', 'default-b313-material-factor-data.js');
const data = JSON.parse(fs.readFileSync(source, 'utf8'));

// This generator is the release boundary: importing/saving a browser draft
// never qualifies a code factor. Only reviewed project source rows with
// traceable evidence may enter the active generated master.
const qualificationErrors = [];
for (const factor of ['S','E','W','Y']) {
  for (const [i, row] of (data.factors?.[factor]?.records || []).entries()) {
    const prefix = `factors.${factor}.records[${i}]`;
    if (!['VERIFIED','PROJECT_APPROVED'].includes(row.status)) continue;
    if (!String(row.sourceAuthority||'').trim()
        || /SCREENING|BENCHMARK|CANDIDATE/i.test(String(row.sourceAuthority))) {
      qualificationErrors.push(`${prefix}: qualified sourceAuthority is missing or screening-only`);
    }
    if (!String(row.sourceReference||'').trim()) {
      qualificationErrors.push(`${prefix}: exact code/table sourceReference required`);
    }
    if (row.status === 'PROJECT_APPROVED' && !String(row.approvalReference||'').trim()) {
      qualificationErrors.push(`${prefix}: controlled project approvalReference required`);
    }
    if (row.edition != null && String(row.edition) !== String(data.edition)) {
      qualificationErrors.push(`${prefix}: record edition differs from master edition`);
    }
    const temp = Number(row.temperatureC), val = Number(row.value);
    if (row.temperatureC === '' || !Number.isFinite(temp)) qualificationErrors.push(`${prefix}: finite temperatureC required`);
    if (!Number.isFinite(val) || (factor !== 'Y' && val <= 0) || (factor === 'Y' && val < 0)
        || (['E','W'].includes(factor) && val > 1)) qualificationErrors.push(`${prefix}: invalid factor value`);
    if (row.temperatureApplicability === 'CONSTANT_RANGE') {
      if (factor === 'S' || row.validFromC == null || row.validToC == null
          || row.validFromC === '' || row.validToC === ''
          || !Number.isFinite(Number(row.validFromC))
          || !Number.isFinite(Number(row.validToC)) || Number(row.validFromC) > Number(row.validToC)) {
        qualificationErrors.push(`${prefix}: invalid qualified temperature range`);
      }
    }
    if (row.interpolationPolicy != null
        && !(row.interpolationPolicy === 'LINEAR_APPROVED' && ['W','Y'].includes(factor))) {
      qualificationErrors.push(`${prefix}: unsupported temperature interpolation policy`);
    }
  }
}
if (qualificationErrors.length) {
  console.error('B31.3 qualified factor master rejected:\n' + qualificationErrors.join('\n'));
  process.exit(1);
}

const runtimeHelpers = `
function expandScreeningBasis(source) {
  const master = JSON.parse(JSON.stringify(source));
  const factors = master.factors || {};
  for (const [basisId, basis] of Object.entries(master.screeningBases || {})) {
    const temperatures = basis.temperaturesC || [];
    for (const [materialId, material] of Object.entries(basis.materials || {})) {
      temperatures.forEach((temperatureC, index) => {
        const common = { materialId, temperatureC, status: basis.status, sourceAuthority: basis.sourceAuthority, basisId };
        const s = material.Sksi?.[index];
        if (s !== null && s !== undefined && s !== '' && Number.isFinite(Number(s))) factors.S.records.push({ ...common, value: Number(s), unit: 'ksi' });
        for (const [manufacturingRoute, value] of Object.entries(material.EByRoute || {})) {
          factors.E.records.push({ ...common, productForm: 'PIPE', manufacturingRoute, value: Number(value) });
        }
        if (basis.commonFactors?.W != null) factors.W.records.push({ ...common, productForm: 'PIPE', value: Number(basis.commonFactors.W) });
        if (basis.commonFactors?.Y != null) factors.Y.records.push({ ...common, productForm: 'PIPE', value: Number(basis.commonFactors.Y) });
      });
    }
  }
  for (const factor of ['S', 'E', 'W', 'Y']) if (factors[factor]) factors[factor].coveragePlaceholders = [];
  return master;
}
`;
const out = '// Generated from docs/Masters/b313-material-factor-master.json. Do not hand-edit.\n\n' +
  'const B313_MATERIAL_FACTOR_SOURCE = Object.freeze(' + JSON.stringify(data) + ');\n' + runtimeHelpers +
  '\nexport const B313_MATERIAL_FACTOR_MASTER = Object.freeze(expandScreeningBasis(B313_MATERIAL_FACTOR_SOURCE));\n';

const mode = process.argv[2] || '--check';
if (mode === '--write') {
  fs.writeFileSync(target, out);
  console.log('Wrote runtime material-factor registry.');
} else {
  if (fs.readFileSync(target, 'utf8') !== out) {
    console.error('B31.3 material factor runtime registry is out of sync.');
    process.exit(1);
  }
  console.log('B31.3 material factor runtime registry matches canonical master.');
}
