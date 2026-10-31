let detector;
async function loadModel(){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
  try{
    const response=await fetch(new URL('./vendor/hand_landmarker.task',self.location.href),{credentials:'same-origin',signal:abort.signal});
    if(!response.ok)throw new Error('model-http-'+response.status);
    if(response.headers.get('content-type')?.includes('text/html'))throw new Error('model-auth');
    const total=Number(response.headers.get('content-length'))||0;
    if(!response.body)return new Uint8Array(await response.arrayBuffer());
    const reader=response.body.getReader(),chunks=[];let loaded=0;
    while(true){
      const {done,value}=await reader.read();if(done)break;
      chunks.push(value);loaded+=value.byteLength;
      const percent=total?Math.min(100,Math.round(loaded/total*100)):null;
      self.postMessage({type:'progress',message:'正在加载手势模型 '+(percent===null?(loaded/1048576).toFixed(1)+' MB':percent+'%'),badge:percent===null?'MODEL':percent+'%'});
    }
    const bytes=new Uint8Array(loaded);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return bytes;
  }catch(e){if(e.name==='AbortError')throw new Error('download-timeout');throw e;}
  finally{clearTimeout(timer);}
}
self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      const { FilesetResolver, HandLandmarker } = await import('./vendor/vision_bundle.mjs');
      const model=await loadModel();
      self.postMessage({type:'progress',message:'模型已加载，正在启动本地识别…',badge:'STARTING'});
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
      detector=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:model,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
      self.postMessage({type:'ready'});
    }catch(e){self.postMessage({type:'error',message:String(e.message||e)});}
  }
  if(data.type==='frame'){
    try{const result=detector.detectForVideo(data.image,data.timestamp);self.postMessage({type:'result',landmarks:result.landmarks});}
    catch(e){self.postMessage({type:'error',message:String(e.message||e)});}
    finally{data.image.close();}
  }
};
