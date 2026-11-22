export async function boundedText(response,maxBytes){
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('外部响应过大');}chunks.push(Buffer.from(r.value));}}finally{reader.releaseLock();}
  return Buffer.concat(chunks,size).toString('utf8');
}
