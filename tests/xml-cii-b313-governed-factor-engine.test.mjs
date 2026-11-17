import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveB313GovernedCodeFactor, resolvePublishedB313CodeFactor,
  B313_GOVERNED_CODE_RULE_PACK } from '../converters/b313-material-factors/code-factor-rule-engine.js';
import { resolveB313DesignFactors } from '../converters/b313-material-factors/index.js';
import { previewB313BasisKey } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';

const common={
  edition:'2024', status:'PROJECT_APPROVED',
  sourceAuthority:'GOVERNED-2024-CODE-CONTROL-TEST',
  sourceReference:'CONTROLLED-CODE-TABLE-TEST-ONLY',
  approvalReference:'INDEPENDENT-TEST-APPROVAL-NOT-PRODUCTION',
  codeClause:'B31.3-SYNTHETIC-TABLE',
  productForm:'PIPE',
  scope:'EXACT_MATERIAL', materialId:'DSS-A790-S31803',
  routeApplicability:'EXACT', manufacturingRoute:'SEAMLESS',
  temperatureApplicability:'CONSTANT_RANGE',validFromC:20,validToC:150,
};
const request={materialId:'DSS-A790-S31803',materialFamily:'DSS',temperatureC:120,
  edition:'2024',productForm:'PIPE',manufacturingRoute:'SEAMLESS'};
test('governed E rule requires code edition, route, source and temperature',()=>{
  const r={...common,factor:'E',value:1,ruleId:'SYNTH-E'};
  const a=resolveB313GovernedCodeFactor({...request,factor:'E',rules:[r]});
  assert.equal(a.ok,true);
  assert.equal(a.value,1);
  assert.equal(a.factorSource.codeClause,'B31.3-SYNTHETIC-TABLE');
  assert.equal(a.factorSource.approvalReference,common.approvalReference);
  for(const bad of [
    {...request,manufacturingRoute:''},
    {...request,manufacturingRoute:'EFW_DOUBLE_BUTT'},
    {...request,temperatureC:151},
    {...request,edition:'2020'},
  ])assert.equal(resolveB313GovernedCodeFactor({...bad,factor:'E',rules:[r]}).ok,false);
  assert.equal(resolveB313GovernedCodeFactor({...request,factor:'E',rules:[{...r,status:'SCREENING'}]}).ok,false);
  assert.equal(resolveB313GovernedCodeFactor({...request,factor:'E',rules:[{...r,sourceReference:''}]}).ok,false);
  assert.equal(resolveB313GovernedCodeFactor({...request,factor:'E',rules:[{...r,approvalReference:''}]}).ok,false);
});
test('governed W/Y material-family scope is explicit and remains fail closed',()=>{
  const r={...common,factor:'Y',value:0.4,scope:'CODE_MATERIAL_FAMILY',
    materialFamily:'DSS',materialId:undefined,familyScopeCodeApproved:true,
    routeApplicability:'ALL_ROUTES_CODE_CONFIRMED',manufacturingRoute:undefined};
  assert.equal(resolveB313GovernedCodeFactor({...request,factor:'Y',rules:[r]}).value,0.4);
  assert.equal(resolveB313GovernedCodeFactor({...request,factor:'Y',
    rules:[{...r,familyScopeCodeApproved:false}]}).ok,false);
  assert.equal(resolveB313GovernedCodeFactor({...request,factor:'Y',
    rules:[{...r,value:2}]}).code,'B313_CODE_RULE_VALUE_INVALID');
  assert.equal(resolveB313GovernedCodeFactor({...request,factor:'Y',
    rules:[r,r]}).code,'B313_RULE_AUTHORITY_AMBIGUOUS');
  assert.equal(resolveB313GovernedCodeFactor({...request,factor:'S',rules:[r]}).code,
    'B313_RULE_FACTOR_UNSUPPORTED','S comes only from approved material stress table');
});
test('no shipped governing code values or screening override can unlock production',()=>{
  assert.equal(B313_GOVERNED_CODE_RULE_PACK.records.length,0);
  assert.equal(resolvePublishedB313CodeFactor({...request,factor:'E'}).ok,false);
  const strict=resolveB313DesignFactors({material:{materialId:'DSS-A790-S31803'},
    designTemperature:120,manufacturingRoute:'SEAMLESS'});
  assert.equal(strict.ok,false);
  assert.equal(strict.code,'B313_FACTOR_DATA_INCOMPLETE');
  assert(strict.details.missing.includes('Y'),'No null-to-zero silent Y');
  const denied=resolveB313DesignFactors({material:{materialId:'DSS-A790-S31803'},
    designTemperature:120,qualificationMode:'strict',acceptedStatuses:['SCREENING']});
  assert.equal(denied.code,'B313_STRICT_STATUS_OVERRIDE_FORBIDDEN');
});
test('physical Preview manual approvals are never shared across branches with the same material and T1',()=>{
  const commonRow={material:'ASTM A790 UNS S31803',t1:'120',pipingClass:'93833',
    materialCode:'183',sizeMm:50};
  const a={...commonRow,branchOccurrenceIndex:0,branchName:'BR-A',lineKey:'L1'};
  const b={...commonRow,branchOccurrenceIndex:1,branchName:'BR-B',lineKey:'L1'};
  const kA=previewB313BasisKey(a,{});
  const kB=previewB313BasisKey(b,{});
  assert.match(kA,/OCCURRENCE:/);
  assert.notEqual(kA,kB);
  assert.notEqual(kA,previewB313BasisKey({...a,sizeMm:80},{}));
  assert.notEqual(kA,previewB313BasisKey({...a,materialCode:'184'},{}));
  assert.equal(previewB313BasisKey(commonRow,{}).includes('OCCURRENCE:'),true,
    'Any physical-scope input must not collapse into shared material+T1 approvals');
});
