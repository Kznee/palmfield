const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const time=t=>Number.isFinite(t)?Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0'):'0:00';
export function createMusicSky({notify}){
  const $=s=>document.querySelector(s),audio=$('#music-audio');
  let context,source,analyser,gain,bins,wave,objectUrl=null,trackName='NEON DRIVE',trackKind='demo',generation=0;
  let trackFetch;
  let lastNow=performance.now(),lastPaint=0,lastBeat=0,baseline=.05,everPlayed=false;
  let recorder=null,recordStream=null,recordDestination=null,recordTimer=null,recordStart=0;
  const levels={active:false,bass:0,mid:0,high:0,beat:0,strength:.65,autoColor:true};
  const view={playing:false,recording:false,name:trackName,kind:trackKind};
  const spectrum=$('#music-spectrum'),paint=spectrum.getContext('2d');
  function open(value){
    $('#music-panel').hidden=!value;$('#music-toggle').setAttribute('aria-expanded',String(value));
  }
  function status(message){$('#music-status').textContent=message;}
  function ensureContext(){
    if(context)return;
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)throw new Error('这个浏览器不支持音频分析，请用新版 Edge 或 Chrome。');
    context=new AudioCtx();source=context.createMediaElementSource(audio);
    analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.65;
    gain=context.createGain();gain.gain.value=Number($('#music-volume').value)/100;
    source.connect(analyser);analyser.connect(gain);gain.connect(context.destination);
    bins=new Uint8Array(analyser.frequencyBinCount);wave=new Uint8Array(analyser.fftSize);
  }
  function playbackChanged(){
    const playing=!audio.paused&&!audio.ended;
    view.playing=playing;$('#music-play').textContent=playing?'Ⅱ':'▶';$('#music-play').setAttribute('aria-label',playing?'暂停音乐':'播放音乐');
    $('#music-mini-play').textContent=playing?'Ⅱ':'▶';$('#music-mini-play').setAttribute('aria-label',playing?'暂停音乐':'播放音乐');
    $('#music-toggle').classList.toggle('playing',playing);$('#music-mini').classList.toggle('playing',playing);
    if(playing){everPlayed=true;$('#music-mini').hidden=false;status('音乐已连接');}
    else if(everPlayed){status(audio.ended?'播放结束':'已暂停');stopRecording();}
  }
  async function togglePlay(){
    if(!audio.paused){audio.pause();return;}
    const current=generation;
    try{
      ensureContext();await context.resume();if(current!==generation)return;
      await audio.play();
    }catch(e){
      if(current!==generation||e.name==='AbortError')return;
      status('播放未能启动');notify(e.name==='NotSupportedError'?'无法播放这个音频，请换一个 MP3 或 WAV 文件。':e.message||'请再点击播放，或换一个音频文件。');
    }
  }
  async function loadTrack(url,name,kind){
    const current=++generation;audio.pause();trackFetch?.abort();trackFetch=null;
    audio.removeAttribute('src');audio.load();
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    trackName=name;trackKind=kind;view.name=name;view.kind=kind;
    levels.bass=levels.mid=levels.high=levels.beat=0;baseline=.05;lastBeat=0;
    $('#music-name').textContent=name;$('#music-mini-name').textContent=name;
    $('#music-detail').textContent=kind==='demo'?'电子律动 · 128 BPM · 立体声':'本地音乐 · 不上传';
    $('#music-seek').value=0;$('#music-seek').disabled=true;$('#music-time').textContent='0:00';$('#music-duration').textContent='—';
    status('正在读取音乐…');$('#music-play').disabled=true;$('#music-mini-play').disabled=true;
    try{
      if(kind==='demo'&&location.protocol!=='https:'){
        const abort=new AbortController();trackFetch=abort;
        const timer=setTimeout(()=>abort.abort(),15000);
        try{
          const response=await fetch(url,{credentials:'same-origin',signal:abort.signal});
          if(!response.ok)throw new Error('试听音乐暂时无法读取，请重试或导入自己的音乐。');
          url=URL.createObjectURL(await response.blob());
        }finally{clearTimeout(timer);}
      }
      if(current!==generation){if(url.startsWith('blob:'))URL.revokeObjectURL(url);return;}
      objectUrl=url.startsWith('blob:')?url:null;audio.src=url;audio.load();
    }catch(e){
      if(current===generation){status('音乐读取失败');notify(e.name==='AbortError'?'试听读取超时，请重试或导入自己的音乐。':e.message);}
    }finally{
      if(current===generation){trackFetch=null;$('#music-play').disabled=false;$('#music-mini-play').disabled=false;}
    }
  }
  function importFile(file){
    if(!file)return;
    if(!file.type.startsWith('audio/')&&!/\.(mp3|wav|m4a|ogg|flac|aac|opus|webm)$/i.test(file.name)){
      notify('请选择音乐文件，例如 MP3 或 WAV。');return;
    }
    loadTrack(URL.createObjectURL(file),file.name.replace(/\.[^.]+$/,''),'file');
  }
  function recordButton(active){
    $('#music-record').classList.toggle('recording',active);$('#music-rec-badge').hidden=!active;
    $('#music-record span').textContent=active?'结束并保存':'录一段星空';
    $('#music-record small').textContent=active?'0:00':'最长 30 秒';
  }
  function stopRecording(){
    if(recorder?.state==='recording'){$('#music-record').disabled=true;recorder.stop();}
  }
  async function toggleRecord(){
    if(recorder?.state==='recording'){stopRecording();return;}
    if(view.recording)return;
    const canvas=$('#universe');
    if(!window.MediaRecorder||!canvas.captureStream){notify('这个浏览器暂不支持录制，请用新版 Edge 或 Chrome。');return;}
    if(audio.paused){notify('先播放一段音乐，再开始录制星空。');return;}
    try{
      const mime=['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
      if(!mime){notify('这个浏览器不支持可保存的视频格式。');return;}
      recordDestination=context.createMediaStreamDestination();gain.connect(recordDestination);
      recordStream=new MediaStream([...canvas.captureStream(30).getVideoTracks(),...recordDestination.stream.getAudioTracks()]);
      recorder=new MediaRecorder(recordStream,{mimeType:mime,videoBitsPerSecond:4000000,audioBitsPerSecond:128000});
      const chunks=[],extension=mime.includes('mp4')?'mp4':'webm';
      const cleanup=()=>{clearTimeout(recordTimer);recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;if(recordDestination){gain.disconnect(recordDestination);recordDestination=null;}view.recording=false;recordButton(false);$('#music-record').disabled=false;};
      let failed=false;
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{failed=true;cleanup();notify('视频录制失败，可以重新尝试。');};
      recorder.onstop=()=>{
        cleanup();
        if(failed||!chunks.length)return;
        const blob=new Blob(chunks,{type:mime}),url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download='掌间星尘-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+extension;
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
        notify('星空视频已生成，包含音乐；请查看浏览器下载。');
      };
      recorder.start(500);recordStart=performance.now();view.recording=true;recordButton(true);
      recordTimer=setTimeout(stopRecording,30000);
      notify('开始录制。再次点击可结束，最长 30 秒。');
    }catch(e){
      clearTimeout(recordTimer);recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;
      if(recordDestination){gain?.disconnect(recordDestination);recordDestination=null;}
      view.recording=false;recordButton(false);notify('暂时无法录制：'+(e.message||'请换用新版浏览器。'));
    }
  }
  function band(low,high){
    const hz=context.sampleRate/analyser.fftSize;
    const start=Math.max(1,Math.floor(low/hz)),end=Math.min(bins.length,Math.ceil(high/hz));let sum=0;
    for(let i=start;i<end;i++)sum+=bins[i]/255;
    return Math.pow(sum/Math.max(1,end-start),.82);
  }
  function update(now){
    const dt=clamp((now-lastNow)/1000,0,.1);lastNow=now;
    const active=!!analyser&&!audio.paused&&!audio.ended&&context.state==='running';
    levels.active=active;let low=0,mid=0,high=0;
    if(active){
      analyser.getByteFrequencyData(bins);analyser.getByteTimeDomainData(wave);
      let power=0;for(const value of wave)power+=Math.pow((value-128)/128,2);
      if(Math.sqrt(power/wave.length)>.002){low=band(35,180);mid=band(180,2200);high=band(2200,10000);}
      if(low>.17&&low>baseline*1.22+.025&&now-lastBeat>260){levels.beat=1;lastBeat=now;}
      baseline+=(low-baseline)*(1-Math.exp(-dt*1.3));
    }
    for(const [key,target] of [['bass',low],['mid',mid],['high',high]])levels[key]+=(target-levels[key])*(1-Math.exp(-dt*(target>levels[key]?14:5)));
    levels.beat*=Math.exp(-dt*4.5);
    levels.strength=Number($('#music-strength').value)/100;levels.autoColor=$('#music-color').checked;
    if(now-lastPaint>45){
      lastPaint=now;paint.clearRect(0,0,spectrum.width,spectrum.height);
      const count=48,gap=4,bw=(spectrum.width-(count-1)*gap)/count;
      for(let i=0;i<count;i++){
        const index=analyser?Math.min(bins.length-1,Math.floor(Math.pow(i/(count-1),2.2)*(bins.length-1))):0;
        const height=active?Math.max(2,Math.pow(bins[index]/255,1.6)*95):2;
        paint.fillStyle='hsla('+(158+i*1.5)+',45%,'+(active?65:35)+'%,'+(active?.72:.35)+')';
        paint.fillRect(i*(bw+gap),spectrum.height-height,bw,height);
      }
      $('#music-time').textContent=time(audio.currentTime);$('#music-mini-time').textContent=time(audio.currentTime);
      if(Number.isFinite(audio.duration)&&audio.duration>0)$('#music-seek').value=Math.round(audio.currentTime/audio.duration*1000);
      if(view.recording)$('#music-record small').textContent=time((now-recordStart)/1000);
    }
    return levels;
  }
  $('#music-toggle').addEventListener('click',()=>open($('#music-panel').hidden));
  $('#music-close').addEventListener('click',()=>open(false));$('#music-mini-open').addEventListener('click',()=>open(true));
  $('#music-play').addEventListener('click',togglePlay);$('#music-mini-play').addEventListener('click',togglePlay);
  $('#music-import').addEventListener('click',()=>$('#music-file').click());
  $('#music-file').addEventListener('change',e=>{importFile(e.target.files[0]);e.target.value='';});
  $('#music-demo').addEventListener('click',()=>loadTrack(new URL('./assets/neon-drive.mp3',import.meta.url).href,'NEON DRIVE','demo'));
  $('#music-volume').addEventListener('input',e=>{const n=Number(e.target.value);$('#music-volume-value').textContent=n+'%';if(gain)gain.gain.setTargetAtTime(n/100,context.currentTime,.025);});
  $('#music-strength').addEventListener('input',e=>{$('#music-strength-value').textContent=e.target.value+'%';});
  $('#music-loop').addEventListener('change',e=>{audio.loop=e.target.checked;});
  $('#music-seek').addEventListener('input',e=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Number(e.target.value)/1000*audio.duration;});
  $('#music-record').addEventListener('click',toggleRecord);
  audio.addEventListener('loadedmetadata',()=>{$('#music-duration').textContent=time(audio.duration);$('#music-seek').disabled=!Number.isFinite(audio.duration);status('已就绪，点击播放');});
  for(const event of ['play','pause','ended'])audio.addEventListener(event,playbackChanged);
  audio.addEventListener('waiting',()=>status('正在缓冲音乐…'));
  audio.addEventListener('playing',()=>status('音乐已连接'));
  audio.addEventListener('error',()=>{status('音频无法读取');notify('这个音频无法播放，请换一个 MP3 / WAV 文件，或选择内置试听。');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')open(false);});
  addEventListener('pagehide',()=>{audio.pause();trackFetch?.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);context?.close().catch(()=>{});});
  if(!window.MediaRecorder||!$('#universe').captureStream){$('#music-record').disabled=true;$('#music-record').title='当前浏览器不支持视频录制';}
  loadTrack(new URL('./assets/neon-drive.mp3',import.meta.url).href,'NEON DRIVE','demo');
  if(innerWidth<=800)open(false);
  return {update,collapse(){open(false);},get snapshot(){return {...view,...levels,playing:!audio.paused&&!audio.ended,time:audio.currentTime,duration:Number.isFinite(audio.duration)?audio.duration:0,volume:Number($('#music-volume').value)/100};}};
}
