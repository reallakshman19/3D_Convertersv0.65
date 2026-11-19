import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attestXml229PreviewWallLedger}
 from '../tabs/xml-cii-2019-standalone/integration/xml229-preview-wall-ledger-proof.mjs';
const source={nodeCount:2,nodes:[
 {branchOccurrenceIndex:0,nodeOrdinal:0,nodeNumber:'100',componentType:'PIPE',componentRefNo:'A'},
 {branchOccurrenceIndex:1,nodeOrdinal:0,nodeNumber:'200',componentType:'PIPE',componentRefNo:'B'},
]};
const rows=[
 {...source.nodes[0],outsideDiameterMm:168.3,wallThickness:'8.18',wallThicknessSource:'manual-override'},
 {...source.nodes[1],outsideDiameterMm:219.1,wallThickness:'12.7',wallThicknessSource:'piping-class-master'},
];
const proof=()=>attestXml229PreviewWallLedger(source,{nodeBoreWallRows:rows});
test('exact source ordinal proof preserves manual wall as read-only field only',()=>{
 const verified=proof();
 assert.equal(verified.coverage.sourceNodeCount,2);
 assert.equal(verified.coverage.verifiedRowCount,2);
 assert.equal(verified.coverage.sourceOrdinalIdentityMatched,true);
 assert.equal(verified.coverage.engineeringApproval,false);
 assert.equal(verified.rows[0].wallThickness,'8.18');
 assert.equal(verified.rows[0].wallThicknessSource,'manual-override');
 verified.rows[0].wallThickness='9';
 assert.equal(rows[0].wallThickness,'8.18','No raw source/Worker working row mutation');
});
test('missing, duplicate, reordered or fabricated source node wall rows fail closed',()=>{
 const code=(value)=>{try{attestXml229PreviewWallLedger(source,{nodeBoreWallRows:value});return null;}
   catch(e){return e.code;}};
 assert.equal(code(null),'PREVIEW_NODE_LEDGER_MISSING');
 assert.equal(code(rows.slice(0,1)),'PREVIEW_NODE_LEDGER_POPULATION_DRIFT');
 assert.equal(code([rows[1],rows[0]]),'PREVIEW_NODE_LEDGER_IDENTITY_DRIFT');
 assert.equal(code([rows[0],{...rows[0]}]),'PREVIEW_NODE_LEDGER_IDENTITY_DRIFT');
 assert.equal(code([rows[0],{...rows[1],componentRefNo:'FORGED'}]),
   'PREVIEW_NODE_LEDGER_IDENTITY_DRIFT');
 assert.equal(code([rows[0],{...rows[1],nodeOrdinal:1}]),
   'PREVIEW_NODE_LEDGER_IDENTITY_DRIFT');
});
test('Worker verified projection includes source-attested node ledger, never qualification',()=>{
 const root=readFileSync(new URL('../tabs/xml-cii-2019-standalone/integration/xml229-original-blob-gcpw-worker.mjs',import.meta.url),'utf8');
 const mirror=readFileSync(new URL('../docs/tabs/xml-cii-2019-standalone/integration/xml229-original-blob-gcpw-worker.mjs',import.meta.url),'utf8');
 const proofSource=readFileSync(new URL('../tabs/xml-cii-2019-standalone/integration/xml229-preview-wall-ledger-proof.mjs',import.meta.url),'utf8');
 const proofMirror=readFileSync(new URL('../docs/tabs/xml-cii-2019-standalone/integration/xml229-preview-wall-ledger-proof.mjs',import.meta.url),'utf8');
 assert.equal(root,mirror);
 assert.equal(proofSource,proofMirror);
 assert.match(root,/attestXml229PreviewWallLedger\(original,computed\)/);
 assert.match(root,/nodeBoreWallRows:nodeWallProof.rows/);
 assert.match(root,/nodeWallCoverage:nodeWallProof.coverage/);
 assert.match(root,/engineeringAcceptance:'NOT_ASSESSED'/);
});
