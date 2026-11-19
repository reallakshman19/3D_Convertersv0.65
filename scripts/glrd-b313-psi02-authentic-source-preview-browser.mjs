/**
 * GLRD PSI-02 public original-source browser replay.
 * Not an owner session replay: original effective config/session is unavailable.
 * Does not inject P1, T1, stage JSON or wall overrides.
 */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const src=process.env.GLRD_PUBLIC_SOURCE_ROOT||'glrd-source';
const masters=process.env.GLRD_PUBLIC_MASTER_ROOT||'glrd-masters';
const target=process.env.GLRD_BROWSER_TARGET||'https://reallakshman19.github.io/3D_Convertersv0.65/index.html';
const out=process.env.GLRD_EVIDENCE_DIR||'/tmp/glrd-b313-psi02-replay';
const manifest=JSON.parse(await readFile('engineering/b313/glrd-pinned-source-manifest.json','utf8'));
const manifestFiles=manifest.files;
const get=(role)=>manifestFiles.find(x=>x.role===role);
const fileRoot={xml:src,line_list:src,stage_json:src,piping_class:masters,material_map:masters,valve_weights:masters};
const sha=(b)=>createHash('sha256').update(b).digest('hex');
const paths={},hashes={};
for(const role of ['xml','line_list','piping_class','material_map','valve_weights']){
  const spec=get(role);
  if(!spec)throw Error('missing pinned role '+role);
  paths[role]=path.join(fileRoot[role],spec.path);
  const bytes=await readFile(paths[role]);
  hashes[role]={sha256:sha(bytes),bytes:bytes.length,expected:spec.sha256};
  if(hashes[role].sha256!==spec.sha256)throw Error('HASH_MISMATCH '+role);
}
await mkdir(out,{recursive:true});
const record={
  schema:'GLRD-B313-PSI02-PUBLIC-SOURCE-BROWSER-REPLAY/v1',
  label:'PUBLIC ORIGINAL-SOURCE REPLAY; NOT OWNER SAVED CONFIG/SESSION',
  target,manifestProject:manifest.project,
  xmlSha256:hashes.xml.sha256,actualSourceHashes:hashes,
  stageJsonExcluded:'BM2-NAMED STAGE TO PSI-02 APPLICABILITY UNVERIFIED',
  savedConfigUnavailable:true,ownerSessionReplayed:false,
  timestamp:new Date().toISOString(),steps:[],pageErrors:[],consoleErrors:[],
  sourceP1T1Injected:false,wallOverrideModified:false,
  wallOutputCiiModified:false,pass:false,
};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:true});
page.setDefaultTimeout(60000);
page.on('pageerror',e=>record.pageErrors.push(String(e.stack||e)));
page.on('console',m=>{if(m.type()==='error')record.consoleErrors.push(m.text().slice(0,600));});
async function stage(name,fn){try{const data=await fn();record.steps.push({name,ok:true,data});return data;}catch(e){record.steps.push({name,ok:false,error:String(e?.stack||e).slice(0,2700)});throw e;}}
try{
 await stage('open_deployed_application',async()=>{
   const res=await page.goto(target,{waitUntil:'domcontentloaded',timeout:120000});
   if(res?.status()!==200)throw Error('Pages HTTP '+res?.status());
   await page.locator('[data-tab="xml-cii-2019-standalone"]').click();
   return {http:res.status(),url:page.url()};
 });
 await stage('import_authentic_PSI02_XML',async()=>{
   await page.locator('[data-phase="source"]').click();
   await page.locator('[data-field="source-file"]').setInputFiles(paths.xml);
   return {path:get('xml').path,sha256:hashes.xml.sha256,bytes:hashes.xml.bytes};
 });
 for(const [kind,role,subTab] of [
   ['lineList','line_list','linelist'],
   ['pipingClass','piping_class','pipingClass'],
   ['materialMap','material_map','materialMap'],
 ]){
   await stage('import_authentic_'+kind,async()=>{
     await page.locator('[data-sub-tab="'+subTab+'"]').click();
     await page.locator('input[data-master-file="'+kind+'"]').setInputFiles(paths[role]);
     await page.waitForFunction((k)=>{
       const s=[...document.querySelectorAll('[data-master-mapping-status]')]
         .find(el=>el.dataset.masterMappingStatus===k)?.textContent||'';
       return /APPLIED/.test(s)||/Import error/.test(document.body.innerText);
     },kind,{timeout:120000});
     const data=await page.evaluate(k=>{
       const selector=document.querySelector('[data-master-sheet-select="'+k+'"]');
       const options=selector?[...selector.options].map(o=>({value:o.value,label:o.textContent})):null;
       const status=document.querySelector('[data-master-mapping-status="'+k+'"]')?.textContent||'';
       return {status,sheet:selector?.value||null,options};
     },kind);
     if(kind==='lineList'&&data.options?.length){
       const match=data.options.find(o=>/^linelist$/i.test(o.value.trim())||/^linelist$/i.test(o.label.trim()));
       if(match&&match.value!==data.sheet){
         await page.locator('[data-master-sheet-select="lineList"]').selectOption(match.value);
         await page.waitForFunction(()=>/APPLIED/.test(document.querySelector('[data-master-mapping-status="lineList"]')?.textContent||''),null,{timeout:120000});
         data.sheet=match.value;
       }
     }
     return {...data,path:get(role).path,sha256:hashes[role].sha256};
   });
 }
 await stage('manual_rebuild_4_preview',async()=>{
   await page.locator('[data-phase="preview"]').click();
   const host=page.locator('#mc-preview-table-host');
   const btn=host.locator('[data-mc-preview-build]').first();
   await btn.waitFor({timeout:120000});
   const before=await host.evaluate(h=>({
     autoBuildButtonPresent:!!h.querySelector('[data-mc-preview-build]'),
     branchRows:h.__xmlCiiPreviewResult?.branchRows?.length||0,
     cacheStatus:h.dataset.mcPreviewCacheStatus||'',
     sourceSha:h.dataset.mcPreviewOriginalJsonSha256||null,
   }));
   await btn.click(); // Only explicit Preview rebuild
   await page.waitForFunction(()=>{
     const h=document.querySelector('#mc-preview-table-host');
     const rows=h?.__xmlCiiPreviewResult?.branchRows?.length||0;
     const cells=h?.querySelectorAll('[data-mc-b313-calculated-row]').length||0;
     // The deployed app's user-visible "Verified original engineering
     // Preview" has a distinct source-status field in XML-only mode.
     // Completion is the real 30-row table + physical B31.3 cells.
     return (rows===30 && cells===rows)||
       /Preview failed|Preview build failed/i.test(h?.innerText||'');
   },null,{timeout:120000});
   await page.waitForTimeout(800);
   const status=await host.evaluate(h=>({
     jsonSource:h.dataset.mcPreviewJsonSource||null,
     cacheStatus:h.dataset.mcPreviewCacheStatus||null,
     basisId:h.dataset.mcPreviewBasisId||null,
     rowCount:h.__xmlCiiPreviewResult?.branchRows?.length||0,
     headerCount:h.querySelectorAll('table[data-resizable-table="branch-preview"] thead th').length,
     calculatedCellCount:h.querySelectorAll('[data-mc-b313-calculated-row]').length,
     lineListStatus:(h.parentElement?.innerText||'').match(/Line List:\s*\d+\s*row\(s\)/)?.[0]||null,
     error:(h.innerText||'').match(/Preview failed.{0,500}/)?.[0]||null,
   }));
   if(!status.rowCount)throw Error('No actual Preview rows after manual Build '+JSON.stringify(status));
   return {before,after:status};
 });
 const result=await stage('capture_30_row_numeric_wall_and_custody',async()=>{
   await page.waitForFunction(()=>{
     const h=document.querySelector('#mc-preview-table-host');
     const cells=[...h?.querySelectorAll('[data-mc-b313-calculated-row]')||[]];
     return cells.length>0&&cells.every(c=>Boolean(c.dataset.mcB313CalculatedStatus));
   },null,{timeout:45000});
   return await page.evaluate(()=>{
     const host=document.querySelector('#mc-preview-table-host');
     const rows=host?.__xmlCiiPreviewResult?.branchRows||[];
     const cells=[...host.querySelectorAll('[data-mc-b313-calculated-row]')];
     const rowsOut=rows.map((r,i)=>{
       const c=cells[i],value=c?.querySelector('[data-mc-b313-calculated-value]')?.textContent?.trim()||null;
       const detail=c?.querySelector('[data-mc-b313-calculated-detail]')?.textContent?.trim()||null;
       return {index:i+1,lineKey:r.lineKey||'',branchName:r.branchName||'',p1:r.p1??null,
         t1:r.t1??null,p1Unit:r.p1Unit||'',p1UnitSource:r.p1UnitSource||null,
         sizeMm:r.sizeMm??null,material:r.material??null,
         wallThickness:r.wallThickness??null,
         pressureUnitSource:r._sourceP1HeaderSource||null,
         requiredValue:value,
         calculatedStatus:c?.dataset.mcB313CalculatedStatus||null,detail,
         tooltip:c?.title?.slice(0,1100)||null};
     });
     const unit=host.querySelector('[data-b313-common-pressure-unit]');
     const numeric=rowsOut.filter(r=>/^\d+(?:\.\d+)?$/.test(r.requiredValue||''));
     const four=[0,1,28,29].map(i=>rowsOut[i]||null);
     return {effectiveRowCount:rows.length,calculatedCellCount:cells.length,
       rows:rowsOut,numericCount:numeric.length,numericRows:numeric.map(x=>x.index),
       originalFourLocations:four,selectedCommonP1:unit?.value||null,
       B313ReportPresent:!!host.querySelector('[data-mc-b313-report]'),
       reportedCacheStatus:host.dataset.mcPreviewCacheStatus,
       reportedInputJsonSha:host.dataset.mcPreviewOriginalJsonSha256||null,
       previewDirty:host.dataset.mcB313PreviewDirty||null,
       activeResultSignature:host.dataset.mcPreviewBasisId||null};
   });
 });
 const numeric=result.rows.filter(r=>/^\d+(?:\.\d+)?$/.test(r.requiredValue||''));
 const rowsWithBoth=result.rows.filter(r=>String(r.p1??'').trim()&&String(r.t1??'').trim());
 record.analysis={actualBranchCount:result.effectiveRowCount,
   actualNumericCount:result.numericCount,rowsWithBothP1T1:rowsWithBoth.length,
   '30Rows':result.effectiveRowCount===30,allCellsPresent:result.calculatedCellCount===result.effectiveRowCount,
   numericalRows:numeric.map(r=>({index:r.index,lineKey:r.lineKey,p1:r.p1,t1:r.t1,
     nominal:r.requiredValue,status:r.calculatedStatus})),
   noneWithoutP1T1:numeric.every(r=>String(r.p1??'').trim()&&String(r.t1??'').trim()),
   note:'Numerical values must be interpreted from effective actual Preview inputs; no source P1/T1 injected.'};
 // A table full of dashes is NOT a B31.3 acceptance pass. Derive
 // decisive four witnesses from actual source-backed Preview values, not
 // assumed row indices or artificial P1/T1 injection.
 const witnesses=[
   {line:'P4110001',dn:200,expected:7.800},
   {line:'P4110001',dn:150,expected:5.983},
   {line:'B4110003',dn:100,expected:3.759},
   {line:'B4110003',dn:400,expected:4.606},
 ];
 record.analysis.fourNumericalWitnesses=witnesses.map(w=>{
   const matching=result.rows.filter(r=>
     String(r.lineKey||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase()===w.line
     &&Number(r.sizeMm)===w.dn);
   const actual=matching[0]||null;
   const nominal=Number(actual?.requiredValue);
   const valid=Boolean(actual&&matching.length===1&&
     /^\\d+(?:\\.\\d+)?$/.test(actual.requiredValue||'')&&
     Math.abs(nominal-w.expected)<=0.03);
   return {...w,actual,nominal:Number.isFinite(nominal)?nominal:null,
     comparison:valid?'MATCH':'NOT_ESTABLISHED'};
 });
 record.analysis.fourWitnessesPass=record.analysis.fourNumericalWitnesses.every(x=>x.comparison==='MATCH');
 record.pass=record.analysis['30Rows']&&record.analysis.allCellsPresent&&
   record.analysis.noneWithoutP1T1&&record.analysis.fourWitnessesPass&&
   record.pageErrors.length===0;
}catch(e){record.failed=String(e?.stack||e).slice(0,4500);process.exitCode=1;}
finally{
 try{await page.screenshot({path:path.join(out,'GLRD-PSI02-rebuild.png'),fullPage:true,timeout:20000});}catch(e){record.screenshotError=String(e);}
 record.completedAt=new Date().toISOString();
 await writeFile(path.join(out,'GLRD-PSI02-browser-replay.json'),JSON.stringify(record,null,2));
 console.log('GLRD_PSI02_AUTHENTIC_SOURCE_BROWSER_REPLAY',JSON.stringify(record).slice(0,13000));
 await browser.close();
 if(!record.pass)process.exitCode=1;
}
