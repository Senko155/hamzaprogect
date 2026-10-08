import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { canCreateWebGLContext } from '@/lib/webgl';

export type MissionPhase = 'ready' | 'countdown' | 'ascent' | 'orbit' | 'journey' | 'landing' | 'surface' | 'finish';
export type MissionQuality = 'low' | 'medium' | 'high';
type SceneProps = {
  phase: MissionPhase;
  phaseSeconds: number;
  missionSeconds: number;
  firstPerson: boolean;
  paused: boolean;
  tilt: number;
  throttle: number;
  walking: number;
  jumpStarted: number;
  flagName: string;
  quality: MissionQuality;
  showFps: boolean;
  fpsRef: RefObject<HTMLDivElement | null>;
  onLoaded: () => void;
};

type SceneState = Omit<SceneProps, 'onLoaded' | 'fpsRef'>;
const MOBILE = typeof window !== 'undefined' && (
  window.matchMedia('(max-width: 720px)').matches
  || window.matchMedia('(pointer: coarse)').matches
);

export function detectLowEndDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (navigator.hardwareConcurrency || 0) <= 8
    || window.matchMedia('(max-width: 720px)').matches
    || window.matchMedia('(pointer: coarse)').matches
    || navigator.maxTouchPoints > 0
    || (window.devicePixelRatio || 1) <= 1.25;
}

function canvasTexture(paint: (context: CanvasRenderingContext2D, width: number, height: number) => void, width = 1024, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) paint(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function earthMap() {
  return canvasTexture((ctx, w, h) => {
    const ocean = ctx.createLinearGradient(0, 0, 0, h);
    ocean.addColorStop(0, '#387aa2'); ocean.addColorStop(.5, '#14517c'); ocean.addColorStop(1, '#102846');
    ctx.fillStyle = ocean; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#497b70';
    const continents = [[145,160,105,78],[270,300,70,120],[455,145,135,81],[555,270,85,130],[760,170,126,65],[850,320,88,92],[960,180,73,54],[48,335,60,70]];
    continents.forEach(([x,y,rx,ry],i) => {
      ctx.beginPath(); ctx.ellipse(x,y,rx,ry,i*.31,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = i%2 ? '#648873' : '#668b7a';
    });
    ctx.strokeStyle='rgba(218,244,255,.12)'; ctx.lineWidth=2;
    for(let y=70;y<h;y+=68){ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(w*.3,y-28,w*.68,y+29,w,y-9);ctx.stroke();}
    ctx.fillStyle='rgba(225,240,255,.14)';
    for(let i=0;i<500;i++){ctx.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*3,1+Math.random()*2);}
  });
}

function moonMap() {
  return canvasTexture((ctx,w,h) => {
    const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,'#a9a8a3');g.addColorStop(.5,'#777a80');g.addColorStop(1,'#434953');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    for(let i=0;i<370;i++){
      const x=Math.random()*w,y=Math.random()*h,r=3+Math.random()*24;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=i%2?'rgba(27,32,42,.22)':'rgba(233,232,219,.14)';ctx.fill();
      ctx.beginPath();ctx.arc(x-r*.12,y-r*.12,r*.72,Math.PI*1.1,Math.PI*1.9);ctx.strokeStyle='rgba(245,241,224,.18)';ctx.lineWidth=2;ctx.stroke();
    }
  });
}

function moonBumpMap() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#929292'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 460; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 2 + Math.random() * 22;
      const shade = 95 + Math.floor(Math.random() * 72);
      const crater = ctx.createRadialGradient(x - r * .18, y - r * .16, r * .12, x, y, r);
      crater.addColorStop(0, `rgb(${shade - 42},${shade - 42},${shade - 42})`);
      crater.addColorStop(.72, `rgb(${shade},${shade},${shade})`);
      crater.addColorStop(1, `rgb(${Math.min(255, shade + 35)},${Math.min(255, shade + 35)},${Math.min(255, shade + 35)})`);
      ctx.fillStyle = crater; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function cloudMap() {
  return canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w, y = Math.random() * h, rx = 10 + Math.random() * 60, ry = 3 + Math.random() * 14;
      ctx.fillStyle = `rgba(225,239,245,${.08 + Math.random() * .22})`;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, (Math.random() - .5) * .4, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function cityLightMap() {
  return canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 58; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 26 + Math.random() * 30);
      glow.addColorStop(0, 'rgba(255,220,151,.95)'); glow.addColorStop(1, 'rgba(255,170,82,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 36, y - 36, 72, 72);
      for (let dot = 0; dot < 18; dot++) {
        ctx.fillStyle = `rgba(255,211,137,${.28 + Math.random() * .62})`;
        ctx.fillRect(x + (Math.random() - .5) * 32, y + (Math.random() - .5) * 22, 2, 2);
      }
    }
  });
}

function makeRocket(quality: MissionQuality) {
  const group = new THREE.Group();
  const firstStageParts: THREE.Object3D[] = [];
  const low = quality === 'low';
  const metal = (color: number, metalness: number, roughness: number) => low
    ? new THREE.MeshLambertMaterial({ color })
    : new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const white = metal(0xe9e8df,.52,.38);
  const silver = metal(0x939aa2,.82,.28);
  const black = metal(0x222632,.72,.34);
  const orange = metal(0xc87a42,.53,.4);
  const shellParts: THREE.Object3D[] = [];
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.48,.53,4.3,24),white); body.position.y=1.9; group.add(body);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(.7,.76,1.75,24),orange); lower.position.y=-1.08; group.add(lower);firstStageParts.push(lower);
  const blackBand = new THREE.Mesh(new THREE.CylinderGeometry(.56,.56,.23,24),black);blackBand.position.y=.05;group.add(blackBand);firstStageParts.push(blackBand);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(.48,.51,1.3,24),white);upper.position.y=4.75;group.add(upper);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.48,1.15,24),silver);nose.position.y=5.97;group.add(nose);
  shellParts.push(body,lower,blackBand,upper,nose);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    const fin=new THREE.Mesh(new THREE.BoxGeometry(.08,1.18,.55),silver);
    fin.position.set(Math.cos(a)*.49,-2.28,Math.sin(a)*.49);fin.rotation.y=-a;fin.rotation.z=-.12;group.add(fin);firstStageParts.push(fin);shellParts.push(fin);
    const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.19,.29,.48,14),black);nozzle.position.set(Math.cos(a)*.25,-2.23,Math.sin(a)*.25);group.add(nozzle);firstStageParts.push(nozzle);shellParts.push(nozzle);
  }
  for(let y=1;y<5;y+=.72){
    const seam=new THREE.Mesh(new THREE.CylinderGeometry(.49,.49,.025,24),silver);seam.position.y=y;group.add(seam);shellParts.push(seam);
  }
  const cockpit = new THREE.Group();
  cockpit.visible = false;
  const windowCenterY = 4.6, windowZ = -.49, windowRadius = .67;
  const glassGeometry = new THREE.BufferGeometry();
  const windowPositions: number[] = [], windowIndices: number[] = [];
  const rings = 8, sides = 32;
  for (let ring = 0; ring <= rings; ring++) {
    const radius = windowRadius * ring / rings;
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      windowPositions.push(x, y, .15 * (1 - (radius / windowRadius) ** 2));
      if (ring < rings && side < sides) {
        const a = ring * (sides + 1) + side, b = a + sides + 1;
        windowIndices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  glassGeometry.setAttribute('position',new THREE.Float32BufferAttribute(windowPositions,3));
  glassGeometry.setIndex(windowIndices);
  glassGeometry.computeVertexNormals();
  const glass = new THREE.Mesh(glassGeometry,new THREE.MeshBasicMaterial({
    color:0xbcecff,transparent:true,opacity:.075,side:THREE.DoubleSide,depthWrite:false,
  }));
  glass.position.set(0,windowCenterY,windowZ);cockpit.add(glass);
  const frameMaterial = metal(0xaeb8c1,.85,.3);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(windowRadius,.045,8,40),frameMaterial);
  frame.position.set(0,windowCenterY,windowZ-.015);cockpit.add(frame);
  const innerFrame = new THREE.Mesh(new THREE.TorusGeometry(windowRadius-.075,.013,6,40),metal(0x536b7d,.7,.42));
  innerFrame.position.set(0,windowCenterY,windowZ-.02);cockpit.add(innerFrame);
  const rivetGeometry = new THREE.SphereGeometry(.026,8,6);
  const rivetMaterial = new THREE.MeshBasicMaterial({color:0xe1eaf0});
  for(let i=0;i<12;i++){
    const angle=i/12*Math.PI*2;
    const rivet=new THREE.Mesh(rivetGeometry,rivetMaterial);
    rivet.position.set(Math.cos(angle)*windowRadius,windowCenterY+Math.sin(angle)*windowRadius,windowZ-.034);
    cockpit.add(rivet);
  }
  const dashboard = new THREE.Mesh(new THREE.BoxGeometry(1.22,.17,.3),metal(0x263645,.64,.42));
  dashboard.position.set(0,3.68,-.12);cockpit.add(dashboard);
  const instrument = new THREE.Mesh(new THREE.BoxGeometry(.74,.075,.018),new THREE.MeshBasicMaterial({color:0x102a37}));
  instrument.position.set(0,3.77,-.29);cockpit.add(instrument);
  const indicatorGeometry = new THREE.SphereGeometry(.035,8,6);
  [0x5effb1,0x56cfff,0xffd36a,0x73f6d5].forEach((color,index)=>{
    const light=new THREE.Mesh(indicatorGeometry,new THREE.MeshBasicMaterial({color}));
    light.position.set(-.24+index*.16,3.78,-.32);cockpit.add(light);
  });
  group.add(cockpit);
  group.scale.setScalar(.72);
  return { group, firstStageParts, shellParts, cockpit };
}

