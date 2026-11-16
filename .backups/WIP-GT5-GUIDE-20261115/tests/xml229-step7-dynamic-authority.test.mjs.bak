import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as root from '../converters/xml-cii2019-core/support-kind-precedence.js';
import * as legacy from '../v045/converters/xml-cii2019-core/support-kind-precedence.js';
import * as served from '../docs/converters/xml-cii2019-core/support-kind-precedence.js';
import {migrateSupportMappingConfig as rootConfig,applySupportMappingRowPatch} from '../converters/xml-cii2019-core/support-mapping-config.js';
import {migrateSupportMappingConfig as legacyConfig} from '../v045/converters/xml-cii2019-core/support-mapping-config.js';
import {decorateJsonTraceMember as rootTrace} from '../tabs/xml-cii-2019-standalone/xml-cii-json-trace-fields.js';
import {decorateJsonTraceMember as legacyTrace} from '../v045/tabs/xml-cii-2019-standalone/xml-cii-json-trace-fields.js';
import {runStandaloneSupportTypeMapper as rootMapper} from '../tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js';
import {runStandaloneSupportTypeMapper as legacyMapper} from '../v045/tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js';
import {resolveXmlCiiSupportDescriptor as legacyDescriptor} from '../v045/converters/xml-cii2019-core/support-mapping.js';
import {nativeTestPython} from './helpers/native-python.mjs';
const r=(id,field,match,pattern,kind,priority=1,more={})=>({id,field,match,pattern,kind,priority,source:'staged-json',enabled:true,...more});
const conf=rules=>({supportMapping:{version:2,useJsonForRestraints:true,rules}});
const cases=[
 [{EXTRA_FIELD:'A-93',SUPPORT_KIND:'REST'},conf([r('custom','<extra-field>','regex','^A-\\d+$','LINESTOP')]),'LINESTOP','custom'],
 [{MDSSUPPFUNC:'GT',SUPPORT_KIND:'REST'},conf([r('other','UNKNOWN,MDSSUPPFUNC','equals','GT','GUIDE')]),'GUIDE','other'],
 [{FOO:'ZZ-42'},conf([r('wild','*','startsWith','ZZ-','LINESTOP')]),'LINESTOP','wild'],
 [{FLAG:true},conf([r('bool','ANY','equals','true','GUIDE')]),'GUIDE','bool'],
 [{OTHER:'ABCD'},conf([r('late','OTHER','contains','BC','REST',20),r('early','OTHER','equals','ABCD','GUIDE',2)]),'GUIDE','early'],
 [{OTHER:'ABCD'},conf([r('disabled','OTHER','equals','ABCD','REST',0,{enabled:false}),r('live','OTHER','contains','BC','GUIDE',8)]),'GUIDE','live'],
 [{OTHER:'ABCD'},conf([r('wrong-scope','OTHER','equals','ABCD','REST',0,{source:'rvm'}),r('live','OTHER','equals','ABCD','GUIDE',8)]),'GUIDE','live'],
 [{MDSSUPPTYPE:'ST570',SUPPORT_KIND:'REST'}, {},'LINESTOP','standalone-mds-st-linestop'],
 [{MDSSUPPTYPE:'GT570',SUPPORT_KIND:'REST'},conf([r('builtin-gt5-mds','MDSSUPPTYPE','startsWith','GT5','REST',11)]),'REST','builtin-gt5-mds'],
 [{DTXR:'LINE STOP',SUPPORT_KIND:'REST'}, {},'LINESTOP','builtin-user-limit']
];
test('dynamic named/wildcard/scoped/prioritized fields agree in root, served, v045 and Python',()=>{
  for(const [attrs,config,kind,id] of cases){
    for(const engine of [root,legacy,served]){
      let decision;
      assert.equal(engine.governedSupportKind(attrs,config,undefined,d=>decision=d).kind,kind);
      assert.equal(decision.rule.id,id);
    }
    assert.equal(legacyDescriptor(attrs,config).primaryKind,kind);
  }
  const script=['import sys,json','sys.path.insert(0,"converters/scripts")','import xml229_support_type_mapper as m','d=json.load(sys.stdin)','print(json.dumps([[m.owner_rule_kind(a,c)[0],(m.table_support_decision(a,c) or {}).get("ruleId")] for a,c in d]))'].join('\n');
  const py=JSON.parse(execFileSync(nativeTestPython,['-c',script],{input:JSON.stringify(cases.map(([a,c])=>[a,c])),encoding:'utf8'}));
  assert.deepEqual(py,cases.map(([, ,kind,id])=>[kind,id]));
});
test('display fields cannot hide configured rule evidence; Preview reads the same effective table',()=>{
  for(const [attrs,config,kind,id] of cases){
    for(const [decorate,mapper] of [[rootTrace,rootMapper],[legacyTrace,legacyMapper]]){
      const member=decorate({raw:{attributes:attrs}},{...config,captureFields:['NAME']});
      const out=mapper({supportConfigJson:JSON.stringify(config),resolverJsonTraceResult:{resolvedFacts:[{positionMembers:[member]}]}});
      assert.equal(out.previewRows[0].supportKind,kind,JSON.stringify({attrs,id}));
      assert.equal(out.previewRows[0].matchedAlias,id);
    }
  }
});
test('saved rule field, priority, kind and disabled state survive migration and repeated Test/Save',()=>{
  const cfg={supportMapping:rootConfig({})};
  applySupportMappingRowPatch(cfg,'builtin-user-rest',{priority:3,field:'CUSTOM_1,CUSTOM_2',match:'equals',pattern:'X',kind:'GUIDE'});
  applySupportMappingRowPatch(cfg,'standalone-mds-st-linestop',{priority:777,enabled:false,field:'MDSSUPPFUNC',pattern:'H'});
  const ids=['builtin-user-rest','standalone-mds-st-linestop'];
  const select=c=>c.rules.filter(r=>ids.includes(r.id));
  const expected=select(cfg.supportMapping);
  assert.deepEqual(select(legacyConfig(cfg)),expected);
  for(const mapper of [rootMapper,legacyMapper]){
    const once=mapper({supportConfigJson:JSON.stringify(cfg)});
    const twice=mapper({supportConfigJson:once.supportConfigJson});
    assert.deepEqual(select(JSON.parse(twice.supportConfigJson).supportMapping),expected);
  }
});
test('ties and NODETYPE conflicts fail closed; object values are not coerced into evidence',()=>{
  const tie=conf([r('a','FIELD','equals','X','GUIDE'),r('b','FIELD','equals','X','LINESTOP')]);
  for(const engine of [root,legacy,served]){
    assert.throws(()=>engine.governedSupportKind({FIELD:'X'},tie),/KIND_AMBIGUOUS/);
    assert.throws(()=>engine.governedSupportKind({FIELD:'X',NODETYPE:'9'},conf([r('a','FIELD','equals','X','GUIDE')])),/TYPE_KIND_CONFLICT/);
    assert.equal(engine.governedSupportKind({NESTED:{FIELD:'X'}},conf([r('a','*','contains','X','GUIDE')])).kind,'');
  }
});
