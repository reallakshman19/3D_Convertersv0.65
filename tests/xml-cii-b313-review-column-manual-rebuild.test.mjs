import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPreviewB313BasisWallCells} from
  '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-auto-basis.js';
import {installModeAIndividualPreviewToolVisibility} from
  '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-individual-preview-tools.js';
import {suggestManualPreviewRebuild} from
  '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer.js';

const read=name=>readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/'+name,import.meta.url),'utf8');
const row=(i,pressure='13001')=>({
  branchName:'/GLRD-1000-4"-P4110001-93833-01/B'+i,
  branchOccurrenceIndex:i,lineKey:'P4110001',
  sizeMm:150,pipingClass:'93833',material:'DSS',
  materialSource:'process-linelist-material',
  t1:'120',t1Source:'linelist',p1:pressure,p1Source:'linelist',
  p1Unit:'',p1UnitSource:'unresolved',corrosion:'0',lineMiss:false,
  pipingClassPipeDnMm:150,pipingClassPipeSourceRow:93833,
  pipingClassPipeWallMm:7.112,pipingClassPipeSchedule:'40S',
  pipingClassPipeMaterial:'ASTM A790 UNS S31803',
});
const cfg=unit=>({b313WallUpdate:{commonPressureUnitFallback:unit,bases:{},
  proposalsByBranch:{},acceptedWallByBranch:{},
  millTolerance:{basis:'percent',value:12.5}}});

test('basis wall column is read-only and requires explicit common P1 unit',()=>{
  const base=row(0), saved=JSON.stringify(base);
  const missing=buildPreviewB313BasisWallCells([base],cfg('AUTO'));
  const without=[...missing.values()][0][0].result;
  assert.equal(without.ok,false);
  const c=cfg('KPA');
  const withUnit=buildPreviewB313BasisWallCells([base],c);
  const result=[...withUnit.values()][0][0].result;
  assert.equal(result.ok,true,JSON.stringify(result));
  assert(Number(result.requiredNominalThicknessMm)>0);
  assert.equal(result.pressureUnitAssumed,true);
  assert.equal(result.pressureUnitSource,'B313_COMMON_PRESSURE_UNIT_FALLBACK');
  assert.equal(result.eligibleForPull,false);
  assert.equal(JSON.stringify(base),saved,'calculation must not modify Preview row');
  assert.deepEqual(c.b313WallUpdate.proposalsByBranch,{});
  assert.deepEqual(c.b313WallUpdate.acceptedWallByBranch,{});
});

test('two independent physical Preview occurrences are not collapsed into one wall result',()=>{
  const rows=[row(0,'13001'),row(1,'701.3')];
  const all=[...buildPreviewB313BasisWallCells(rows,cfg('KPA')).values()].flat();
  assert.deepEqual(all.map(x=>x.rowIndex),[0,1]);
  assert.equal(all.length,2);
  assert(all.every(x=>x.result.ok&&x.result.eligibleForPull===false));
  assert.notEqual(all[0].result.requiredNominalThicknessMm,
    all[1].result.requiredNominalThicknessMm,'different P1 cannot share a wall value');
});

test('same B31.3 panel renders calculated wall column and labels source assumptions',()=>{
  const source=read('xml-cii-adapted-preview-b313-auto-basis.js');
  assert.match(source,/Calculated wall \(mm\)/);
  assert.match(source,/data-b313-auto-calculated-wall/);
  assert.match(source,/read-only|required nominal|Read-only/i);
  assert.match(source,/WHAT-IF · common P1/);
  assert.match(source,/refreshCalculatedWallPanelCells\(panel,host,config,liveRows\)/);
  assert.doesNotMatch(source,/data-b313-auto-wall-apply/i);
});

test('Mode A Preview expansion never calls Build/Rebuild under any timing',()=>{
  let clicks=0;
  const summary={textContent:'Preview / Review',children:[],
    appendChild(node){this.children.push(node);}};
  const doc={createElement:()=>({dataset:{},style:{}})};
  const details={open:true,dataset:{},ownerDocument:doc,
    querySelector:(q)=>q==='summary'?summary:q==='[data-mc-preview-build]'?
      {click(){clicks++;}}:null};
  const workspace={querySelectorAll:()=>[details]};
  assert.equal(installModeAIndividualPreviewToolVisibility(workspace),true);
  assert.equal(installModeAIndividualPreviewToolVisibility(workspace),false);
  assert.equal(clicks,0);
  assert.equal(summary.children.length,1);
  assert.match(summary.children[0].textContent,/Manual Build\/Rebuild Preview/);
  const source=read('xml-cii-adapted-mode-a-individual-preview-tools.js');
  assert.doesNotMatch(source,/\.click\(\)/);
  assert.doesNotMatch(source,/MutationObserver|setTimeout/);
});

test('saved changes show a descriptive status and invalidate stale B31.3 Pull',()=>{
  const created=[];
  const host={dataset:{},ownerDocument:{createElement:()=>{
    const o={dataset:{},style:{},setAttribute(k,v){this[k]=v;}};
    created.push(o);return o;}},
  querySelector:()=>created[0]||null,
  prepend(){}};
  suggestManualPreviewRebuild(host,'Branch mappings saved.');
  assert.equal(host.dataset.mcB313PreviewDirty,'true');
  assert.equal(host.dataset.mcPreviewNeedsRebuild,'true');
  assert.match(created[0].textContent,/Preview needs rebuilding/);
  assert.match(created[0].textContent,/Select Rebuild Preview to apply changes/);
  assert.equal(created[0].role,'status');
  assert.equal(created[0]['aria-live'],'polite');
});

test('B31.3 and Preview served mirrors match changed source and no implicit rebuild remains',()=>{
  for(const name of [
    'xml-cii-adapted-preview-b313-auto-basis.js',
    'xml-cii-adapted-preview-renderer.js',
    'xml-cii-adapted-preview-renderer-v7.js',
    'xml-cii-adapted-mode-a-individual-preview-tools.js',
    'xml-cii-adapted-mode-a-consolidated-easy-ui-hook.js',
  ]){
    const served=readFileSync(new URL('../docs/tabs/xml-cii-2019-standalone/ui-adapted/'+name,import.meta.url),'utf8');
    assert.equal(read(name),served,name+' served mismatch');
  }
  const v7=read('xml-cii-adapted-preview-renderer-v7.js');
  assert.match(v7,/suggestManualPreviewRebuild\(host,ratingFetchMessage\(result\)\)/);
  const hook=read('xml-cii-adapted-mode-a-consolidated-easy-ui-hook.js');
  assert.doesNotMatch(hook,/scheduleRebuild\(build\)|build\.click\(\)/);
});
