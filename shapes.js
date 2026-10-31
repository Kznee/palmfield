export const SHAPES = {
  galaxy: ['01','旋臂星系','SPIRAL GALAXY'],
  sphere: ['02','星光球体','STELLAR SPHERE'],
  saturn: ['03','土星光环','SATURN RINGS'],
  heart: ['04','心动频率','HEARTBEAT'],
  torus: ['05','无限之环','INFINITE LOOP'],
  helix: ['06','生命螺旋','DOUBLE HELIX']
};
export function randomSource(seed=41) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
}
export function createShape(name,count,seed=92) {
  const r=randomSource(seed), p=new Float32Array(count*3), tau=Math.PI*2;
  for(let i=0;i<count;i++) {
    let x=0,y=0,z=0;
    if(name==='galaxy') {
      const radius=Math.pow(r(),.92)*2.8, arm=i%3, angle=radius*1.35+arm*Math.PI*2/3+(r()-.5)*.29;
      x=Math.cos(angle)*radius+(r()-.5)*.17; z=Math.sin(angle)*radius+(r()-.5)*.17; y=(r()-.5)*(.13+.28*(1-radius/2.8));
      const yz=y*.81-z*.59; z=y*.59+z*.81; y=yz;
    } else if(name==='sphere') {
      const theta=r()*tau, zz=r()*2-1, rad=(i%5===0?Math.cbrt(r()):.96+r()*.04)*1.9, q=Math.sqrt(1-zz*zz);
      x=rad*q*Math.cos(theta); y=rad*zz; z=rad*q*Math.sin(theta);
    } else if(name==='saturn') {
      const theta=r()*tau;
      if(i<count*.52){const v=r()*2-1, rad=1.18*(.94+r()*.06), q=Math.sqrt(1-v*v);x=rad*q*Math.cos(theta);y=rad*v;z=rad*q*Math.sin(theta);}
      else{const rad=1.62+r()*.98;x=Math.cos(theta)*rad;y=(r()-.5)*.045;z=Math.sin(theta)*rad;}
      const yy=y*.89-z*.46;z=y*.46+z*.89;y=yy;const xx=x*.96+y*.28;y=-x*.28+y*.96;x=xx;
    } else if(name==='heart') {
      const t=r()*tau, fill=Math.sqrt(r()), thick=(r()-.5)*.7*Math.sqrt(1-fill*.75);
      x=16*Math.pow(Math.sin(t),3)*.125*fill; y=(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*.125*fill+.18;z=thick;
    } else if(name==='torus') {
      const a=r()*tau,b=r()*tau,tube=.52*(.88+r()*.12),rad=1.55+tube*Math.cos(b);
      x=rad*Math.cos(a); y=rad*Math.sin(a);z=tube*Math.sin(b);const yy=y*.77-z*.64;z=y*.64+z*.77;y=yy;
    } else if(name==='helix') {
      const h=r()*4.4-2.2, angle=h*2.65+(i%2)*Math.PI;
      let radius=.93;if(i%7===0)radius=r()*.93;
      x=Math.cos(angle)*radius+(r()-.5)*.08;y=h;z=Math.sin(angle)*radius+(r()-.5)*.08;
      const xx=x*.97-y*.24;y=x*.24+y*.97;x=xx;
    } else throw new Error('Unknown shape: '+name);
    p.set([x,y,z],i*3);
  }
  return p;
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function measureHand(lm) {
  if(!lm || lm.length<21) return null;
  const palm=Math.max(distance(lm[0],lm[9]),.0001);
  let extension=0;
  for(const [tip,pip] of [[8,6],[12,10],[16,14],[20,18]]) {
    extension+=Math.min(2.3,distance(lm[tip],lm[0])/Math.max(distance(lm[pip],lm[0]),.0001));
  }
  const openness=Math.max(0,Math.min(1,(extension/4-.94)/.44));
  return {openness,x:1-lm[9].x,y:lm[9].y,pinch:distance(lm[4],lm[8])/palm};
}
