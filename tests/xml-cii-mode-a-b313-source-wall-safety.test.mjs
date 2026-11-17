import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(
  new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-dtxr.js',import.meta.url),
  'utf8');
const stripped=source
  .replace(/^import\s+[\s\S]*?;\s*$/gm,'')
  .replace(/\bexport (?=(?:function|const|class)\b)/g,'');

function harness(overrides, previewResult, buildReport) {
  const state={sources:{S1:{sourceText:'SOURCE1',supportConfigJson:JSON.stringify({
    overrides,
    b313WallUpdate:{bases:{},proposalsByBranch:{}}
  })}}};
  const context={
    modeAExecutionRows:()=>[{source:{sourceId:'S1',fileName:'one.xml'},state:{
      sourceText:'SOURCE1',stagedJsonText:'',supportConfigJson:state.sources.S1.supportConfigJson
    }}],
    createModeASourceProcessingRef:(_ref,id)=>({
      get current(){return state.sources[id];},
      set current(value){state.sources[id]=value;}
    }),
    xmlCiiEnrichedConfigFromState:entry=>JSON.parse(entry.supportConfigJson),
    xmlCiiDryRunPreview:()=>previewResult,
    _dtxrWallCandidateIndex:()=>({available:1,index:{}}),
    _dtxrWallCandidateForRow:()=>({value:'7.112'}),
    _classSizeKey:row=>row.wallThicknessKey,
    buildPreviewB313WallUpdateReport:buildReport,
    applyPreviewDtxrRatingOverrides:()=>({applied:0,cleared:0,conflicts:0,missing:0,manualProtected:0}),
    modeARawRef:ref=>ref,
    modeARawState:ref=>ref.current,
    replaceModeAState:(ref,next)=>{ref.current=next;},
    B313_PREVIEW_ACTION_LABEL:'Update wall thickness as per B31.3 Sec II',
    document:{}, console,
  };
  const result=runInNewContext(stripped+
    '\n({applyModeAConsolidatedDtxrWall,applyModeAConsolidatedB313Wall})',context);
  return {state, api:result};
}

test('Mode A B31.3 consumes source-local node ledger and persists proposals without Pull',()=>{
  const row={branchName:'A',lineKey:'L1',wallThicknessKey:'L1'};
  const preview={branchRows:[row],nodeBoreWallRows:[{
    branchOccurrenceIndex:0,nodeOrdinal:0,outsideDiameterMm:168.3
  }]};
  let receivedLedger=false;
  const h=harness({wallThickness:{L1:'10.97'}},preview,({rows,config,host})=>{
    receivedLedger=host.__xmlCiiPreviewResult.nodeBoreWallRows[0].outsideDiameterMm===168.3;
    assert.equal(rows.length,1);
    assert.equal(host.dataset.mcB313PreviewDirty,undefined);
    config.b313WallUpdate.proposalsByBranch['0']={nominalWallMm:7.112};
    return {summary:{inputRows:1,calculatedRows:1,updatedRows:0,skippedRows:0},rows:[{status:'CALCULATED'}]};
  });
  const result=h.api.applyModeAConsolidatedB313Wall(h.state);
  assert.equal(receivedLedger,true);
  assert.equal(result.calculated,1);
  assert.equal(result.updated,0);
  assert.equal(result.changed,false,'Calculate cannot be treated as an accepted Preview wall');
  const saved=JSON.parse(h.state.sources.S1.supportConfigJson);
  assert.equal(saved.b313WallUpdate.proposalsByBranch['0'].nominalWallMm,7.112);
  assert.equal(saved.overrides.wallThickness.L1,'10.97');
  assert.equal(h.state.sources.S1.b313WallUpdateReport.rows[0].status,'CALCULATED');
});

test('Mode A DTXR bulk preserves a saved manual wall and an accepted B31.3 Pull',()=>{
  const preview={branchRows:[{branchName:'A',lineKey:'L1',wallThicknessKey:'L1'},
    {branchName:'B',lineKey:'L2',wallThicknessKey:'L2',b313PullStatus:'ACCEPTED'}],nodeBoreWallRows:[]};
  const h=harness({wallThickness:{L1:'10.97'},__dtxrWallKeys:{}},preview,()=>{throw Error('B31.3 called by DTXR')});
  const response=h.api.applyModeAConsolidatedDtxrWall(h.state);
  assert.equal(response.applied,0);
  assert.equal(response.manualProtected,2);
  const cfg=JSON.parse(h.state.sources.S1.supportConfigJson);
  assert.equal(cfg.overrides.wallThickness.L1,'10.97');
  assert.equal(cfg.overrides.wallThickness.L2,undefined);
});

test('Mode A DTXR may refresh only its own previously DTXR-derived override',()=>{
  const preview={branchRows:[{branchName:'A',lineKey:'L1',wallThicknessKey:'L1'}],nodeBoreWallRows:[]};
  const h=harness({wallThickness:{L1:'5.0'},__dtxrWallKeys:{L1:true}},preview,()=>{throw Error('B31.3 called by DTXR')});
  const response=h.api.applyModeAConsolidatedDtxrWall(h.state);
  assert.equal(response.applied,1);
  assert.equal(response.manualProtected,0);
  assert.equal(JSON.parse(h.state.sources.S1.supportConfigJson).overrides.wallThickness.L1,'7.112');
});
