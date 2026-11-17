import assert from 'node:assert/strict';
import { inferPreviewPressureUnit } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';

const config = {
  linelist: {
    masterRows: [
      {
        'Line number': 'P4110001',
        'Pressure Max kPa(g)': 5110,
      },
    ],
    fieldMap: {},
  },
};

const inferred = inferPreviewPressureUnit(
  { lineKey: 'P4110001', p1: '5110', p1Source: 'linelist' },
  config,
  { pressureUnit: 'pascal' },
  { pressureUnit: 'AUTO' },
);
assert.equal(inferred.unit, 'KPA');
assert.equal(inferred.source, 'line-list-column:Pressure Max kPa(g)');

const explicit = inferPreviewPressureUnit(
  { lineKey: 'P4110001', p1: '5110', p1Source: 'linelist' },
  config,
  { pressureUnit: 'pascal' },
  { pressureUnit: 'BARG' },
);
assert.equal(explicit.unit, '', 'controlled basis cannot contradict source P1 unit without resolving the source conflict');
assert.equal(explicit.source, 'P1_UNIT_AUTHORITIES_CONFLICT');

const unresolved = inferPreviewPressureUnit(
  { lineKey: 'UNKNOWN', p1: '10', p1Source: 'default' },
  { linelist: { masterRows: [], fieldMap: {} } },
  { pressureUnit: 'pascal' },
  { pressureUnit: 'AUTO' },
);
assert.equal(unresolved.unit, '');
assert.equal(unresolved.source, 'unresolved');


// GLRD-like source P1 value may inherit KPA *only* from same exact line,
// same numeric design/maximum P1, and an explicit unit-bearing header.
const strictHeader={linelist:{masterRows:[
  {'Line number':'P4110001','Pressure Max kPa(g)':13001,'Hydro test pressure MPa':22905},
  {'Line number':'P4110003','Pressure Max kPa(g)':13100},
]}};
const srcRow={lineKey:'P4110001',p1:'13001',p1Source:'process-linelist-material'};
const strict=inferPreviewPressureUnit(srcRow,strictHeader,null,{},true);
assert.equal(strict.unit,'KPA');
assert.equal(strict.source,'line-list-column:Pressure Max kPa(g)');
assert.equal(inferPreviewPressureUnit({...srcRow,p1:'13002'},strictHeader,null,{},true).unit,'');
assert.equal(inferPreviewPressureUnit({...srcRow,p1Source:'xml'},strictHeader,null,{},true).unit,'');
assert.equal(inferPreviewPressureUnit({...srcRow,lineKey:'NOT-THERE'},strictHeader,null,{},true).unit,'');
const hydroOnly={linelist:{masterRows:[{'Line number':'P4110001','Hydro test pressure kPa(g)':13001}]}};
assert.equal(inferPreviewPressureUnit(srcRow,hydroOnly,null,{},true).unit,'');
const conflictingSource={linelist:{masterRows:[{'Line number':'P4110001',
  'Design P1 kPa':13001,'Maximum pressure PSIG':13001}]}};
assert.equal(inferPreviewPressureUnit(srcRow,conflictingSource,null,{},true).source,
  'LINE_LIST_P1_UNIT_CONFLICT');

console.log('XML/CII Preview B31.3 pressure-unit custody checks passed.');
