import * as THREE from './vendor/three.module.js';
import {SHAPES,createShape,randomSource,measureHand} from './shapes.js';
import {waitForStartup} from './camera-startup.js';
import {createMusicSky} from './music.js?v=music2';
const $=s=>document.querySelector(s), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const state={shape:'galaxy',palette:'aurora',count:innerWidth<800?8000:18000,spread:.12,spreadTarget:.12,rotationX:0,rotationY:0,hand:false,camera:'off',burst:0,morph:1};
let renderer,scene,camera,field,geometry,material,currentPositions,fromPositions,targetPositions,handWorker,stream,workerBusy=false,lastFrame=0,lastVideoTime=-1,lastHandAt=0,cameraGeneration=0;
let toastTimer,frameNumber=0,fpsStart=performance.now(),lastTick=performance.now(),elapsed=0;
let startupAbort;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const palettes={aurora:['#70f5d1','#9575ff'],sunset:['#ffd788','#ff6c91'],ice:['#d9f7ff','#4d8dff'],rose:['#ffb8e6','#a776ff']};
const music=createMusicSky({notify:toast});
const musicColorA=new THREE.Color(),musicColorB=new THREE.Color();
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
function setSpread(value){state.spreadTarget=clamp(value,0,1);const n=Math.round(state.spreadTarget*100);$('#spread').value=n;$('#spread-value').textContent=n+'%';$('#spread').style.background='linear-gradient(to right,#8ee9d2 '+n+'%,#283540 '+n+'%)';}
function makeField(){
  if(field){scene.remove(field);geometry.dispose();}
  currentPositions=createShape(state.shape,state.count);fromPositions=currentPositions.slice();targetPositions=currentPositions.slice();
  const rand=randomSource(521), seeds=new Float32Array(state.count*4);
  for(let i=0;i<seeds.length;i++)seeds[i]=rand();
  geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(currentPositions,3));
  geometry.setAttribute('aFrom',new THREE.BufferAttribute(fromPositions,3));
  geometry.setAttribute('aTarget',new THREE.BufferAttribute(targetPositions,3));
  geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,4));
  if(!material)material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uMorph:{value:1},uSpread:{value:.12},uBurst:{value:0},uAudio:{value:new THREE.Vector3()},uBeat:{value:0},uPixelRatio:{value:Math.min(devicePixelRatio,2)},uColorA:{value:new THREE.Color(palettes.aurora[0])},uColorB:{value:new THREE.Color(palettes.aurora[1])}},
    vertexShader:'attribute vec3 aFrom; attribute vec3 aTarget; attribute vec4 aSeed; uniform float uTime,uMorph,uSpread,uBurst,uPixelRatio,uBeat;uniform vec3 uAudio; varying float vColor,vAlpha; void main(){float m=smoothstep(0.0,1.0,uMorph);vec3 p=mix(aFrom,aTarget,m);float a=aSeed.x*6.2831853;float z=aSeed.y*2.0-1.0;vec3 scatter=vec3(sqrt(1.0-z*z)*cos(a),z,sqrt(1.0-z*z)*sin(a));p*=1.0+uSpread*.33+uAudio.x*.34+uBeat*.11;p+=scatter*(uSpread*2.9+uBurst*(2.0+aSeed.z*3.0));p+=normalize(p+vec3(.001))*sin(length(p)*6.0-uTime*3.4+aSeed.x*2.0)*uAudio.y*.17;p+=scatter*sin(uTime*2.0+aSeed.z*30.0)*uAudio.z*.10;p+=vec3(sin(uTime*.5+aSeed.y*30.0),cos(uTime*.4+aSeed.x*30.0),sin(uTime*.3+aSeed.z*30.0))*.025;vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((2.0+aSeed.w*3.3)*uPixelRatio*(5.8/-mv.z)*(1.0+uAudio.z*.6+uBeat*.18),1.3,13.0);vColor=clamp(aSeed.z*.32+length(p)*.16+uAudio.y*.08,0.0,1.0);vAlpha=(.48+aSeed.w*.52)*(1.0-uBurst*.35)*(1.0+uAudio.z*.65);}',
    fragmentShader:'uniform vec3 uColorA,uColorB;varying float vColor,vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.0;if(d>1.0)discard;float a=exp(-d*d*4.5)*vAlpha;vec3 color=mix(uColorA,uColorB,vColor);color=mix(color,vec3(1.0),pow(1.0-d,4.0)*.32);gl_FragColor=vec4(color,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
  });
  field=new THREE.Points(geometry,material);field.frustumCulled=false;scene.add(field);state.morph=1;
}
function changeShape(name){
  if(!SHAPES[name]||name===state.shape)return;
  const smooth=state.morph*state.morph*(3-2*state.morph);
  for(let i=0;i<fromPositions.length;i++)fromPositions[i]=fromPositions[i]*(1-smooth)+targetPositions[i]*smooth;
  targetPositions.set(createShape(name,state.count));
  geometry.attributes.aFrom.needsUpdate=true;geometry.attributes.aTarget.needsUpdate=true;
  state.shape=name;state.morph=reducedMotion?1:0;
  document.querySelectorAll('.shape').forEach(b=>{const active=b.dataset.shape===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  const [n,cn,en]=SHAPES[name];$('#shape-number').textContent=n;$('#shape-name').textContent=cn;$('#shape-en').textContent=en;
}
function resize(){
  const w=innerWidth,h=Math.max(innerHeight,innerWidth<=800?720:640);renderer.setSize(w,h);camera.aspect=w/h;
  camera.position.z=w<800?10.9:8.6;camera.updateProjectionMatrix();scene.position.x=w<800?0:.4;scene.position.y=w<800?.40:-.04;
}
function init(){
  renderer=new THREE.WebGLRenderer({canvas:$('#universe'),antialias:false,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x080c12,1);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,100);camera.position.z=8.6;
  const stars=new Float32Array(1000*3),rng=randomSource(72);
  for(let i=0;i<stars.length;i+=3){stars[i]=(rng()-.5)*32;stars[i+1]=(rng()-.5)*23;stars[i+2]=-4-rng()*13;}
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(stars,3));
  const dust=new THREE.Points(sg,new THREE.PointsMaterial({color:0x78919c,size:.012,transparent:true,opacity:.48,depthWrite:false}));scene.add(dust);
  makeField();$('#density').value=state.count;resize();addEventListener('resize',resize);requestAnimationFrame(animate);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();toast('图形连接暂时中断，请刷新页面恢复星空。');});
}
function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min((now-lastTick)/1000,.05);lastTick=now;elapsed+=dt;frameNumber++;
  const sound=music.update(now),response=sound.strength*(reducedMotion?.15:1);
  material.uniforms.uAudio.value.set(sound.bass*response,sound.mid*response,sound.high*response);
  material.uniforms.uBeat.value=reducedMotion?0:sound.beat*response;
  if(sound.active&&sound.autoColor&&sound.bass+sound.mid+sound.high>.015){
    const hue=({aurora:.43,sunset:.04,ice:.57,rose:.87}[state.palette]+elapsed*.012+sound.mid*.09)%1;
    musicColorA.setHSL(hue,.65,.67);musicColorB.setHSL((hue+.22+sound.high*.06)%1,.68,.64);
  }else{musicColorA.set(palettes[state.palette][0]);musicColorB.set(palettes[state.palette][1]);}
  material.uniforms.uColorA.value.lerp(musicColorA,1-Math.exp(-dt*2));
  material.uniforms.uColorB.value.lerp(musicColorB,1-Math.exp(-dt*2));
  if(now-fpsStart>750){$('#fps').textContent=Math.round(frameNumber*1000/(now-fpsStart));frameNumber=0;fpsStart=now;}
  state.morph=Math.min(1,state.morph+dt*.72);state.spread+=(state.spreadTarget-state.spread)*(1-Math.exp(-dt*6));state.burst*=Math.exp(-dt*2.7);
  material.uniforms.uTime.value=reducedMotion?0:elapsed;material.uniforms.uMorph.value=state.morph;material.uniforms.uSpread.value=state.spread;material.uniforms.uBurst.value=state.burst;
  field.rotation.y+=(state.rotationY+(reducedMotion?0:Math.sin(elapsed*.09)*.16)-field.rotation.y)*dt*2;
  field.rotation.x+=(state.rotationX-field.rotation.x)*dt*2;
  if(!reducedMotion)field.rotation.z=Math.sin(elapsed*.10)*.035;
  renderer.render(scene,camera);
  if(state.camera==='on'){
    const video=$('#camera-video');
    if(!workerBusy&&now-lastFrame>65&&video.readyState>=2&&video.currentTime!==lastVideoTime){
      workerBusy=true;lastFrame=now;lastVideoTime=video.currentTime;
      const generation=cameraGeneration;
      createImageBitmap(video,{resizeWidth:480,resizeHeight:360}).then(bitmap=>{
        if(generation!==cameraGeneration||state.camera!=='on'){bitmap.close();workerBusy=false;return;}
        handWorker.postMessage({type:'frame',image:bitmap,timestamp:now},[bitmap]);
      }).catch(()=>{workerBusy=false;});
    }
    if(now-lastHandAt>900&&state.hand){state.hand=false;setMouseMode();$('#camera-status').textContent='请将完整手掌放入视窗';$('#camera-badge').textContent='SEARCHING';}
  }
}
function setMouseMode(){
  $('#mode-symbol').textContent='⌘';$('#mode-name').textContent='鼠标探索';$('#mode-hint').textContent='移动旋转 · 按住聚拢 · 松开散开';
}
function handResult(landmarks){
  const canvas=$('#hand-overlay'),ctx=canvas.getContext('2d');canvas.width=480;canvas.height=360;ctx.clearRect(0,0,480,360);
  if(!landmarks.length)return;
  lastHandAt=performance.now();state.hand=true;
  const hand=measureHand(landmarks[0]);setSpread(hand.openness);
  state.rotationY=(hand.x-.5)*1.5;state.rotationX=(hand.y-.5)*.8;
  if(landmarks.length>1){const other=measureHand(landmarks[1]);setSpread((hand.openness+other.openness)*.5);}
  const label=hand.openness>.7?'张掌 · 星尘散开':hand.openness<.25?'握拳 · 星光聚合':'正在感受你的手势';
  $('#mode-name').textContent='手势已连接';$('#mode-symbol').textContent='✧';$('#mode-hint').textContent=label;$('#camera-status').textContent=label;$('#camera-badge').textContent='TRACKING';
  $('#coord-x').textContent=((hand.x-.5)*2).toFixed(2);$('#coord-y').textContent=((.5-hand.y)*2).toFixed(2);
  const links=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
  for(const points of landmarks){ctx.strokeStyle='#8ee9d299';ctx.lineWidth=1.4;for(const [a,b] of links){ctx.beginPath();ctx.moveTo(points[a].x*480,points[a].y*360);ctx.lineTo(points[b].x*480,points[b].y*360);ctx.stroke();}ctx.fillStyle='#ccfff1';for(const p of points){ctx.beginPath();ctx.arc(p.x*480,p.y*360,2.3,0,Math.PI*2);ctx.fill();}}
}
async function cameraOn(){
  if(state.camera!=='off')return;
  music.collapse();
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia){toast('摄像头需要 HTTPS 或 localhost 地址，请从启动器或在线地址打开。');return;}
  state.camera='loading';state.cameraError='';const generation=++cameraGeneration;
  const controller=new AbortController();startupAbort=controller;
  const progress=(message,badge)=>{if(generation!==cameraGeneration)return;$('#camera-status').textContent=message;$('#camera-badge').textContent=badge;};
  $('#camera-toggle').disabled=false;$('#camera-toggle span').textContent='取消连接';
  progress('正在等待摄像头授权…','CAMERA');
  try{
    const acquired=await waitForStartup(navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false}),{signal:controller.signal,timeout:25000,code:'camera-timeout',onLateResult:late=>late.getTracks().forEach(t=>t.stop())});
    if(generation!==cameraGeneration){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;
    const video=$('#camera-video');video.srcObject=stream;progress('摄像头已开启，正在准备画面…','VIDEO');
    await waitForStartup(video.play(),{signal:controller.signal,timeout:12000,code:'video-timeout'});
    $('#camera-placeholder').hidden=true;$('#camera-placeholder').style.display='none';
    progress('正在准备手势识别引擎…','ENGINE');
    handWorker=new Worker(new URL('./hand-worker.js?v=20261031',import.meta.url));
    await waitForStartup(new Promise((resolve,reject)=>{
      handWorker.onerror=e=>reject(new Error(e.message||'worker-error'));
      handWorker.onmessage=({data})=>{if(data.type==='ready')resolve();else if(data.type==='error')reject(new Error(data.message));else if(data.type==='progress')progress(data.message,data.badge);};
      handWorker.postMessage({type:'init'});
    }),{signal:controller.signal,timeout:60000,code:'model-timeout'});
    if(generation!==cameraGeneration)return;
    handWorker.onmessage=({data})=>{workerBusy=false;if(state.camera!=='on')return;if(data.type==='result')handResult(data.landmarks);else if(data.type==='error'){console.warn('Hand tracking stopped:',data.message);cameraOff();toast('识别暂时中断，已切回鼠标模式。可以重新开启手势。');}};
    handWorker.onerror=()=>{if(state.camera==='on'){cameraOff();toast('手势识别中断，已切回鼠标模式。');}};
    stream.getVideoTracks()[0].onended=()=>{if(state.camera!=='off'){cameraOff();toast('摄像头已断开，继续用鼠标探索吧。');}};
    startupAbort=null;state.camera='on';lastHandAt=performance.now();workerBusy=false;lastVideoTime=-1;$('#camera-dot').classList.add('on');$('#camera-badge').textContent='SEARCHING';$('#camera-status').textContent='请将完整手掌放入视窗';$('#camera-toggle span').textContent='关闭手势';toast('摄像头已连接。张开手掌，然后慢慢握拳。');
  }catch(e){
    if(generation!==cameraGeneration||e.message==='startup-cancelled')return;
    console.warn('Camera unavailable:',e.name,e.message);cameraOff();
    const messages={NotAllowedError:'摄像头权限未获允许。请在浏览器地址栏授权后重试。',NotFoundError:'没有找到摄像头，你仍可用鼠标控制星尘。',NotReadableError:'摄像头可能被其他程序占用，请关闭后重试。'};
    const stages={'camera-timeout':'等待摄像头授权超时，请检查地址栏权限后重试。','video-timeout':'摄像头画面未就绪，请在 Edge 或 Chrome 中打开重试。','model-timeout':'识别引擎启动超时，请重试或在 Edge / Chrome 中打开。','download-timeout':'模型下载超时，请检查网络后重试。','model-auth':'模型请求返回了登录页，请刷新网页后重新连接。'};
    const message=messages[e.name]||stages[e.message]||'手势识别未能启动，请用新版 Chrome 或 Edge 打开后重试。';
    state.cameraError=e.message;$('#camera-status').textContent=message;$('#camera-badge').textContent='RETRY';toast(message);
  }
}
function cameraOff(){
  ++cameraGeneration;startupAbort?.abort();startupAbort=null;state.camera='off';state.hand=false;handWorker?.terminate();handWorker=null;workerBusy=false;
  stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});stream=null;
  $('#camera-video').srcObject=null;$('#camera-dot').classList.remove('on');$('#camera-badge').textContent='STANDBY';$('#camera-status').textContent='开启摄像头，连接这片星空';$('#camera-placeholder').style.display='flex';$('#camera-placeholder').hidden=false;
  const c=$('#hand-overlay');c.getContext('2d').clearRect(0,0,c.width,c.height);$('#camera-toggle span').textContent='开启手势';$('#camera-toggle').disabled=false;setMouseMode();setSpread(.12);
}
document.querySelectorAll('.shape').forEach(b=>b.addEventListener('click',()=>changeShape(b.dataset.shape)));
document.querySelectorAll('.swatch').forEach(b=>b.addEventListener('click',()=>{
  state.palette=b.dataset.palette;material.uniforms.uColorA.value.set(palettes[state.palette][0]);material.uniforms.uColorB.value.set(palettes[state.palette][1]);
  document.querySelectorAll('.swatch').forEach(s=>{const active=s===b;s.classList.toggle('selected',active);s.setAttribute('aria-pressed',active);});
}));
$('#density').addEventListener('change',e=>{state.count=Number(e.target.value);makeField();});
$('#spread').addEventListener('input',e=>{if(state.hand)toast('手势连接中，扩散程度跟随手掌开合。');else setSpread(Number(e.target.value)/100);});
$('#camera-toggle').addEventListener('click',()=>state.camera==='off'?cameraOn():cameraOff());
$('#burst').addEventListener('click',()=>{state.burst=1;});
$('#help').addEventListener('click',()=>$('#help-dialog').showModal());
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>$('#help-dialog').close()));
$('#help-dialog').addEventListener('click',e=>{if(e.target===$('#help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口不支持全屏，请在独立浏览器中打开。');}});
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏');});
const universe=$('#universe');let pointerHeld=false,releaseSpread=.12;
function releasePointer(){if(pointerHeld){pointerHeld=false;if(!state.hand)setSpread(Math.max(.35,releaseSpread));}}
universe.addEventListener('pointermove',e=>{if(state.hand)return;const x=e.clientX/innerWidth-.5,y=e.clientY/innerHeight-.5;state.rotationY=x*1.3;state.rotationX=y*.7;$('#coord-x').textContent=(x*2).toFixed(2);$('#coord-y').textContent=(-y*2).toFixed(2);});
universe.addEventListener('pointerdown',e=>{if(state.hand||e.button!==0)return;pointerHeld=true;releaseSpread=state.spreadTarget;setSpread(0);universe.setPointerCapture(e.pointerId);});
universe.addEventListener('pointerup',releasePointer);universe.addEventListener('pointercancel',releasePointer);addEventListener('blur',releasePointer);
universe.addEventListener('wheel',e=>{e.preventDefault();if(!state.hand)setSpread(state.spreadTarget+e.deltaY*.0007);},{passive:false});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!/INPUT|SELECT|BUTTON|TEXTAREA/.test(document.activeElement.tagName)&&!$('#help-dialog').open){e.preventDefault();state.burst=1;}});
addEventListener('pagehide',()=>cameraOff());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.camera!=='off'){cameraOff();toast('离开页面时已自动关闭摄像头。');}});
try{init();}catch(e){console.error(e);const box=document.createElement('div');box.className='fatal';box.textContent='这片星空需要 WebGL 图形加速。请使用新版 Chrome 或 Edge，并开启浏览器的硬件加速后刷新。';document.body.append(box);}
window.palmfield={get state(){return {...state};},get music(){return music.snapshot;},measureHand};