function makeLaunchSite(quality: MissionQuality) {
  const group = new THREE.Group();
  const low = quality === 'low';
  const concrete = new THREE.MeshLambertMaterial({color:0x59616a});
  const deckMaterial = new THREE.MeshLambertMaterial({color:0x858d91});
  const steel = low
    ? new THREE.MeshLambertMaterial({color:0x98a8b0})
    : new THREE.MeshStandardMaterial({color:0x98a8b0,metalness:.68,roughness:.42});
  const darkSteel = low
    ? new THREE.MeshLambertMaterial({color:0x394550})
    : new THREE.MeshStandardMaterial({color:0x394550,metalness:.52,roughness:.48});
  const marking = new THREE.MeshBasicMaterial({color:0xc5b898});
  const warning = new THREE.MeshBasicMaterial({color:0xffa24a});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(180,180),concrete);
  ground.rotation.x=-Math.PI/2;ground.position.set(0,-2.76,-2);group.add(ground);
  const pad = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(3.35,3.5,.18,32),deckMaterial);
  slab.position.y=-2.18;pad.add(slab);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.15,2.55,.55,24),darkSteel);
  pedestal.position.y=-2.51;pad.add(pedestal);
  const supportGeometry=new THREE.BoxGeometry(.2,2.48,.2),supports=new THREE.InstancedMesh(supportGeometry,steel,4),dummy=new THREE.Object3D();
  for(let i=0;i<4;i++){
    const angle=i*Math.PI/2;dummy.position.set(Math.cos(angle)*1.5,-1.32,Math.sin(angle)*1.5);dummy.updateMatrix();supports.setMatrixAt(i,dummy.matrix);
  }
  supports.instanceMatrix.needsUpdate=true;pad.add(supports);
  const trench = new THREE.Mesh(new THREE.BoxGeometry(2.4,.14,12),darkSteel);
  trench.position.set(0,-2.66,-7.15);pad.add(trench);
  const wallGeometry=new THREE.BoxGeometry(.16,.42,12),walls=new THREE.InstancedMesh(wallGeometry,steel,2);
  for(let i=0;i<2;i++){dummy.position.set(i===0?-1.32:1.32,-2.48,-7.15);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);}
  walls.instanceMatrix.needsUpdate=true;pad.add(walls);
  const trenchGlow = new THREE.Mesh(new THREE.BoxGeometry(1.65,.025,7.5),warning);
  trenchGlow.position.set(0,-2.565,-7.15);trenchGlow.visible=false;pad.add(trenchGlow);
  const stripeGeometry=new THREE.BoxGeometry(.055,.012,4.7),stripes=new THREE.InstancedMesh(stripeGeometry,marking,5);
  for(let i=-2;i<=2;i++){dummy.position.set(i*.42,-2.08,0);dummy.updateMatrix();stripes.setMatrixAt(i+2,dummy.matrix);}
  stripes.instanceMatrix.needsUpdate=true;pad.add(stripes);
  group.add(pad);

  const tower = new THREE.Group();
  tower.position.x=2.55;
  const columnGeometry=new THREE.BoxGeometry(.13,8.6,.13),columns=new THREE.InstancedMesh(columnGeometry,steel,4);
  let instance=0;
  for(const x of [-.9,.9])for(const z of [-.52,.52]){
    dummy.position.set(x,1.47,z);dummy.updateMatrix();columns.setMatrixAt(instance++,dummy.matrix);
  }
  columns.instanceMatrix.needsUpdate=true;tower.add(columns);
  const crossbarGeometry=new THREE.BoxGeometry(1.9,.11,.11);
  const depthBarGeometry=new THREE.BoxGeometry(.11,.11,1.13);
  const levels:number[]=[];
  for(let y=-2.3;y<=5.3;y+=1.1){
    levels.push(y);
  }
  const crossbars=new THREE.InstancedMesh(crossbarGeometry,steel,levels.length*2),depthBars=new THREE.InstancedMesh(depthBarGeometry,steel,levels.length);
  levels.forEach((y,index)=>{
    dummy.position.set(0,y,.52);dummy.updateMatrix();crossbars.setMatrixAt(index*2,dummy.matrix);
    dummy.position.z=-.52;dummy.updateMatrix();crossbars.setMatrixAt(index*2+1,dummy.matrix);
    dummy.position.set(.9,y,0);dummy.updateMatrix();depthBars.setMatrixAt(index,dummy.matrix);
  });
  crossbars.instanceMatrix.needsUpdate=true;depthBars.instanceMatrix.needsUpdate=true;tower.add(crossbars,depthBars);
  const braceGeometry=new THREE.BoxGeometry(.07,1.4,.07);
  const braces=new THREE.InstancedMesh(braceGeometry,steel,6);instance=0;
  for(let y=-1.75;y<4.5;y+=2.2)for(const x of [-.45,.45]){
    dummy.position.set(x,y,.52);dummy.rotation.set(0,0,x<0?-.7:.7);dummy.updateMatrix();braces.setMatrixAt(instance++,dummy.matrix);
  }
  braces.instanceMatrix.needsUpdate=true;tower.add(braces);
  const armAssembly=new THREE.Group();
  const armGeometry=new THREE.BoxGeometry(1.68,.16,.19),contactGeometry=new THREE.BoxGeometry(.18,.25,.28);
  const arms=new THREE.InstancedMesh(armGeometry,steel,3),contacts=new THREE.InstancedMesh(contactGeometry,darkSteel,3);instance=0;
  for(const y of [0.25,2.55,4.35]){
    dummy.position.set(-.84,y,.08);dummy.rotation.set(0,0,0);dummy.updateMatrix();arms.setMatrixAt(instance,dummy.matrix);
    dummy.position.set(-1.62,y,.08);dummy.updateMatrix();contacts.setMatrixAt(instance,dummy.matrix);instance++;
  }
  arms.instanceMatrix.needsUpdate=true;contacts.instanceMatrix.needsUpdate=true;armAssembly.add(arms,contacts);
  armAssembly.position.set(0,-.68,0);tower.add(armAssembly);
  const walkwayGeometry=new THREE.BoxGeometry(.55,.08,1.28),walkways=new THREE.InstancedMesh(walkwayGeometry,darkSteel,2);
  for(const x of [-.95,.95]){
    dummy.position.set(x,2.58,0);dummy.updateMatrix();walkways.setMatrixAt(x<0?0:1,dummy.matrix);
  }
  walkways.instanceMatrix.needsUpdate=true;tower.add(walkways);
  const beaconGeometry=new THREE.SphereGeometry(.085,8,6);
  const beacons=new THREE.InstancedMesh(beaconGeometry,warning,2);
  for(const z of [-.52,.52]){
    dummy.position.set(0,5.85,z);dummy.updateMatrix();beacons.setMatrixAt(z<0?0:1,dummy.matrix);
  }
  beacons.instanceMatrix.needsUpdate=true;tower.add(beacons);
  group.add(tower);

  const hills = new THREE.Group();
  const hillMaterial = new THREE.MeshLambertMaterial({color:0x667c88});
  for(const [x,z,sx,sy,sz] of [[-20,-38,18,3.1,8],[7,-48,21,4.2,10],[32,-42,17,2.8,8]] as const){
    const hill=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),hillMaterial);
    hill.position.set(x,-.65,z);hill.scale.set(sx,sy,sz);hills.add(hill);
  }
  group.add(hills);
  return {group,ground,pad,tower,hills,armAssembly,trenchGlow};
}

function makeAstronaut(quality: MissionQuality) {
  const g=new THREE.Group();
  const low=quality==='low';
  const suit=low?new THREE.MeshLambertMaterial({color:0xd8e3e4}):new THREE.MeshStandardMaterial({color:0xd8e3e4,roughness:.86});
  const dark=low?new THREE.MeshLambertMaterial({color:0x172333}):new THREE.MeshStandardMaterial({color:0x172333,metalness:.35,roughness:.55});
  const gold=low?new THREE.MeshLambertMaterial({color:0xc8a65b}):new THREE.MeshStandardMaterial({color:0xc8a65b,metalness:.72,roughness:.24});
  const torso=new THREE.Mesh(new THREE.IcosahedronGeometry(.34,1),suit);torso.position.y=1.22;g.add(torso);
  const pack=new THREE.Mesh(new THREE.BoxGeometry(.37,.58,.23),dark);pack.position.set(0,1.23,-.29);g.add(pack);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.24,12,10),suit);head.position.y=1.73;g.add(head);
  const visor=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8),gold);visor.scale.set(1,.78,.42);visor.position.set(0,1.75,.19);g.add(visor);
  for(const side of [-1,1]){
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(.085,.11,.55,7),suit);arm.position.set(side*.37,1.23,0);arm.rotation.z=side*-.32;g.add(arm);
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.12,.1,.55,7),suit);leg.position.set(side*.15,.63,0);leg.rotation.z=side*.06;g.add(leg);
    const boot=new THREE.Mesh(new THREE.BoxGeometry(.2,.13,.34),dark);boot.position.set(side*.15,.34,.06);g.add(boot);
  }
  return g;
}

