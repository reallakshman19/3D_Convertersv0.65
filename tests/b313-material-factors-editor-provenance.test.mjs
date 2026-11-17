import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {validateB313MaterialFactorsDraft} from '../tabs/b313-material-factors-tab.js';

const validRow={
  materialId:'LTCS-A333-6',productForm:'PIPE',temperatureC:82,
  value:20,unit:'ksi',status:'PROJECT_APPROVED',
  edition:'2024',sourceAuthority:'QUALIFIED-CODE-SOURCE-TEST',
  sourceReference:'ASME B31.3 2024 Appendix A / synthetic test record',
  sourceDocumentSha256:'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  sourceReviewedBy:'TEST-INDEPENDENT-REVIEWER',
  sourceReviewDate:'2026-11-17',sourceRevision:'TEST-SOURCE-REVISION',
  approvalReference:'TEST-ONLY-APPROVAL',
};
const mk=(row,factor='S')=>({
  edition:'2024',families:['LTCS'],
  materials:[{materialId:'LTCS-A333-6',family:'LTCS'}],
  factors:Object.fromEntries(['S','E','W','Y'].map(k=>[k,{records:k===factor?[row]:[]}])),
});
test('Factors editor only permits qualified source-custodied records',()=>{
  assert.equal(validateB313MaterialFactorsDraft(mk(validRow)).ok,true);
  for(const [key,val] of Object.entries({
    edition:'2020',sourceDocumentSha256:'',sourceReviewedBy:'',
    sourceReviewDate:'',sourceRevision:'',sourceReference:'',
    sourceAuthority:'SCREENING_ONLY',approvalReference:'',
  })){
    const bad=validateB313MaterialFactorsDraft(mk({...validRow,[key]:val}));
    assert.equal(bad.ok,false,key+' must fail qualification');
  }
  const e={...validRow,value:1,unit:undefined,manufacturingRoute:'SEAMLESS'};
  assert.equal(validateB313MaterialFactorsDraft(mk(e,'E')).ok,true);
  assert.equal(validateB313MaterialFactorsDraft(mk({...e,manufacturingRoute:''},'E')).ok,false);
  const y={...validRow,value:1.1};
  assert.equal(validateB313MaterialFactorsDraft(mk(y,'Y')).ok,false);
});
test('existing editor exposes source SHA/reviewer/revision without a new Step 4 screen',()=>{
  const src=readFileSync(new URL('../tabs/b313-material-factors-tab.js',import.meta.url),'utf8');
  for(const field of ['sourceDocumentSha256','sourceReviewedBy','sourceReviewDate','sourceRevision','edition'])
    assert.match(src,new RegExp('data-key="'+field+'"'));
  assert.match(src,/Saving a draft does not change the active B31\.3 resolver/);
});
