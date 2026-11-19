/**
 * Read-only lineage gate for the original-source P4 wall/geometry preview.
 * The producer worker MUST emit the same ordered physical Node occurrences
 * as the separately parsed original XML census. This is display evidence,
 * not an engineering approval, output rewrite or substitute source.
 */
export function attestXml229PreviewWallLedger(original={}, computed={}) {
  const expected=Array.isArray(original?.nodes)?original.nodes:null;
  const rows=Array.isArray(computed?.nodeBoreWallRows)?computed.nodeBoreWallRows:null;
  const fail=(code,detail)=>{throw Object.assign(new Error(code+': '+detail),{code});};
  if(!expected || !rows)
    fail('PREVIEW_NODE_LEDGER_MISSING','Original source nodes or computed wall ledger unavailable');
  if(!Number.isSafeInteger(original.nodeCount)||original.nodeCount!==expected.length)
    fail('PREVIEW_NODE_CENSUS_INVALID','Original source node census is inconsistent');
  if(rows.length!==expected.length)
    fail('PREVIEW_NODE_LEDGER_POPULATION_DRIFT',
      'Source '+expected.length+' nodes, worker ledger '+rows.length);
  const unique=new Set();
  for(let i=0;i<expected.length;i++){
    const src=expected[i],row=rows[i];
    if(!row || typeof row!=='object')fail('PREVIEW_NODE_LEDGER_INVALID','Row '+i+' is absent');
    const ordinal=Number(row.nodeOrdinal);
    const branch=Number(row.branchOccurrenceIndex);
    if(!Number.isSafeInteger(branch)||!Number.isSafeInteger(ordinal)
      ||branch!==Number(src.branchOccurrenceIndex)||ordinal!==Number(src.nodeOrdinal)
      ||String(row.nodeNumber??'')!==String(src.nodeNumber??'')
      ||String(row.componentRefNo??'')!==String(src.componentRefNo??'')
      ||String(row.componentType??'')!==String(src.componentType??''))
      fail('PREVIEW_NODE_LEDGER_IDENTITY_DRIFT',
        'Original node ordinal/component identity does not match derived wall row '+i);
    const key=branch+':'+ordinal;
    if(unique.has(key))fail('PREVIEW_NODE_LEDGER_DUPLICATE','Repeated physical node '+key);
    unique.add(key);
  }
  return {
    rows:rows.map(row=>({...row})),
    coverage:{
      schema:'xml229-original-preview-wall-ledger-coverage/v1',
      sourceNodeCount:expected.length,verifiedRowCount:rows.length,
      sourceOrdinalIdentityMatched:true,
      engineeringApproval:false,
      authority:'READ_ONLY_SOURCE_BOUND_PREVIEW_GEOMETRY',
    },
  };
}