function MissionCanvasFallback({ state, fpsRef }: { state: SceneState; fpsRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentState = useRef(state);
  currentState.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stars = Array.from({ length: MOBILE ? 95 : 180 }, (_, i) => ({
      x: ((i * 83 + 19) % 997) / 997,
      y: ((i * 137 + 43) % 991) / 991,
      r: .5 + ((i * 17) % 9) / 10,
    }));
    let raf = 0, fpsFrames = 0, fpsSince = 0,lastPresentedFrame=0;
    let width = 0, height = 0, ratio = 1,lastFrame=0,budgetElapsed=0,budgetTotal=0,budgetFrames=0;
    const baseRatio=Math.min(devicePixelRatio||1,state.quality==='low'?1:state.quality==='medium'?1.25:1.8);
    const resize = () => {
      width = canvas.clientWidth || innerWidth;
      height = canvas.clientHeight || innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    window.addEventListener('resize', resize);
    resize();

    const draw = (now: number) => {
      if(document.hidden){cancelAnimationFrame(raf);raf=0;return;}
      if(now-lastPresentedFrame<1000/60-.5){raf=requestAnimationFrame(draw);return;}
      lastPresentedFrame=now;
      const frameDelta=lastFrame?Math.min((now-lastFrame)/1000,.08):1/60;lastFrame=now;
      budgetElapsed+=frameDelta;budgetTotal+=frameDelta;budgetFrames++;
      if(budgetElapsed>=1){
        const average=budgetTotal/budgetFrames;
        const nextRatio=average>.025?Math.max(.65,ratio-.08):average<.017?Math.min(baseRatio,ratio+.04):ratio;
        if(nextRatio!==ratio){ratio=nextRatio;resize();}
        budgetElapsed=0;budgetTotal=0;budgetFrames=0;
      }
      const s = currentState.current;
      fpsFrames++;
      if(now-fpsSince>=200){
        if(fpsSince>0&&fpsRef.current)fpsRef.current.textContent=`${Math.round(fpsFrames*1000/(now-fpsSince))} FPS`;
        fpsSince=now;fpsFrames=0;
      }
      const t = s.phaseSeconds;
      const p = s.phase === 'ascent' ? Math.min(t / 510, 1) : s.phase === 'journey' ? Math.min(t / 155, 1) : s.phase === 'landing' ? Math.min(t / 58, 1) : 0;
      ctx.clearRect(0, 0, width, height);
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, s.phase === 'ready' || s.phase === 'countdown' ? '#547da8' : '#070a15');
      sky.addColorStop(.62, s.phase === 'ready' || s.phase === 'countdown' ? '#182b46' : '#090c18');
      sky.addColorStop(1, '#080b15');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);

      const starOpacity = s.phase === 'ready' || s.phase === 'countdown' ? .45 : .9;
      for(let i=0;i<stars.length;i++){
        const star=stars[i];
        ctx.globalAlpha = starOpacity * (.55 + (reduceMotion ? .25 : .45 * Math.sin(now * .001 + i)));
        ctx.fillStyle = '#deefff'; ctx.beginPath(); ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      const drawPlanet = (x: number, y: number, radius: number, base: string, land: string) => {
        const glow = ctx.createRadialGradient(x - radius * .26, y - radius * .31, radius * .08, x, y, radius * 1.2);
        glow.addColorStop(0, '#b8e6ff'); glow.addColorStop(.12, base); glow.addColorStop(.8, land); glow.addColorStop(1, '#07101d');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius * .92, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = 'rgba(134,202,179,.28)'; ctx.lineWidth = Math.max(1, radius * .04);
        for (let i = 0; i < 5; i++) {
          ctx.beginPath(); ctx.ellipse(x - radius * .15 + i * radius * .1, y - radius * .2 + i * radius * .19, radius * (.3 + i * .08), radius * .12, -.5, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(242,250,255,.18)'; ctx.lineWidth = Math.max(1, radius * .02);
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.ellipse(x, y + i * radius * .22, radius * .96, radius * .1, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      };
      const drawMoon = (x: number, y: number, radius: number) => {
        const surface = ctx.createRadialGradient(x - radius * .3, y - radius * .35, radius * .05, x, y, radius);
        surface.addColorStop(0, '#c4c4be'); surface.addColorStop(.55, '#898b8e'); surface.addColorStop(1, '#353b45');
        ctx.fillStyle = surface; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius * .94, 0, Math.PI * 2); ctx.clip();
        for (let i = 0; i < 45; i++) {
          const x1 = x + Math.sin(i * 31.7) * radius * .84;
          const y1 = y + Math.cos(i * 17.3) * radius * .8;
          const crater = Math.max(1.5, radius * (.016 + (i % 5) * .008));
          ctx.fillStyle = 'rgba(38,43,51,.27)'; ctx.beginPath(); ctx.arc(x1, y1, crater, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(240,240,232,.19)'; ctx.lineWidth = Math.max(1, crater * .25); ctx.stroke();
        }
        ctx.restore();
      };
      const drawRocket = (x: number, baseY: number, scale: number, lit: boolean) => {
        ctx.save(); ctx.translate(x, baseY); ctx.scale(scale, scale);
        if (lit) {
          const flame = 76 + Math.sin(now * .023) * 12;
          const plume = ctx.createLinearGradient(0, 5, 0, flame);
          plume.addColorStop(0, 'rgba(255,250,212,.98)'); plume.addColorStop(.26, 'rgba(255,164,64,.9)'); plume.addColorStop(1, 'rgba(255,105,40,0)');
          ctx.fillStyle = plume; ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(0, flame); ctx.lineTo(17, 0); ctx.fill();
        }
        ctx.fillStyle = '#dce3e6'; ctx.fillRect(-17, -170, 34, 150);
        ctx.fillStyle = '#87939e'; ctx.beginPath(); ctx.moveTo(-17, -170); ctx.lineTo(0, -224); ctx.lineTo(17, -170); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1b2533'; ctx.fillRect(-17, -109, 34, 22);
        ctx.fillStyle = '#d98948'; ctx.fillRect(-22, -20, 44, 35);
        ctx.fillStyle = '#a7b1ba'; ctx.fillRect(-8, 13, 16, 26);
        ctx.fillStyle = '#aeb8c0';
        ctx.beginPath(); ctx.moveTo(-18, -19); ctx.lineTo(-37, 18); ctx.lineTo(-18, 11); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(18, -19); ctx.lineTo(37, 18); ctx.lineTo(18, 11); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      const drawEarthHorizon = (progress: number) => {
        const radius = Math.max(width * .62, height * 1.1);
        const x = width * .5, y = height + radius * .52 - progress * height * .2;
        drawPlanet(x, y, radius, '#277ba5', '#0f354d');
        ctx.strokeStyle = 'rgba(113,221,255,.36)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y - radius * .9, radius * .82, radius * .12, 0, Math.PI, Math.PI * 2); ctx.stroke();
      };
      const drawLaunchPad = () => {
        const groundY=height*.78;
        const ground=ctx.createLinearGradient(0,groundY,0,height);
        ground.addColorStop(0,'#4b5f6b');ground.addColorStop(1,'#202d36');
        ctx.fillStyle=ground;ctx.fillRect(0,groundY,width,height-groundY);
        ctx.fillStyle='#9aa4a6';ctx.fillRect(width*.5-92,groundY-7,184,12);
        ctx.fillStyle='#323f49';ctx.fillRect(width*.5-24,groundY-3,48,20);
        ctx.fillStyle='rgba(255,177,91,.5)';ctx.fillRect(width*.5-45,groundY+14,90,4);
        const towerX=width*.5+Math.min(width*.13,78);
        ctx.strokeStyle='#98a9b4';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(towerX,groundY);ctx.lineTo(towerX,height*.15);ctx.stroke();
        ctx.lineWidth=2;
        for(let y=groundY-22;y>height*.18;y-=24){
          ctx.beginPath();ctx.moveTo(towerX-18,y);ctx.lineTo(towerX+18,y);ctx.moveTo(towerX-16,y);ctx.lineTo(towerX+16,y-22);ctx.stroke();
        }
        ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(towerX,groundY-85);ctx.lineTo(width*.5+22,groundY-85);ctx.moveTo(towerX,groundY-150);ctx.lineTo(width*.5+22,groundY-150);ctx.stroke();
        ctx.fillStyle='#e3bc78';ctx.fillRect(width*.5-32,groundY-2,64,3);
      };

      if (s.phase === 'ready' || s.phase === 'countdown' || s.phase === 'ascent') {
        const launchVisible=s.phase!=='ascent'||t<85;
        if(launchVisible)drawLaunchPad();
        else drawEarthHorizon(Math.min((p-.16)/.84,1));
        const ascent = s.phase === 'ascent' ? p : 0;
        const scale=Math.max(.68, Math.min(width / 850, 1.02));
        const rocketX = width * .5, rocketY = launchVisible ? height*.78-39*scale-ascent*height*.08 : height * .56 - ascent * height * .35;
        if (s.phase === 'countdown' && t > 2 || s.phase === 'ascent' && t < 165) {
          for (let i = 0; i < (s.quality==='low' ? 10 : 18); i++) {
            const x = rocketX + Math.sin(now * .001 + i) * (26 + i * 3);
            const y = launchVisible ? height*.77+((now*.018+i*15)%35) : rocketY + 32 + ((now * .03 + i * 29) % 90);
            ctx.fillStyle = `rgba(202,213,222,${.09 + (i % 4) * .04})`; ctx.beginPath(); ctx.arc(x, y, 9 + (i % 6) * 2, 0, Math.PI * 2); ctx.fill();
          }
        }
        drawRocket(rocketX, rocketY, scale, s.phase === 'countdown' && t > 2 || s.phase === 'ascent' && t < 390);
      } else if (s.phase === 'orbit') {
        drawPlanet(width * .36, height * .7, Math.min(width, height) * .34, '#277ba5', '#0f354d');
        ctx.strokeStyle = 'rgba(114,220,255,.45)'; ctx.setLineDash([5, 9]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(width * .36, height * .7, Math.min(width, height) * .41, Math.min(width, height) * .16, -.2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        const a = t / 18 * Math.PI * 2;
        drawRocket(width * .36 + Math.cos(a) * Math.min(width, height) * .39, height * .7 + Math.sin(a) * Math.min(width, height) * .15, .34, false);
      } else if (s.phase === 'journey') {
        const radius = Math.min(width, height);
        drawPlanet(width * (.2 - .06 * p), height * .67, radius * (.22 - .1 * p), '#277ba5', '#0f354d');
        drawMoon(width * (.81 - .17 * p), height * .56, radius * (.08 + .23 * p));
        ctx.strokeStyle = 'rgba(115,219,255,.46)'; ctx.setLineDash([3, 9]);
        ctx.beginPath(); ctx.moveTo(width * .28, height * .63); ctx.quadraticCurveTo(width * .53, height * .25, width * .77, height * .55); ctx.stroke(); ctx.setLineDash([]);
        drawRocket(width * .49, height * .57, .36, false);
      } else if (s.phase === 'landing') {
        drawMoon(width * .54, height * .76, Math.max(width, height) * .66);
        const landerX = width * .56, landerY = height * (.22 + p * .45);
        ctx.fillStyle = '#d8c48b'; ctx.fillRect(landerX - 24, landerY - 46, 48, 29);
        ctx.fillStyle = '#c3ccd0'; ctx.strokeStyle = '#c3ccd0'; ctx.lineWidth = 3;
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(landerX + side * 15, landerY - 17); ctx.lineTo(landerX + side * 30, landerY + 12); ctx.stroke(); }
        if (p < .82 && s.throttle > .04) {
          const plume = ctx.createLinearGradient(0, landerY - 16, 0, landerY + 92);
          plume.addColorStop(0, 'rgba(255,250,212,.95)'); plume.addColorStop(.28, 'rgba(255,161,63,.8)'); plume.addColorStop(1, 'rgba(255,145,70,0)');
          ctx.fillStyle = plume; ctx.beginPath(); ctx.moveTo(landerX - 11, landerY - 17); ctx.lineTo(landerX, landerY + 92); ctx.lineTo(landerX + 11, landerY - 17); ctx.fill();
        }
        if (p > .3) {
          for (let i = 0; i < (MOBILE ? 14 : 26); i++) {
            const dustX = landerX + Math.sin(now * .001 + i) * (18 + i * 2);
            ctx.fillStyle = `rgba(196,190,175,${.05 + (i % 5) * .025})`; ctx.beginPath(); ctx.arc(dustX, height * .78 + Math.cos(now * .001 + i) * 9, 8 + i % 7, 0, Math.PI * 2); ctx.fill();
          }
        }
        drawPlanet(width * .84, height * .19, Math.min(width, height) * .045, '#287aab', '#123c5d');
      } else {
        drawMoon(width * .54, height * .68, Math.max(width, height) * .66);
        ctx.fillStyle = '#555960'; ctx.fillRect(0, height * .79, width, height * .21);
        ctx.strokeStyle = 'rgba(238,239,227,.16)'; ctx.lineWidth = 1;
        for (let i = 0; i < 13; i++) { const x = (i * 107 + 20) % width, y = height * (.81 + (i % 4) * .04); ctx.beginPath(); ctx.ellipse(x, y, 5 + i % 9, 2 + i % 4, 0, 0, Math.PI * 2); ctx.stroke(); }
        // The surface fallback preserves the landmark interaction when this browser cannot create WebGL.
        const landerX = width * .57, landerY = height * .72;
        ctx.fillStyle = '#d8c48b'; ctx.fillRect(landerX - 21, landerY - 45, 42, 27);
        ctx.fillStyle = '#b7c2c8'; ctx.strokeStyle = '#b7c2c8'; ctx.lineWidth = 3;
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(landerX + side * 14, landerY - 16); ctx.lineTo(landerX + side * 28, landerY + 8); ctx.stroke(); }
         const exitProgress = Math.min(t / 8, 1);
         const walkerX = width * (.58 - exitProgress * .01 + s.walking / 100 * .19);
         const jumpAge = (now - s.jumpStarted) / 1000;
         const jumpLift = s.jumpStarted > 0 && jumpAge >= 0 && jumpAge < 1.8 ? Math.sin(Math.PI * jumpAge / 1.8) : 0;
         const walkerY = t < 8 ? height * (.5 + exitProgress * .2) : height * .7 - jumpLift * height * .14;
         ctx.fillStyle = '#e2ebed'; ctx.beginPath(); ctx.arc(walkerX, walkerY, 11, 0, Math.PI * 2); ctx.fill();
         ctx.fillRect(walkerX - 8, walkerY + 11, 16, 31);
         ctx.strokeStyle = '#dde7e8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(walkerX - 4, walkerY + 24); ctx.lineTo(walkerX - 12, walkerY + 38); ctx.moveTo(walkerX + 4, walkerY + 24); ctx.lineTo(walkerX + 12, walkerY + 38); ctx.stroke();
        drawPlanet(width * .83, height * .2, Math.min(width, height) * .045, '#287aab', '#123c5d');
        if (s.flagName) {
          const flagX = width * .77, flagY = height * .67;
          ctx.strokeStyle = '#d0d5d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(flagX, flagY + 50); ctx.lineTo(flagX, flagY - 15); ctx.stroke();
          ctx.fillStyle = '#087d50'; ctx.fillRect(flagX, flagY - 14, 64, 35);
          ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillStyle = '#f5f4df'; ctx.font = 'bold 9px Tajawal, sans-serif'; ctx.fillText(s.flagName, flagX + 32, flagY + 8);
        }
      }
      if (!reduceMotion && !s.paused) {
        // Ambient star twinkle remains subtle; mission timing itself is controlled by React.
      }
      raf = requestAnimationFrame(draw);
    };
    const onVisibility=()=>{
      if(document.hidden){cancelAnimationFrame(raf);raf=0;}
      else if(!raf){lastFrame=0;lastPresentedFrame=0;raf=requestAnimationFrame(draw);}
    };
    document.addEventListener('visibilitychange',onVisibility);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange',onVisibility); };
  }, []);

  return <canvas ref={canvasRef} className="mission-canvas-fallback" aria-hidden="true" />;
}

export default function MissionScene(props: SceneProps) {
  const hostRef=useRef<HTMLDivElement>(null);
  const fpsRef=props.fpsRef;
  const stateRef=useRef<SceneState>(props);
  stateRef.current=props;
  const [fallback,setFallback]=useState(false);

  useEffect(() => {
    const host=hostRef.current;
    if(!host)return;
    if(!canCreateWebGLContext()){
      host.parentElement?.classList.add('mission-fallback-active');
      setFallback(true);
      props.onLoaded();
      return;
    }
    const quality=props.quality;
    const lowQuality=quality==='low';
    const mediumQuality=quality==='medium';
    const planetSegments=lowQuality?24:mediumQuality?32:42;
    let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({antialias:!lowQuality,alpha:false,powerPreference:'low-power'});}
     catch {host.parentElement?.classList.add('mission-fallback-active');setFallback(true);props.onLoaded();return;}
    let viewWidth=1,viewHeight=1;
    const basePixelRatio=lowQuality?1:mediumQuality?1.25:1.8;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,basePixelRatio));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
    const scene=new THREE.Scene();
    const skyColor=new THREE.Color(0x9ab6c9);
    const dawnColor=new THREE.Color(0x9ab6c9);
    const spaceColor=new THREE.Color(0x050813);
    const fogColor=new THREE.Color(0xeaf3f6);
    scene.background=skyColor;
    const atmosphereFog=new THREE.Fog(skyColor,65,150);scene.fog=atmosphereFog;
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const camera=new THREE.PerspectiveCamera(48,1,.05,180); camera.position.set(0,4.5,16);
    const cameraTarget=new THREE.Vector3(0,1,0);
    host.appendChild(renderer.domElement);
    const sun=new THREE.DirectionalLight(0xffd3a2,2.4);sun.position.set(-7,8,8);sun.castShadow=quality==='high';
    renderer.shadowMap.enabled=quality==='high';renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    sun.shadow.mapSize.set(512,512);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-18;
    scene.add(sun);
    const engineLight=new THREE.PointLight(0xff813d,0,26,2);scene.add(engineLight);
    const starsGeo=new THREE.BufferGeometry(), starCount=lowQuality?900:mediumQuality?1450:2200, starPos=new Float32Array(starCount*3);
    for(let i=0;i<starCount;i++){starPos[i*3]=(Math.random()-.5)*92;starPos[i*3+1]=(Math.random()-.5)*57;starPos[i*3+2]=-10-Math.random()*45;}
    starsGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
    const starsMaterial=new THREE.PointsMaterial({color:0xdcecff,size:lowQuality?.09:.075,transparent:true,opacity:.9,sizeAttenuation:true});
    const stars=new THREE.Points(starsGeo,starsMaterial);scene.add(stars);

    const earthMaterial=lowQuality
      ? new THREE.MeshLambertMaterial({map:earthMap()})
      : new THREE.MeshStandardMaterial({map:earthMap(),roughness:.83,metalness:.04});
    const earth=new THREE.Mesh(new THREE.SphereGeometry(4.8,planetSegments,Math.round(planetSegments*.7)),earthMaterial);
    earth.position.set(0,-8,-10);scene.add(earth);
    const earthGlow=new THREE.Mesh(new THREE.SphereGeometry(4.94,planetSegments,Math.round(planetSegments*.7)),new THREE.MeshBasicMaterial({color:0x45baff,transparent:true,opacity:.18,side:THREE.BackSide}));earthGlow.position.copy(earth.position);scene.add(earthGlow);
    const cityTexture=lowQuality?null:cityLightMap();
    const sunDirection=new THREE.Vector3(-.62, .35, .7).normalize();
    const cityUniforms = {
      uCityMap: { value: cityTexture },
      uSunDirection: { value: sunDirection.clone() },
    };
    const cityLights = new THREE.Mesh(
      new THREE.SphereGeometry(4.83, planetSegments, Math.round(planetSegments*.7)),
      new THREE.ShaderMaterial({
        uniforms: cityUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; varying vec3 vLocalNormal; void main(){vUv=uv;vLocalNormal=normalize(normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform sampler2D uCityMap; uniform vec3 uSunDirection; varying vec2 vUv; varying vec3 vLocalNormal; void main(){float daylight=dot(normalize(vLocalNormal),normalize(uSunDirection));float night=1.0-smoothstep(-0.12,0.12,daylight);vec4 city=texture2D(uCityMap,vUv);gl_FragColor=vec4(city.rgb,city.a*night);}`,
      }),
    );
    cityLights.position.copy(earth.position);scene.add(cityLights);
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(4.86, planetSegments, Math.round(planetSegments*.7)),
      new THREE.MeshBasicMaterial({ map: cloudMap(), color: 0xd9efff, transparent: true, opacity: .34, depthWrite: false }),
    );
    clouds.position.copy(earth.position);scene.add(clouds);
    const moonGroup=new THREE.Group();scene.add(moonGroup);
    const moonTexture=moonMap();
    const moonMaterial=lowQuality
      ? new THREE.MeshLambertMaterial({map:moonTexture})
      : new THREE.MeshStandardMaterial({map:moonTexture,bumpMap:moonBumpMap(),bumpScale:.16,roughness:1,metalness:0});
    const moon=new THREE.Mesh(new THREE.SphereGeometry(2.3,planetSegments,Math.round(planetSegments*.7)),moonMaterial);
    moonGroup.add(moon);
    const craterMat=lowQuality?new THREE.MeshLambertMaterial({color:0x686c72}):new THREE.MeshStandardMaterial({color:0x686c72,roughness:1});
    const craterGeometry=new THREE.CircleGeometry(.09,7);
    const unitForward=new THREE.Vector3(0,0,1);
    for(let i=0;i<(lowQuality?18:mediumQuality?32:48);i++){
      const theta=Math.random()*Math.PI*2, phi=Math.acos(2*Math.random()-1), r=2.3;
      const p=new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
      const crater=new THREE.Mesh(craterGeometry,craterMat);
      crater.scale.setScalar(.4+Math.random()*.9);
      crater.position.copy(p.multiplyScalar(r*.997)); crater.quaternion.setFromUnitVectors(unitForward,p.clone().normalize());moonGroup.add(crater);
    }
    const rocketBuild=makeRocket(quality);const rocket=rocketBuild.group;scene.add(rocket);
    const escapeTower=new THREE.Group();
    const towerMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0xb8c0c6}):new THREE.MeshStandardMaterial({color:0xb8c0c6,metalness:.72,roughness:.3});
    const towerShaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,1.05,8),towerMaterial);escapeTower.add(towerShaft);
    const towerTip=new THREE.Mesh(new THREE.ConeGeometry(.11,.34,8),lowQuality?new THREE.MeshLambertMaterial({color:0xc9824a}):new THREE.MeshStandardMaterial({color:0xc9824a,metalness:.48,roughness:.4}));towerTip.position.y=.68;escapeTower.add(towerTip);
    const towerBrace=new THREE.Mesh(new THREE.BoxGeometry(.28,.06,.08),towerMaterial);towerBrace.position.y=-.28;escapeTower.add(towerBrace);scene.add(escapeTower);
    const fairings=new THREE.Group();
    const fairingMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0xdddcd4,side:THREE.DoubleSide}):new THREE.MeshStandardMaterial({color:0xdddcd4,metalness:.58,roughness:.32,side:THREE.DoubleSide});
    for(let i=0;i<2;i++){const shell=new THREE.Mesh(new THREE.CylinderGeometry(.1,.43,.92,12,1,true,i*Math.PI,Math.PI),fairingMaterial);shell.position.y=4.22;shell.rotation.y=i*Math.PI;fairings.add(shell);}
    scene.add(fairings);
    const stage2=new THREE.Mesh(new THREE.CylinderGeometry(.3,.38,1.7,16),lowQuality?new THREE.MeshLambertMaterial({color:0xe3e2d9}):new THREE.MeshStandardMaterial({color:0xe3e2d9,metalness:.55,roughness:.4}));scene.add(stage2);
    const booster=new THREE.Mesh(new THREE.CylinderGeometry(.55,.72,1.55,18),lowQuality?new THREE.MeshLambertMaterial({color:0xb87545}):new THREE.MeshStandardMaterial({color:0xb87545,metalness:.62,roughness:.39}));scene.add(booster);
    const stage2Flame=new THREE.Mesh(new THREE.ConeGeometry(.22,1.1,12),new THREE.MeshBasicMaterial({color:0x7fdcff,transparent:true,opacity:.86}));stage2Flame.rotation.x=Math.PI;scene.add(stage2Flame);
    const smokeGeo=new THREE.BufferGeometry(), puffCount=lowQuality?120:mediumQuality?220:360, puffPositions=new Float32Array(puffCount*3);
    const puffVel=new Float32Array(puffCount*3);
    for(let i=0;i<puffCount;i++){
      const side=i%2===0?-1:1;
      puffPositions[i*3]=(Math.random()-.5)*1.2;puffPositions[i*3+1]=-2.48+Math.random()*.22;puffPositions[i*3+2]=(Math.random()-.5)*1.5;
      puffVel[i*3]=side*(.24+Math.random()*.55);puffVel[i*3+1]=.04+Math.random()*.16;puffVel[i*3+2]=(Math.random()-.5)*.3;
    }
    smokeGeo.setAttribute('position',new THREE.BufferAttribute(puffPositions,3));
    smokeGeo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,-2.3,0),8);
    const smokeMaterial=new THREE.PointsMaterial({color:0xc6d5e4,size:lowQuality?.3:.42,transparent:true,opacity:.4,depthWrite:false});
    const smoke=new THREE.Points(smokeGeo,smokeMaterial);scene.add(smoke);
    const flame=new THREE.Mesh(new THREE.ConeGeometry(.43,2.15,12),new THREE.MeshBasicMaterial({color:0xffa243,transparent:true,opacity:.88})); flame.rotation.x=Math.PI; flame.position.y=-3.6;rocket.add(flame);
    const exhaustCount=lowQuality?120:mediumQuality?190:260, exhaustGeo=new THREE.BufferGeometry(), exhaustPositions=new Float32Array(exhaustCount*3), exhaustVel=new Float32Array(exhaustCount*3);
    for(let i=0;i<exhaustCount;i++){exhaustPositions[i*3]=(Math.random()-.5)*.42;exhaustPositions[i*3+1]=-Math.random()*2.1;exhaustPositions[i*3+2]=(Math.random()-.5)*.42;exhaustVel[i*3]=(Math.random()-.5)*.18;exhaustVel[i*3+1]=-.45-Math.random()*.7;exhaustVel[i*3+2]=(Math.random()-.5)*.18;}
    exhaustGeo.setAttribute('position',new THREE.BufferAttribute(exhaustPositions,3));
    exhaustGeo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,0),42);
    const exhaust=new THREE.Points(exhaustGeo,new THREE.PointsMaterial({color:0xffb557,size:lowQuality?.17:.14,transparent:true,opacity:.87,blending:THREE.AdditiveBlending,depthWrite:false}));
    scene.add(exhaust);exhaust.visible=false;
    const launchSite=makeLaunchSite(quality);scene.add(launchSite.group);
    const launchSkyTexture=canvasTexture((ctx,w,h)=>{
      const gradient=ctx.createLinearGradient(0,0,0,h);
      gradient.addColorStop(0,'#85a9c9');gradient.addColorStop(.58,'#b8c9cf');gradient.addColorStop(1,'#edc1a0');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    },256,128);
    const launchSky=new THREE.Mesh(new THREE.SphereGeometry(98,16,10),new THREE.MeshBasicMaterial({map:launchSkyTexture,side:THREE.BackSide}));
    scene.add(launchSky);
    const lunarFloorMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0x777b80}):new THREE.MeshStandardMaterial({color:0x777b80,roughness:1,metalness:0});
    const lunarFloor=new THREE.Mesh(new THREE.PlaneGeometry(180,180,48,48),lunarFloorMaterial);
    lunarFloor.rotation.x=-Math.PI/2;lunarFloor.position.y=-.18;lunarFloor.receiveShadow=true;scene.add(lunarFloor);
    const floorPos=lunarFloor.geometry.attributes.position as THREE.BufferAttribute;
    for(let i=0;i<floorPos.count;i++){const x=floorPos.getX(i),z=floorPos.getY(i);floorPos.setZ(i,Math.sin(x*.16)*.1+Math.cos(z*.19)*.08+Math.sin((x+z)*.4)*.025);} floorPos.needsUpdate=true;lunarFloor.geometry.computeVertexNormals();
    const lander=new THREE.Group();scene.add(lander);
    const landerFlame=new THREE.Mesh(new THREE.ConeGeometry(.31,1.25,12),new THREE.MeshBasicMaterial({color:0xffa347,transparent:true,opacity:.88,blending:THREE.AdditiveBlending,depthWrite:false}));
    landerFlame.rotation.x=Math.PI;landerFlame.position.y=.52;landerFlame.visible=false;lander.add(landerFlame);
    const lunarGold=lowQuality?new THREE.MeshLambertMaterial({color:0xd9c48b}):new THREE.MeshStandardMaterial({color:0xd9c48b,metalness:.54,roughness:.4});
    const lunarMetal=lowQuality?new THREE.MeshLambertMaterial({color:0xb9c0c0}):new THREE.MeshStandardMaterial({color:0xb9c0c0,metalness:.8,roughness:.35});
    const landerBody=new THREE.Mesh(new THREE.CylinderGeometry(.62,.84,.9,8),lunarGold);landerBody.position.y=1.45;lander.add(landerBody);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;const leg=new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,1.5,6),lunarMetal);leg.position.set(Math.cos(a)*.72,.55,Math.sin(a)*.72);leg.rotation.z=Math.cos(a)*-.38;leg.rotation.x=Math.sin(a)*.38;lander.add(leg);}
    for(let i=0;i<2;i++){const rail=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,1.65,6),lunarMetal);rail.position.set(.95+i*.24,1.2,.08);lander.add(rail);}
    for(let i=0;i<6;i++){const rung=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.3,6),lunarMetal);rung.rotation.z=Math.PI/2;rung.position.set(1.06,.55+i*.24,.08);lander.add(rung);}
    const dust=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xc1b8a0,size:.13,transparent:true,opacity:.7}));scene.add(dust);
    const dustPositions=new Float32Array((lowQuality?75:mediumQuality?120:180)*3);
    for(let i=0;i<dustPositions.length;i+=3){dustPositions[i]=(Math.random()-.5)*6;dustPositions[i+1]=Math.random()*1.2;dustPositions[i+2]=(Math.random()-.5)*3;}
    dust.geometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
    const astronaut=makeAstronaut(quality);scene.add(astronaut);
    const flagGroup=new THREE.Group();scene.add(flagGroup);
    const flagPoleMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0xc5cbd0}):new THREE.MeshStandardMaterial({color:0xc5cbd0,metalness:.8,roughness:.24});
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,2.2,8),flagPoleMaterial);pole.position.y=1.1;flagGroup.add(pole);
    const flagCanvas=document.createElement('canvas');flagCanvas.width=512;flagCanvas.height=300;
    const flagCtx=flagCanvas.getContext('2d')!;
    const flagTexture=new THREE.CanvasTexture(flagCanvas); flagTexture.colorSpace=THREE.SRGBColorSpace;
    const flagMaterial=lowQuality?new THREE.MeshLambertMaterial({map:flagTexture,side:THREE.DoubleSide}):new THREE.MeshStandardMaterial({map:flagTexture,side:THREE.DoubleSide,roughness:.76});
    const flagMesh=new THREE.Mesh(new THREE.PlaneGeometry(1.35,.78),flagMaterial);flagMesh.position.set(.7,1.62,0);flagGroup.add(flagMesh);
    if(quality==='high'){
      lander.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});
      astronaut.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});
      flagGroup.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});
    }
    const beacon=new THREE.Mesh(new THREE.TorusGeometry(.48,.025,6,32),new THREE.MeshBasicMaterial({color:0x71e3ff,transparent:true,opacity:.9}));
    beacon.rotation.x=Math.PI/2;beacon.position.set(4,.03,-1);scene.add(beacon);
    const footprints:THREE.Mesh[]=[];
    const printMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0x555960}):new THREE.MeshStandardMaterial({color:0x555960,roughness:1});
    for(let i=0;i<12;i++){
      const print=new THREE.Mesh(new THREE.SphereGeometry(.1,7,5),printMaterial);
      print.scale.set(.75,.12,1.3);print.position.set(1.3+i*.245,.005,.25-i*.107);print.rotation.y=i%2?-.18:.18;scene.add(print);footprints.push(print);
    }
    const pathPts=Array.from({length:120},(_,i)=>{const t=i/119;return new THREE.Vector3(Math.cos(t*Math.PI*2)*(.45+t*3.4),Math.sin(t*Math.PI*2)*(.18+t*.6),-4-t*8);});
    const trajectory=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts),new THREE.LineDashedMaterial({color:0x70def4,dashSize:.17,gapSize:.13,transparent:true,opacity:.65}));trajectory.computeLineDistances();scene.add(trajectory);
    const capsules=new THREE.Group();
    capsules.scale.setScalar(1.45);
    const capsuleBody=new THREE.Mesh(new THREE.SphereGeometry(.38,lowQuality?16:22,lowQuality?12:16),
      lowQuality?new THREE.MeshLambertMaterial({color:0xdeddd5}):new THREE.MeshStandardMaterial({color:0xdeddd5,metalness:.64,roughness:.3}));
    capsules.add(capsuleBody);
    const windowGlass=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),
      lowQuality?new THREE.MeshBasicMaterial({color:0x65c9e5}):new THREE.MeshStandardMaterial({color:0x65c9e5,metalness:.65,roughness:.16,emissive:0x104358}));
    windowGlass.position.set(0,.02,.31);capsules.add(windowGlass);
    const capsuleInterior=new THREE.Group();
    const capsuleWindow=new THREE.Mesh(new THREE.CircleGeometry(.28,24),new THREE.MeshBasicMaterial({color:0xbfefff,transparent:true,opacity:.07,side:THREE.DoubleSide,depthWrite:false}));
    capsuleWindow.position.z=.285;capsuleInterior.add(capsuleWindow);
    const capsuleFrame=new THREE.Mesh(new THREE.TorusGeometry(.3,.027,6,28),lowQuality?new THREE.MeshLambertMaterial({color:0xaebbc5}):new THREE.MeshStandardMaterial({color:0xaebbc5,metalness:.76,roughness:.3}));
    capsuleFrame.position.z=.29;capsuleInterior.add(capsuleFrame);
    const capsuleDash=new THREE.Mesh(new THREE.BoxGeometry(.52,.11,.12),new THREE.MeshBasicMaterial({color:0x263847}));
    capsuleDash.position.set(0,-.24,.13);capsuleInterior.add(capsuleDash);
    const capsuleLightGeometry=new THREE.SphereGeometry(.025,6,5);
    [0x6affb3,0x62ceff,0xffd46f].forEach((color,index)=>{
      const light=new THREE.Mesh(capsuleLightGeometry,new THREE.MeshBasicMaterial({color}));
      light.position.set(-.12+index*.12,-.235,.19);capsuleInterior.add(light);
    });
    capsules.add(capsuleInterior);scene.add(capsules);
    const tliFlame=new THREE.Mesh(new THREE.ConeGeometry(.15,.9,12),new THREE.MeshBasicMaterial({color:0xffa64b,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    tliFlame.rotation.x=-Math.PI/2;tliFlame.position.set(0,0,.48);capsules.add(tliFlame);
    const orbitLine=new THREE.Mesh(new THREE.TorusGeometry(6.7,.012,5,lowQuality?64:120),new THREE.MeshBasicMaterial({color:0x81d8f5,transparent:true,opacity:.44}));orbitLine.rotation.x=Math.atan2(.8,1.3);scene.add(orbitLine);
    const confettiGeo=new THREE.BufferGeometry(), confettiCount=lowQuality?45:mediumQuality?90:150, confettiPositions=new Float32Array(confettiCount*3), confettiColors=new Float32Array(confettiCount*3);
    const palette=[[.37,.85,1],[.71,.59,1],[.88,.92,1],[.35,.76,.63]];
    for(let i=0;i<confettiCount;i++){confettiPositions[i*3]=(Math.random()-.5)*13;confettiPositions[i*3+1]=Math.random()*12;confettiPositions[i*3+2]=(Math.random()-.5)*5;confettiColors.set(palette[i%palette.length],i*3);}
    confettiGeo.setAttribute('position',new THREE.BufferAttribute(confettiPositions,3));confettiGeo.setAttribute('color',new THREE.BufferAttribute(confettiColors,3));
    const confetti=new THREE.Points(confettiGeo,new THREE.PointsMaterial({size:.11,vertexColors:true,transparent:true,opacity:.95}));
    scene.add(confetti);

    let disposed=false, raf=0, prev=performance.now(),lastPresentedFrame=0,drag=false, lastX=0,lastY=0, yaw=0,pitch=0,zoom=1;
    const activePointers=new Map<number,{x:number;y:number}>();
    let pinchStart=0,pinchZoom=1,renderedFlag='',exhaustStarted=false;
    let fpsFrames=0,fpsWindowStart=performance.now();
    let frameBudgetElapsed=0,frameBudgetSum=0,frameBudgetCount=0,adaptiveParticleScale=1;
    let cameraPosePhase:MissionPhase | null=null,cameraPoseFirstPerson=false,cameraTransitionElapsed=1;
    const cameraOffset=new THREE.Vector3();
    const desiredCameraPosition=new THREE.Vector3();
    const desiredCameraTarget=new THREE.Vector3();
    const cameraStartPosition=camera.position.clone();
    const cameraStartTarget=cameraTarget.clone();
    const orbitSpherical=new THREE.Spherical();
    const cameraForward=new THREE.Vector3();
    const inverseEarthQuaternion=new THREE.Quaternion();
    const resize=()=>{
      viewWidth=host.clientWidth||innerWidth;viewHeight=host.clientHeight||innerHeight;
      renderer.setSize(viewWidth,viewHeight,false);camera.aspect=viewWidth/viewHeight;camera.updateProjectionMatrix();
    };
    const viewSurface=host.parentElement?.querySelector<HTMLElement>('.mission-view')??renderer.domElement;
    const down=(e:PointerEvent)=>{
      if(e.target instanceof Element&&e.target.closest('button,input,a,[role="button"]'))return;
      activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag=activePointers.size===1;lastX=e.clientX;lastY=e.clientY;
      if(activePointers.size===2){const points=[...activePointers.values()];pinchStart=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);pinchZoom=zoom;}
      viewSurface.setPointerCapture?.(e.pointerId);
    };
    const move=(e:PointerEvent)=>{if(activePointers.has(e.pointerId))activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(activePointers.size===2){const points=[...activePointers.values()];const span=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);if(pinchStart>0)zoom=THREE.MathUtils.clamp(pinchZoom*pinchStart/span,.72,1.6);return;}if(!drag)return;yaw+=(e.clientX-lastX)*.004;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-lastY)*.003,-.55,.55);lastX=e.clientX;lastY=e.clientY;};
    const up=(e:PointerEvent)=>{activePointers.delete(e.pointerId);drag=activePointers.size===1;if(drag){const point=[...activePointers.values()][0];lastX=point.x;lastY=point.y;}};
    const wheel=(e:WheelEvent)=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.001,.72,1.6);};
    viewSurface.addEventListener('pointerdown',down);viewSurface.addEventListener('pointermove',move);viewSurface.addEventListener('pointerup',up);viewSurface.addEventListener('pointercancel',up);viewSurface.addEventListener('wheel',wheel,{passive:false});
    window.addEventListener('resize',resize);resize();
    const drawFlag=(name:string)=>{flagCtx.clearRect(0,0,512,300);flagCtx.fillStyle='#087d50';flagCtx.fillRect(0,0,512,300);flagCtx.direction='rtl';flagCtx.textAlign='center';flagCtx.fillStyle='#f5f4df';flagCtx.font='bold 31px Tajawal, sans-serif';flagCtx.fillText('لا إله إلا الله محمد رسول الله',256,124);flagCtx.fillRect(159,148,194,7);flagCtx.font='bold 27px Tajawal, sans-serif';flagCtx.fillText(name||'رائد الفضاء',256,220);flagTexture.needsUpdate=true;};
    drawFlag(stateRef.current.flagName);
    if(fpsRef.current)fpsRef.current.textContent='';
    props.onLoaded();
    const frame=(now:number)=>{
      if(disposed)return;
      if(document.hidden){raf=0;return;}
      raf=requestAnimationFrame(frame);
      if(now-lastPresentedFrame<1000/60-.5)return;
      lastPresentedFrame=now;
      const dt=Math.min((now-prev)/1000,.05);prev=now;
      const s=stateRef.current, t=s.phaseSeconds;
      if(s.phase!==cameraPosePhase||s.firstPerson!==cameraPoseFirstPerson){
        cameraPosePhase=s.phase;cameraPoseFirstPerson=s.firstPerson;
        cameraStartPosition.copy(camera.position);cameraStartTarget.copy(cameraTarget);cameraTransitionElapsed=0;
      }
      if(s.showFps){
        fpsFrames++;
        if(now-fpsWindowStart>=200){
          if(fpsRef.current)fpsRef.current.textContent=`${Math.round(fpsFrames*1000/(now-fpsWindowStart))} FPS`;
          fpsFrames=0;fpsWindowStart=now;
        }
      }
      frameBudgetElapsed+=dt;frameBudgetSum+=dt;frameBudgetCount++;
      if(frameBudgetElapsed>=1){
        const averageFrame=frameBudgetSum/frameBudgetCount;
        if(averageFrame>.025){
          const nextRatio=Math.max(.65,renderer.getPixelRatio()-.08);
          if(nextRatio!==renderer.getPixelRatio()){renderer.setPixelRatio(nextRatio);renderer.setSize(viewWidth,viewHeight,false);}
          adaptiveParticleScale=Math.max(.35,adaptiveParticleScale*.82);
        }else if(averageFrame<.017){
          const nextRatio=Math.min(Math.min(devicePixelRatio||1,basePixelRatio),renderer.getPixelRatio()+.04);
          if(nextRatio!==renderer.getPixelRatio()){renderer.setPixelRatio(nextRatio);renderer.setSize(viewWidth,viewHeight,false);}
          adaptiveParticleScale=Math.min(1,adaptiveParticleScale+.05);
        }
        starsGeo.setDrawRange(0,Math.floor(starCount*adaptiveParticleScale));
        smokeGeo.setDrawRange(0,Math.floor(puffCount*adaptiveParticleScale));
        exhaustGeo.setDrawRange(0,Math.floor(exhaustCount*adaptiveParticleScale));
        frameBudgetElapsed=0;frameBudgetSum=0;frameBudgetCount=0;
      }
      if(s.flagName!==renderedFlag){drawFlag(s.flagName);renderedFlag=s.flagName;}
      const isLaunchReady=s.phase==='ready'||s.phase==='countdown';
      const inAscent=s.phase==='ascent';
      const launchGround=isLaunchReady||inAscent&&t<78;
      const earthInView=s.phase==='orbit'||s.phase==='journey'||s.phase==='landing'||s.phase==='surface'||s.phase==='finish'||inAscent&&t>92;
      const ignition=s.phase==='countdown'?THREE.MathUtils.clamp((t-2)/2,0,1):inAscent&&t<18?1:0;
      const isEarth=earthInView;
      const earthVisible=isEarth||s.phase==='surface'||s.phase==='finish';
      confetti.visible=s.phase==='finish';beacon.visible=s.phase==='surface'||s.phase==='finish';
      for(let i=0;i<footprints.length;i++)footprints[i].visible=s.phase==='finish'||s.phase==='surface'&&s.walking>=i*8;
      earth.visible=earthVisible;earthGlow.visible=earthVisible;cityLights.visible=earthVisible;clouds.visible=earthVisible;
      cityLights.visible=earthVisible&&!lowQuality;
      moonGroup.visible=s.phase==='orbit'||s.phase==='journey'||s.phase==='landing'||s.phase==='surface'||s.phase==='finish';
      launchSite.group.visible=launchGround;launchSky.visible=launchGround;
      launchSite.ground.visible=launchGround;launchSite.hills.visible=launchGround;
      launchSite.pad.visible=isLaunchReady||inAscent&&t<48;
      launchSite.tower.visible=isLaunchReady||inAscent&&t<18;
      launchSite.armAssembly.rotation.z=isLaunchReady?ignition*Math.PI*.48:inAscent?Math.PI*.48:0;
      launchSite.trenchGlow.visible=ignition>.05;
      stars.visible=s.phase==='orbit'||s.phase==='journey'||s.phase==='landing'||s.phase==='surface'||s.phase==='finish'||inAscent&&t>130;
      starsMaterial.opacity=inAscent?THREE.MathUtils.clamp((t-105)/90,0,.88):.9;
      rocket.visible=s.phase==='ready'||s.phase==='countdown'||s.phase==='ascent';
      rocketBuild.cockpit.visible=s.firstPerson&&(isLaunchReady||inAscent);
      capsuleInterior.visible=s.firstPerson;
      escapeTower.visible=s.phase==='ready'||s.phase==='countdown'||(s.phase==='ascent'&&t<175);
      fairings.visible=s.phase==='ready'||s.phase==='countdown'||(s.phase==='ascent'&&t<245);
      if(s.phase==='ready'||s.phase==='countdown'||s.phase==='ascent'){
        escapeTower.position.set(rocket.position.x,rocket.position.y+5.25,rocket.position.z);
        if(s.phase==='ascent'&&t>=175)escapeTower.position.y+=Math.min((t-175)*.055,8);
        fairings.position.copy(rocket.position);
        if(s.phase==='ascent'&&t>=225){const separation=Math.min((t-225)*.035,1.2);fairings.position.x=rocket.position.x-separation;fairings.position.y=rocket.position.y+separation*.55;fairings.rotation.z=-separation*.14;}
      }
      stage2.visible=s.phase==='ascent'&&t>195&&t<390;
      booster.visible=s.phase==='ascent'&&t>=165&&t<250;
      stage2Flame.visible=s.phase==='ascent'&&t>=195&&t<390;
      flame.visible=(s.phase==='countdown'&&t>2)||(s.phase==='ascent'&&t<165)||(s.phase==='landing'&&t<42);
      exhaust.visible=(s.phase==='countdown'&&t>2)||(s.phase==='ascent'&&t<165);
      landerFlame.visible=s.phase==='landing'&&s.throttle>.04&&t<47;
      tliFlame.visible=s.phase==='journey'&&t<16;
      smoke.visible=(s.phase==='countdown'&&t>2)||(s.phase==='ascent'&&t<30);
      trajectory.visible=s.phase==='journey'||s.phase==='orbit';
      capsules.visible=s.phase==='orbit'||s.phase==='journey';
      orbitLine.visible=s.phase==='orbit';
      lunarFloor.visible=s.phase==='landing'||s.phase==='surface'||s.phase==='finish';
      lander.visible=s.phase==='landing'||s.phase==='surface'||s.phase==='finish';
      astronaut.visible=s.phase==='surface'||s.phase==='finish';
      flagGroup.visible=!!s.flagName&&(s.phase==='surface'||s.phase==='finish');
      dust.visible=s.phase==='landing';
      if(s.phase==='ready'||s.phase==='countdown'){
        rocket.position.set(0,0,0);rocket.rotation.z=Math.sin(now*.0006)*.003;
        camera.position.set(0,4.4,16);camera.lookAt(0,1.15,0);
        cameraTarget.set(0,1.15,0);
        flame.scale.set(1,ignition>.1?1.2:.45,1);
        engineLight.position.set(rocket.position.x,rocket.position.y-2.2,rocket.position.z);
        engineLight.intensity=4.2*ignition;
      }
      if(s.phase==='ascent'){
        // Wall-clock ascent lasts 8.5 minutes; scene altitude maps this long arc into a compact cinematic climb.
        const p=THREE.MathUtils.clamp(t/510,0,1);
        rocket.position.set(Math.sin(t*.1)*.1, p*22, 0);
        rocket.rotation.z=Math.sin(t*.17)*.012;
        camera.position.set(.4,rocket.position.y+4.4,16+Math.min(p*11,10));camera.lookAt(rocket.position.x,rocket.position.y+1,0);
        cameraTarget.set(rocket.position.x,rocket.position.y+1,0);
        if(booster.visible){booster.position.set(rocket.position.x-.12,rocket.position.y-1.3-Math.min((t-165)*.09,8),.2);booster.rotation.z=Math.min((t-165)*.004,.35);}
        if(stage2.visible){stage2.position.set(.1,rocket.position.y-1.25,0);stage2Flame.position.set(.1,rocket.position.y-2.35,0);}
        const cloudPass=THREE.MathUtils.clamp(1-Math.abs(p-.23)/.105,0,1);
        skyColor.lerpColors(dawnColor,spaceColor,p);
        skyColor.lerp(fogColor,cloudPass*.58);
        atmosphereFog.color.copy(skyColor);
        atmosphereFog.near=65-cloudPass*54;atmosphereFog.far=150-cloudPass*105;
        engineLight.position.set(rocket.position.x,rocket.position.y-2.2,rocket.position.z);
        engineLight.intensity=t<165?Math.max(0,4.2-cloudPass*1.4):t<390?1.8:0;
        earth.position.set(0,-8-p*3,-10-p*5);earth.scale.setScalar(1+p*.13);
      }
      if(s.phase==='orbit'){
        const orbitAngle=t/18*Math.PI*2;
        capsules.position.set(Math.cos(orbitAngle)*6.7,Math.sin(orbitAngle)*1.3,-10+Math.sin(orbitAngle)*.8);
        capsules.rotation.set(0,-orbitAngle,0);
        earth.position.set(0,-7,-10);earth.rotation.y+=s.paused?0:dt*.045;
        moonGroup.position.set(0,1,-39);moonGroup.scale.setScalar(.62);moon.rotation.y+=s.paused?0:dt*.025;
        orbitLine.position.copy(earth.position);
        camera.position.set(0,10,16);camera.lookAt(0,-7,-10);
        cameraTarget.set(0,-7,-10);
      }
      if(s.phase==='journey'){
        const p=THREE.MathUtils.clamp(t/155,0,1);
        earth.position.set(-4-p*4,-2,-12-p*11);earth.scale.setScalar(1-p*.62);earth.rotation.y+=s.paused?0:dt*.07;
        moonGroup.position.set(4-p*3,1,-30+p*21);moonGroup.scale.setScalar(.16+p*.84);moon.rotation.y+=s.paused?0:dt*.025;
        capsules.position.set(-1+p*1.7,1+Math.sin(t*.06)*.28,-9-p*13);
        if(t>=145){
          const capture=THREE.MathUtils.clamp((t-145)/10,0,1);
          const dx=capsules.position.x-moonGroup.position.x,dz=capsules.position.z-moonGroup.position.z;
          const startRadius=Math.hypot(dx,dz),startAngle=Math.atan2(dz,dx),angle=startAngle+capture*Math.PI*2;
          const radius=startRadius*(1-capture*.62);
          capsules.position.set(moonGroup.position.x+Math.cos(angle)*radius,moonGroup.position.y+(capsules.position.y-moonGroup.position.y)*(1-capture)+Math.sin(angle*2)*.22*capture,moonGroup.position.z+Math.sin(angle)*radius);
          capsules.rotation.set(0,-angle,0);
        }else{
          capsules.rotation.y=Math.atan2(moonGroup.position.x-capsules.position.x,moonGroup.position.z-capsules.position.z);
        }
        camera.position.set(s.firstPerson?capsules.position.x:capsules.position.x+3, s.firstPerson?capsules.position.y+0.1:capsules.position.y+3.2, s.firstPerson?capsules.position.z+1:capsules.position.z+13);
        camera.lookAt(moonGroup.position);
        cameraTarget.copy(moonGroup.position);
        skyColor.setRGB(.02-p*.005,.04-p*.012,.09-p*.045);
      }
      if(s.phase==='landing'){
        const p=THREE.MathUtils.clamp(t/55,0,1);
        moonGroup.position.set(0,0,-3);moonGroup.scale.setScalar(1.08);
        lander.position.set(Math.sin(s.tilt)*1.4*(1-p),4-p*3.75,0);lander.rotation.z=s.tilt*(1-p);
        flame.visible=false;landerFlame.scale.set(.8,s.throttle*1.5,.8);
        camera.position.set(8,6,15);camera.lookAt(0,0,-2);
        cameraTarget.set(0,0,-2);
      }
      if(s.phase==='surface'||s.phase==='finish'){
        moonGroup.position.set(-8,4,-35);moonGroup.scale.setScalar(.24);earth.position.set(7,5,-30);earth.scale.setScalar(.48);earth.visible=true;earthGlow.visible=true;
        const exitProgress=s.phase==='surface'?THREE.MathUtils.clamp(t/8,0,1):1;
        const jumpAge=(now-s.jumpStarted)/1000;
        const jumpLift=s.jumpStarted>0&&jumpAge>=0&&jumpAge<1.8?Math.sin(Math.PI*jumpAge/1.8)*.78:0;
        const walkingProgress=s.walking/100;
        lander.position.set(0,0,0);
        astronaut.position.set(1.2+walkingProgress*2.8,s.phase==='surface'&&t<8?.45*(1-exitProgress):.04+jumpLift,s.phase==='surface'&&t<8?.08+exitProgress*.22:.3-walkingProgress*1.3);
        flagGroup.position.set(4,0,-1);
        camera.position.set(astronaut.position.x*.55,3.3,10);camera.lookAt(astronaut.position.x,.9,0);
        cameraTarget.set(astronaut.position.x,.9,0);
        astronaut.rotation.y=2.0+(!s.paused?Math.sin(now*.002)*.04:0);
        if(s.phase==='surface'&&t<8)astronaut.rotation.z=!s.paused?Math.sin(now*.003)*.035:0;
        else astronaut.rotation.z=0;
      }
      if(s.phase!=='ready'&&s.phase!=='countdown'&&s.phase!=='ascent')engineLight.intensity=0;
      if(!inAscent){atmosphereFog.near=65;atmosphereFog.far=150;}
      if(s.phase==='landing'){
        const approach=THREE.MathUtils.clamp((t-17)/40,0,1);
        dust.position.set(lander.position.x,.02,lander.position.z);
        dust.scale.setScalar(.35+approach*2.4);
        (dust.material as THREE.PointsMaterial).opacity=approach*.64;
      }
      if(!s.paused && !reducedMotion){
        stars.rotation.y+=dt*.0015;
        if(smoke.visible){
          const a=smokeGeo.attributes.position as THREE.BufferAttribute;
          for(let i=0;i<puffCount;i++){
            puffPositions[i*3]+=puffVel[i*3]*dt;
            puffPositions[i*3+1]+=puffVel[i*3+1]*dt;
            puffPositions[i*3+2]+=puffVel[i*3+2]*dt;
            if(Math.abs(puffPositions[i*3])>6||puffPositions[i*3+1]>-.2){
              const side=i%2===0?-1:1;
              puffPositions[i*3]=(Math.random()-.5)*.7;puffPositions[i*3+1]=-2.48+Math.random()*.2;puffPositions[i*3+2]=(Math.random()-.5)*1.2;
              puffVel[i*3]=side*(.24+Math.random()*.55);puffVel[i*3+1]=.04+Math.random()*.16;puffVel[i*3+2]=(Math.random()-.5)*.3;
            }
          }
          a.needsUpdate=true;
        }
        if(exhaust.visible){
          const a=exhaustGeo.attributes.position as THREE.BufferAttribute;
          if(!exhaustStarted){
            for(let i=0;i<exhaustCount;i++){
              exhaustPositions[i*3]=rocket.position.x+(Math.random()-.5)*.34;
              exhaustPositions[i*3+1]=rocket.position.y-2.15-Math.random()*4.2;
              exhaustPositions[i*3+2]=rocket.position.z+(Math.random()-.5)*.34;
            }
            exhaustStarted=true;
          }
          for(let i=0;i<exhaustCount;i++){
            exhaustPositions[i*3]+=exhaustVel[i*3]*dt;exhaustPositions[i*3+1]+=exhaustVel[i*3+1]*dt;exhaustPositions[i*3+2]+=exhaustVel[i*3+2]*dt;
            if(exhaustPositions[i*3+1]<rocket.position.y-16){
              exhaustPositions[i*3]=rocket.position.x+(Math.random()-.5)*.34;
              exhaustPositions[i*3+1]=rocket.position.y-2.15;
              exhaustPositions[i*3+2]=rocket.position.z+(Math.random()-.5)*.34;
            }
          }
          a.needsUpdate=true;
        }else exhaustStarted=false;
      }
      earthGlow.position.copy(earth.position);earthGlow.scale.copy(earth.scale);
      cityLights.position.copy(earth.position);cityLights.quaternion.copy(earth.quaternion);cityLights.scale.copy(earth.scale);
      clouds.position.copy(earth.position);clouds.quaternion.copy(earth.quaternion);if(!s.paused&&!reducedMotion)clouds.rotateY(.00018);clouds.scale.copy(earth.scale);
      inverseEarthQuaternion.copy(earth.quaternion).invert();
      cityUniforms.uSunDirection.value.copy(sunDirection).applyQuaternion(inverseEarthQuaternion);
      if(s.firstPerson){
        if(s.phase==='ascent'||s.phase==='ready'||s.phase==='countdown'){
          camera.position.set(rocket.position.x,rocket.position.y+4.48*.72,rocket.position.z+.3*.72);
          cameraForward.set(0,0,-1).applyEuler(rocket.rotation);
          cameraTarget.copy(camera.position).addScaledVector(cameraForward,24);
        }else if(s.phase==='orbit'){
          camera.position.copy(capsules.position);
          cameraForward.set(0,0,1).applyEuler(capsules.rotation);
          cameraTarget.copy(capsules.position).addScaledVector(cameraForward,45);
        }else if(s.phase==='journey'){
          camera.position.copy(capsules.position);
          cameraTarget.copy(moonGroup.position);
        }else if(s.phase==='landing'){
          camera.position.set(lander.position.x,lander.position.y+1.5,lander.position.z+1.2);
          cameraTarget.set(0,0,-8);
        }else if(s.phase==='surface'||s.phase==='finish'){
          camera.position.set(astronaut.position.x,astronaut.position.y+1.4,astronaut.position.z+1.1);
          cameraTarget.set(4,1,-1);
        }
      }
      if(!s.firstPerson){
        cameraOffset.copy(camera.position).sub(cameraTarget);
        orbitSpherical.setFromVector3(cameraOffset);
        orbitSpherical.theta+=yaw;orbitSpherical.phi=THREE.MathUtils.clamp(orbitSpherical.phi+pitch,.2,Math.PI-.2);
        orbitSpherical.radius=THREE.MathUtils.clamp(orbitSpherical.radius*zoom,4.5,92);
        camera.position.setFromSpherical(orbitSpherical).add(cameraTarget);
      }
      desiredCameraPosition.copy(camera.position);desiredCameraTarget.copy(cameraTarget);
      if(cameraTransitionElapsed<1){
        cameraTransitionElapsed=Math.min(1,cameraTransitionElapsed+dt/.58);
        const eased=cameraTransitionElapsed*cameraTransitionElapsed*(3-2*cameraTransitionElapsed);
        camera.position.lerpVectors(cameraStartPosition,desiredCameraPosition,eased);
        cameraTarget.lerpVectors(cameraStartTarget,desiredCameraTarget,eased);
      }else{
        camera.position.copy(desiredCameraPosition);cameraTarget.copy(desiredCameraTarget);
      }
      const showExterior=!s.firstPerson&&cameraTransitionElapsed>=1;
      for(const part of rocketBuild.shellParts){
        const detached=s.phase==='ascent'&&t>=165&&rocketBuild.firstStageParts.includes(part);
        part.visible=showExterior&&!detached;
      }
      capsuleBody.visible=showExterior;windowGlass.visible=showExterior;
      camera.lookAt(cameraTarget);
      atmosphereFog.color.copy(skyColor);
      if(inAscent&&!reducedMotion&&t<165){
        const vibration=Math.sin(now*.037)*.012;
        camera.position.x+=vibration;
        camera.position.z+=Math.cos(now*.041)*.008;
      }
      if(!s.paused&&s.phase==='finish'){for(let i=0;i<confettiCount;i++){confettiPositions[i*3+1]-=dt*1.6;if(confettiPositions[i*3+1]<-5)confettiPositions[i*3+1]=10;}(confettiGeo.attributes.position as THREE.BufferAttribute).needsUpdate=true;}
      renderer.render(scene,camera);
    };
    const onVisibility=()=>{
      if(document.hidden){cancelAnimationFrame(raf);raf=0;}
      else if(!raf){prev=performance.now();lastPresentedFrame=0;raf=requestAnimationFrame(frame);}
    };
    document.addEventListener('visibilitychange',onVisibility);
    raf=requestAnimationFrame(frame);
    return ()=>{
      disposed=true;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('resize',resize);
       viewSurface.removeEventListener('pointerdown',down);viewSurface.removeEventListener('pointermove',move);viewSurface.removeEventListener('pointerup',up);viewSurface.removeEventListener('pointercancel',up);viewSurface.removeEventListener('wheel',wheel);
       const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
       scene.traverse(o=>{
         if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Points){
           geometries.add(o.geometry);
           const attached=Array.isArray(o.material)?o.material:[o.material];
           attached.forEach(material=>materials.add(material));
         }
       });
       if(cityTexture)textures.add(cityTexture);
       const textureProps=['map','bumpMap','normalMap','emissiveMap','alphaMap','roughnessMap','metalnessMap','aoMap','displacementMap','envMap','lightMap'];
       materials.forEach(material=>{
         const materialProperties=material as unknown as Record<string,unknown>;
         for(const key of textureProps){const value=materialProperties[key];if(value instanceof THREE.Texture)textures.add(value);}
         if(material instanceof THREE.ShaderMaterial){
           Object.values(material.uniforms).forEach(uniform=>{if(uniform.value instanceof THREE.Texture)textures.add(uniform.value);});
         }
         material.dispose();
       });
       geometries.forEach(geometry=>geometry.dispose());textures.forEach(texture=>texture.dispose());
      renderer.dispose();renderer.domElement.remove();
    };
  }, [props.quality]);

  return <div className="mission-scene" ref={hostRef} aria-label="مشهد ثلاثي الأبعاد لرحلة القمر" data-testid="simulation-three-scene">
    {fallback&&<MissionCanvasFallback key={props.quality} state={stateRef.current} fpsRef={fpsRef}/>}
  </div>;
}
