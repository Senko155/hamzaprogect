import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { canCreateWebGLContext } from '@/lib/webgl';

export type MissionPhase = 'ready' | 'countdown' | 'ascent' | 'orbit' | 'journey' | 'landing' | 'surface' | 'finish';
type SceneProps = {
  phase: MissionPhase;
  phaseSeconds: number;
  missionSeconds: number;
  firstPerson: boolean;
  paused: boolean;
  quality: 'low' | 'medium' | 'high';
  showFps: boolean;
  tilt: number;
  throttle: number;
  walking: number;
  jumpStarted: number;
  flagName: string;
  onLoaded: () => void;
};

type SceneState = Omit<SceneProps, 'onLoaded'>;
const LOW_POWER_DEVICE = typeof window !== 'undefined' && (
  window.matchMedia('(max-width: 760px)').matches
  || window.matchMedia('(pointer: coarse)').matches
  || (navigator.maxTouchPoints ?? 0) > 0
  || (navigator.hardwareConcurrency ?? 8) <= 8
  || (window.devicePixelRatio || 1) <= 1.25
);
const MOBILE = LOW_POWER_DEVICE;

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

function earthMap(size: number) {
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
  }, size, size / 2);
}

function moonMap(size: number) {
  return canvasTexture((ctx,w,h) => {
    const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,'#a9a8a3');g.addColorStop(.5,'#777a80');g.addColorStop(1,'#434953');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    for(let i=0;i<370;i++){
      const x=Math.random()*w,y=Math.random()*h,r=3+Math.random()*24;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=i%2?'rgba(27,32,42,.22)':'rgba(233,232,219,.14)';ctx.fill();
      ctx.beginPath();ctx.arc(x-r*.12,y-r*.12,r*.72,Math.PI*1.1,Math.PI*1.9);ctx.strokeStyle='rgba(245,241,224,.18)';ctx.lineWidth=2;ctx.stroke();
    }
  }, size, size / 2);
}

function moonBumpMap(size: number) {
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
  }, size, size / 2);
}

function cloudMap(size: number) {
  return canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w, y = Math.random() * h, rx = 10 + Math.random() * 60, ry = 3 + Math.random() * 14;
      ctx.fillStyle = `rgba(225,239,245,${.08 + Math.random() * .22})`;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, (Math.random() - .5) * .4, 0, Math.PI * 2); ctx.fill();
    }
  }, size, size / 2);
}

function cityLightMap(size: number) {
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
  }, size, size / 2);
}

function makeRocket(lowQuality: boolean, segments: number) {
  const group = new THREE.Group();
  const firstStageParts: THREE.Object3D[] = [];
  const finish = (color: number, metalness: number, roughness: number) => lowQuality
    ? new THREE.MeshLambertMaterial({ color })
    : new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const white = finish(0xe9e8df,.52,.38);
  const silver = finish(0x939aa2,.82,.28);
  const black = finish(0x222632,.72,.34);
  const orange = finish(0xc87a42,.53,.4);
  const exteriorParts: THREE.Object3D[] = [];
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.48,.53,4.3,segments),white); body.position.y=1.9; group.add(body);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(.7,.76,1.75,segments),orange); lower.position.y=-1.08; group.add(lower);firstStageParts.push(lower);
  const blackBand = new THREE.Mesh(new THREE.CylinderGeometry(.56,.56,.23,segments),black);blackBand.position.y=.05;group.add(blackBand);firstStageParts.push(blackBand);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(.48,.51,1.3,segments),white);upper.position.y=4.75;group.add(upper);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.48,1.15,segments),silver);nose.position.y=5.97;group.add(nose);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    const fin=new THREE.Mesh(new THREE.BoxGeometry(.08,1.18,.55),silver);
    fin.position.set(Math.cos(a)*.49,-2.28,Math.sin(a)*.49);fin.rotation.y=-a;fin.rotation.z=-.12;group.add(fin);firstStageParts.push(fin);
    const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.19,.29,.48,lowQuality?8:14),black);nozzle.position.set(Math.cos(a)*.25,-2.23,Math.sin(a)*.25);group.add(nozzle);firstStageParts.push(nozzle);
  }
  for(let y=1;y<5;y+=.72){
    const seam=new THREE.Mesh(new THREE.CylinderGeometry(.49,.49,.025,segments),silver);seam.position.y=y;group.add(seam);
  }
  exteriorParts.push(...group.children);
  const cockpit = new THREE.Group();
  const frameMaterial = finish(0x8c9ba8,.78,.3);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(.72,lowQuality?18:30,lowQuality?12:20,Math.PI*1.16,Math.PI*.68,Math.PI*.29,Math.PI*.42),
    new THREE.MeshBasicMaterial({ color:0xc9efff, transparent:true, opacity:.035, side:THREE.DoubleSide, depthWrite:false }),
  );
  glass.position.set(0,4.48,0);
  cockpit.add(glass);
  const windowRim = new THREE.Mesh(new THREE.TorusGeometry(.61,.035,6,lowQuality?24:40),frameMaterial);
  windowRim.position.set(0,4.49,-.32);
  windowRim.scale.y=.66;
  cockpit.add(windowRim);
  const innerRim = new THREE.Mesh(new THREE.TorusGeometry(.54,.012,5,lowQuality?20:32),finish(0xb5c6d0,.55,.32));
  innerRim.position.set(0,4.49,-.305);
  innerRim.scale.y=.66;
  cockpit.add(innerRim);
  const rivetGeometry = new THREE.SphereGeometry(.022,6,5);
  for(let i=0;i<12;i++){
    const angle=i/12*Math.PI*2;
    const rivet=new THREE.Mesh(rivetGeometry,finish(0xd1d8dc,.66,.25));
    rivet.position.set(Math.cos(angle)*.61,4.49+Math.sin(angle)*.4,-.315);
    cockpit.add(rivet);
  }
  const console = new THREE.Mesh(new THREE.BoxGeometry(1.08,.18,.36),finish(0x101b2b,.28,.7));
  console.position.set(0,3.67,-.03);
  cockpit.add(console);
  const indicatorColors=[0x35e5bc,0x65dfff,0xffc66b,0x82baff];
  indicatorColors.forEach((color,index)=>{
    const indicator=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),new THREE.MeshBasicMaterial({color}));
    indicator.position.set(-.3+index*.2,3.78,.15);
    cockpit.add(indicator);
  });
  group.add(cockpit);
  group.scale.setScalar(.72);
  return { group, firstStageParts, exteriorParts, cockpit };
}

function makeAstronaut() {
  const g=new THREE.Group();
  const suit=new THREE.MeshStandardMaterial({color:0xd8e3e4,roughness:.86});
  const dark=new THREE.MeshStandardMaterial({color:0x172333,metalness:.35,roughness:.55});
  const gold=new THREE.MeshStandardMaterial({color:0xc8a65b,metalness:.72,roughness:.24});
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

function MissionCanvasFallback({ state }: { state: SceneState }) {
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
    let raf = 0;
    let width = 0, height = 0, ratio = 1;
    const resize = () => {
      ratio = Math.min(devicePixelRatio || 1, MOBILE ? 1.4 : 1.8);
      width = canvas.clientWidth || innerWidth;
      height = canvas.clientHeight || innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    window.addEventListener('resize', resize);
    resize();

    const draw = (now: number) => {
      if(document.hidden){raf=0;return;}
      const s = currentState.current;
      const t = s.phaseSeconds;
      const p = s.phase === 'ascent' ? Math.min(t / 510, 1) : s.phase === 'journey' ? Math.min(t / 155, 1) : s.phase === 'landing' ? Math.min(t / 58, 1) : 0;
      ctx.clearRect(0, 0, width, height);
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, s.phase === 'ready' || s.phase === 'countdown' ? '#547da8' : '#070a15');
      sky.addColorStop(.62, s.phase === 'ready' || s.phase === 'countdown' ? '#182b46' : '#090c18');
      sky.addColorStop(1, '#080b15');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);

      const starOpacity = s.phase === 'ready' || s.phase === 'countdown' ? .45 : .9;
      stars.forEach((star, i) => {
        ctx.globalAlpha = starOpacity * (.55 + (reduceMotion ? .25 : .45 * Math.sin(now * .001 + i)));
        ctx.fillStyle = '#deefff'; ctx.beginPath(); ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2); ctx.fill();
      });
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

      if (s.phase === 'ready' || s.phase === 'countdown' || s.phase === 'ascent') {
        drawEarthHorizon(s.phase === 'ascent' ? p : 0);
        const ascent = s.phase === 'ascent' ? p : 0;
        const rocketX = width * .5, rocketY = height * .56 - ascent * height * .35;
        ctx.fillStyle = '#53687b'; ctx.fillRect(rocketX - 82, height * .56 + 18, 164, 8);
        ctx.strokeStyle = '#8596a2'; ctx.lineWidth = 4;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(rocketX + i * 34, height * .57); ctx.lineTo(rocketX + i * 36, height * .69); ctx.stroke(); }
        if (s.phase === 'countdown' && t > 2 || s.phase === 'ascent' && t < 165) {
          for (let i = 0; i < (MOBILE ? 12 : 22); i++) {
            const x = rocketX + Math.sin(now * .001 + i) * (26 + i * 3);
            const y = rocketY + 32 + ((now * .03 + i * 29) % 90);
            ctx.fillStyle = `rgba(202,213,222,${.09 + (i % 4) * .04})`; ctx.beginPath(); ctx.arc(x, y, 9 + (i % 6) * 2, 0, Math.PI * 2); ctx.fill();
          }
        }
        drawRocket(rocketX, rocketY, Math.max(.68, Math.min(width / 850, 1.02)), s.phase === 'countdown' && t > 2 || s.phase === 'ascent' && t < 390);
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
    const onVisibility=()=>{if(!document.hidden&&!raf)raf=requestAnimationFrame(draw);};
    document.addEventListener('visibilitychange',onVisibility);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange',onVisibility); };
  }, []);

  return <canvas ref={canvasRef} className="mission-canvas-fallback" aria-hidden="true" />;
}

export default function MissionScene(props: SceneProps) {
  const hostRef=useRef<HTMLDivElement>(null);
  const fpsRef=useRef<HTMLDivElement>(null);
  const stateRef=useRef<SceneState>(props);
  stateRef.current=props;
  const [fallback,setFallback]=useState(false);

  useEffect(() => {
    const host=hostRef.current;
    if(!host)return;
    const quality=props.quality;
    const lowQuality=quality==='low';
    const highQuality=quality==='high';
    const geometrySegments=lowQuality?24:quality==='medium'?32:40;
    const textureSize=lowQuality?512:quality==='medium'?768:1024;
    if(!canCreateWebGLContext()){
      host.parentElement?.classList.add('mission-fallback-active');
      setFallback(true);
      props.onLoaded();
      return;
    }
    let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({antialias:!lowQuality,alpha:false,powerPreference:lowQuality?'low-power':'high-performance'});}
     catch {host.parentElement?.classList.add('mission-fallback-active');setFallback(true);props.onLoaded();return;}
    const maxPixelRatio=lowQuality?1:quality==='medium'?1.25:1.8;
    let adaptivePixelRatio=Math.min(devicePixelRatio||1,maxPixelRatio);
    renderer.setPixelRatio(adaptivePixelRatio);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=lowQuality?THREE.NoToneMapping:THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
    const scene=new THREE.Scene(); const skyColor=new THREE.Color(0x527daf);scene.background=skyColor;
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const camera=new THREE.PerspectiveCamera(LOW_POWER_DEVICE?60:48,1,.05,180); camera.position.set(0,4.5,16);
    const cameraTarget=new THREE.Vector3(0,1,0);
    host.appendChild(renderer.domElement);
    const dawnTexture=canvasTexture((ctx,width,height)=>{
      const gradient=ctx.createLinearGradient(0,0,0,height);
      gradient.addColorStop(0,'#3f6593');
      gradient.addColorStop(.48,'#98adbd');
      gradient.addColorStop(.72,'#e2bb99');
      gradient.addColorStop(1,'#65728a');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
    },lowQuality?256:512,lowQuality?128:256);
    const dawnSky=new THREE.Mesh(
      new THREE.SphereGeometry(90,16,12),
      new THREE.MeshBasicMaterial({map:dawnTexture,side:THREE.BackSide,transparent:true,opacity:1,depthWrite:false}),
    );
    scene.add(dawnSky);
    const sun=new THREE.DirectionalLight(0xffd3a2,2.5);sun.position.set(-7,8,8);sun.castShadow=highQuality;
    renderer.shadowMap.enabled=highQuality;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    sun.shadow.mapSize.set(512,512);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-18;
    scene.add(sun);
    const starsGeo=new THREE.BufferGeometry(), starCount=lowQuality?900:quality==='medium'?1200:1500, starPos=new Float32Array(starCount*3);
    for(let i=0;i<starCount;i++){starPos[i*3]=(Math.random()-.5)*92;starPos[i*3+1]=(Math.random()-.5)*57;starPos[i*3+2]=-10-Math.random()*45;}
    starsGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
    const starMaterial=new THREE.PointsMaterial({color:0xdcecff,size:lowQuality?.105:.075,transparent:true,opacity:0,sizeAttenuation:true});
    const stars=new THREE.Points(starsGeo,starMaterial);scene.add(stars);

    const earthTexture=earthMap(textureSize);
    const earthMaterial=lowQuality
      ? new THREE.MeshLambertMaterial({map:earthTexture})
      : new THREE.MeshStandardMaterial({map:earthTexture,roughness:.83,metalness:.04});
    const earth=new THREE.Mesh(new THREE.SphereGeometry(4.8,geometrySegments,Math.max(16,geometrySegments*.75)),earthMaterial);
    earth.position.set(0,-8,-10);scene.add(earth);
    const earthGlow=new THREE.Mesh(new THREE.SphereGeometry(4.94,geometrySegments,Math.max(16,geometrySegments*.75)),new THREE.MeshBasicMaterial({color:0x45baff,transparent:true,opacity:.18,side:THREE.BackSide}));earthGlow.position.copy(earth.position);scene.add(earthGlow);
    const cityTexture=lowQuality?canvasTexture(()=>{},1,1):cityLightMap(textureSize);
    const sunDirection=new THREE.Vector3(-.62, .35, .7).normalize();
    const cityUniforms = {
      uCityMap: { value: cityTexture },
      uSunDirection: { value: sunDirection.clone() },
    };
    const cityMaterial=lowQuality
      ? new THREE.MeshBasicMaterial({color:0xffd99a,transparent:true,opacity:0,depthWrite:false})
      : new THREE.ShaderMaterial({
        uniforms: cityUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; varying vec3 vLocalNormal; void main(){vUv=uv;vLocalNormal=normalize(normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform sampler2D uCityMap; uniform vec3 uSunDirection; varying vec2 vUv; varying vec3 vLocalNormal; void main(){float daylight=dot(normalize(vLocalNormal),normalize(uSunDirection));float night=1.0-smoothstep(-0.12,0.12,daylight);vec4 city=texture2D(uCityMap,vUv);gl_FragColor=vec4(city.rgb,city.a*night);}`,
      });
    const cityLights = new THREE.Mesh(new THREE.SphereGeometry(4.83,geometrySegments,Math.max(16,geometrySegments*.75)),cityMaterial);
    cityLights.position.copy(earth.position);cityLights.visible=!lowQuality;scene.add(cityLights);
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(4.86,geometrySegments,Math.max(16,geometrySegments*.75)),
      new THREE.MeshBasicMaterial({ map: cloudMap(textureSize), color: 0xd9efff, transparent: true, opacity: .34, depthWrite: false }),
    );
    clouds.position.copy(earth.position);scene.add(clouds);
    const moonGroup=new THREE.Group();scene.add(moonGroup);
    const lunarTexture=moonMap(textureSize);
    const lunarBump=highQuality?moonBumpMap(textureSize):null;
    const lunarMaterial=lowQuality
      ? new THREE.MeshLambertMaterial({map:lunarTexture})
      : new THREE.MeshStandardMaterial({map:lunarTexture,bumpMap:lunarBump??undefined,bumpScale:.16,roughness:1,metalness:0});
    const moon=new THREE.Mesh(new THREE.SphereGeometry(2.3,geometrySegments,Math.max(16,geometrySegments*.75)),lunarMaterial);
    moonGroup.add(moon);
    const craterMat=lowQuality?new THREE.MeshLambertMaterial({color:0x686c72}):new THREE.MeshStandardMaterial({color:0x686c72,roughness:1});
    for(let i=0;i<(lowQuality?16:quality==='medium'?28:48);i++){
      const theta=Math.random()*Math.PI*2, phi=Math.acos(2*Math.random()-1), r=2.3;
      const p=new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
      const crater=new THREE.Mesh(new THREE.CircleGeometry(.035+Math.random()*.095,lowQuality?5:7),craterMat);
      crater.position.copy(p.multiplyScalar(r*.997)); crater.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),p.clone().normalize());moonGroup.add(crater);
    }
    const rocketBuild=makeRocket(lowQuality,lowQuality?16:quality==='medium'?20:24);const rocket=rocketBuild.group;scene.add(rocket);
    const engineGlow=new THREE.PointLight(0xff7a26,0,10,2);
    engineGlow.position.set(0,-2.45,0);scene.add(engineGlow);
    const escapeTower=new THREE.Group();
    const escapeTowerMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0xb8c0c6}):new THREE.MeshStandardMaterial({color:0xb8c0c6,metalness:.72,roughness:.3});
    const towerShaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,1.05,8),escapeTowerMaterial);escapeTower.add(towerShaft);
    const towerTip=new THREE.Mesh(new THREE.ConeGeometry(.11,.34,8),lowQuality?new THREE.MeshLambertMaterial({color:0xc9824a}):new THREE.MeshStandardMaterial({color:0xc9824a,metalness:.48,roughness:.4}));towerTip.position.y=.68;escapeTower.add(towerTip);
    const towerBrace=new THREE.Mesh(new THREE.BoxGeometry(.28,.06,.08),escapeTowerMaterial);towerBrace.position.y=-.28;escapeTower.add(towerBrace);scene.add(escapeTower);
    const fairings=new THREE.Group();
    const fairingMaterial=new THREE.MeshStandardMaterial({color:0xdddcd4,metalness:.58,roughness:.32,side:THREE.DoubleSide});
    for(let i=0;i<2;i++){const shell=new THREE.Mesh(new THREE.CylinderGeometry(.1,.43,.92,12,1,true,i*Math.PI,Math.PI),fairingMaterial);shell.position.y=4.22;shell.rotation.y=i*Math.PI;fairings.add(shell);}
    scene.add(fairings);
    const stage2=new THREE.Mesh(new THREE.CylinderGeometry(.3,.38,1.7,16),new THREE.MeshStandardMaterial({color:0xe3e2d9,metalness:.55,roughness:.4}));scene.add(stage2);
    const booster=new THREE.Mesh(new THREE.CylinderGeometry(.55,.72,1.55,18),new THREE.MeshStandardMaterial({color:0xb87545,metalness:.62,roughness:.39}));scene.add(booster);
    const stage2Flame=new THREE.Mesh(new THREE.ConeGeometry(.22,1.1,12),new THREE.MeshBasicMaterial({color:0x7fdcff,transparent:true,opacity:.86}));stage2Flame.rotation.x=Math.PI;scene.add(stage2Flame);
    const smokeGeo=new THREE.BufferGeometry(), puffCount=lowQuality?120:quality==='medium'?180:260, puffPositions=new Float32Array(puffCount*3);
    const puffVel=new Float32Array(puffCount*3);
    for(let i=0;i<puffCount;i++){puffPositions[i*3]=(Math.random()-.5)*2.4;puffPositions[i*3+1]=-3.18+Math.random()*.14;puffPositions[i*3+2]=(Math.random()-.5)*2.1;puffVel[i*3]=(Math.random()-.5)*.04;puffVel[i*3+1]=.003+Math.random()*.01;puffVel[i*3+2]=(Math.random()-.5)*.05;}
    smokeGeo.setAttribute('position',new THREE.BufferAttribute(puffPositions,3));
    const smoke=new THREE.Points(smokeGeo,new THREE.PointsMaterial({color:0xc6d5e4,size:lowQuality?.3:.23,transparent:true,opacity:.45,depthWrite:false}));scene.add(smoke);
    const flame=new THREE.Mesh(new THREE.ConeGeometry(.43,2.15,lowQuality?8:12),new THREE.MeshBasicMaterial({color:0xffa243,transparent:true,opacity:.88,depthWrite:false})); flame.rotation.x=Math.PI; flame.position.y=-3.6;rocket.add(flame);
    const exhaustCount=lowQuality?120:quality==='medium'?170:220, exhaustGeo=new THREE.BufferGeometry(), exhaustPositions=new Float32Array(exhaustCount*3), exhaustVel=new Float32Array(exhaustCount*3);
    for(let i=0;i<exhaustCount;i++){exhaustPositions[i*3]=(Math.random()-.5)*.42;exhaustPositions[i*3+1]=-Math.random()*2.1;exhaustPositions[i*3+2]=(Math.random()-.5)*.42;exhaustVel[i*3]=(Math.random()-.5)*.012;exhaustVel[i*3+1]=-.035-Math.random()*.055;exhaustVel[i*3+2]=(Math.random()-.5)*.012;}
    exhaustGeo.setAttribute('position',new THREE.BufferAttribute(exhaustPositions,3));
    const exhaust=new THREE.Points(exhaustGeo,new THREE.PointsMaterial({color:0xffb557,size:lowQuality?.16:.14,transparent:true,opacity:.87,blending:THREE.AdditiveBlending,depthWrite:false}));
    exhaust.position.y=-3.55;rocket.add(exhaust);exhaust.visible=false;
    const pad=new THREE.Group();scene.add(pad);
    const launchGround=new THREE.Mesh(new THREE.PlaneGeometry(280,280),lowQuality?new THREE.MeshLambertMaterial({color:0x404955}):new THREE.MeshStandardMaterial({color:0x404955,roughness:.96}));
    launchGround.rotation.x=-Math.PI/2;launchGround.position.y=-3.38;launchGround.receiveShadow=highQuality;scene.add(launchGround);
    const concreteApron=new THREE.Mesh(new THREE.PlaneGeometry(18,14),lowQuality?new THREE.MeshLambertMaterial({color:0x636b72}):new THREE.MeshStandardMaterial({color:0x636b72,roughness:.86}));
    concreteApron.rotation.x=-Math.PI/2;concreteApron.position.set(0,-3.365,0);concreteApron.receiveShadow=highQuality;scene.add(concreteApron);
    const stripeMaterial=new THREE.MeshBasicMaterial({color:0xd5c9a3});
    for(const z of [-5.6,5.6]){
      const stripe=new THREE.Mesh(new THREE.PlaneGeometry(13,.1),stripeMaterial);stripe.rotation.x=-Math.PI/2;stripe.position.set(0,-3.35,z);scene.add(stripe);
    }
    const platformMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0x394b5c}):new THREE.MeshStandardMaterial({color:0x394b5c,metalness:.7,roughness:.55});
    const platform=new THREE.Mesh(new THREE.CylinderGeometry(2.6,3.1,.34,lowQuality?14:24),platformMaterial);platform.position.y=-2.24;pad.add(platform);
    const supportMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0x7c8a96}):new THREE.MeshStandardMaterial({color:0x7c8a96,metalness:.72,roughness:.35});
    for(let i=0;i<4;i++){const leg=new THREE.Mesh(new THREE.BoxGeometry(.18,.94,.18),supportMaterial);const a=i*Math.PI/2;leg.position.set(Math.cos(a)*1.5,-2.8,Math.sin(a)*1.5);pad.add(leg);}
    const trench=new THREE.Mesh(new THREE.BoxGeometry(1.15,.35,6.2),new THREE.MeshBasicMaterial({color:0x151b22}));trench.position.set(0,-3.17,2.15);pad.add(trench);
    const deflector=new THREE.Mesh(new THREE.BoxGeometry(1.8,.11,1.1),supportMaterial);deflector.position.set(0,-2.48,1.65);pad.add(deflector);
    const padLights:THREE.Mesh[]=[];
    const padLightMaterial=new THREE.MeshBasicMaterial({color:0xffc877});
    for(const [x,z] of [[-7,-5],[7,-5],[-7,5],[7,5]]){
      const light=new THREE.Mesh(new THREE.SphereGeometry(.075,8,6),padLightMaterial);light.position.set(x,-3.28,z);scene.add(light);padLights.push(light);
    }
    const launchTower=new THREE.Group();
    const towerMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0x9ba7af}):new THREE.MeshStandardMaterial({color:0xb8c0c6,metalness:.72,roughness:.3});
    launchTower.position.set(2.5,-3.3,0);
    for(const z of [-.72,.72]){
      const post=new THREE.Mesh(new THREE.BoxGeometry(.14,9,.14),towerMaterial);post.position.set(0,4.5,z);launchTower.add(post);
    }
    for(let y=0;y<=8;y+=1.5){
      const beam=new THREE.Mesh(new THREE.BoxGeometry(.12,.09,1.5),towerMaterial);beam.position.set(0,y+.3,0);launchTower.add(beam);
      const cross=new THREE.Mesh(new THREE.BoxGeometry(2.5,.07,.08),towerMaterial);cross.position.set(-1.25,y+.3,0);launchTower.add(cross);
    }
    for(let y=.8;y<8;y+=1.5){
      const braceA=new THREE.Mesh(new THREE.BoxGeometry(.08,1.45,.08),towerMaterial);braceA.position.set(0,y,.72);braceA.rotation.z=.55;launchTower.add(braceA);
      const braceB=new THREE.Mesh(new THREE.BoxGeometry(.08,1.45,.08),towerMaterial);braceB.position.set(0,y,-.72);braceB.rotation.z=-.55;launchTower.add(braceB);
    }
    scene.add(launchTower);
    const supportArms=new THREE.Group();
    const armMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0xc6ced2}):new THREE.MeshStandardMaterial({color:0xc6ced2,metalness:.62,roughness:.34});
    const upperArm=new THREE.Group();upperArm.position.set(2.5,1.35,0);
    const lowerArm=new THREE.Group();lowerArm.position.set(2.5,-1.03,0);
    for(const arm of [upperArm,lowerArm]){
      const beam=new THREE.Mesh(new THREE.BoxGeometry(2.05,.12,.16),armMaterial);beam.position.x=-1.02;arm.add(beam);
      const tip=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),armMaterial);tip.position.x=-2.0;arm.add(tip);
      supportArms.add(arm);
    }
    scene.add(supportArms);
    const lunarFloor=new THREE.Mesh(new THREE.PlaneGeometry(180,180,lowQuality?24:48,lowQuality?24:48),lowQuality?new THREE.MeshLambertMaterial({color:0x777b80}):new THREE.MeshStandardMaterial({color:0x777b80,roughness:1,metalness:0}));
    lunarFloor.rotation.x=-Math.PI/2;lunarFloor.position.y=-.18;lunarFloor.receiveShadow=highQuality;lunarFloor.visible=false;scene.add(lunarFloor);
    const floorPos=lunarFloor.geometry.attributes.position as THREE.BufferAttribute;
    for(let i=0;i<floorPos.count;i++){const x=floorPos.getX(i),z=floorPos.getY(i);floorPos.setZ(i,Math.sin(x*.16)*.1+Math.cos(z*.19)*.08+Math.sin((x+z)*.4)*.025);} floorPos.needsUpdate=true;lunarFloor.geometry.computeVertexNormals();
    const lander=new THREE.Group();scene.add(lander);
    const landerFlame=new THREE.Mesh(new THREE.ConeGeometry(.31,1.25,12),new THREE.MeshBasicMaterial({color:0xffa347,transparent:true,opacity:.88,blending:THREE.AdditiveBlending,depthWrite:false}));
    landerFlame.rotation.x=Math.PI;landerFlame.position.y=.52;landerFlame.visible=false;lander.add(landerFlame);
    const landerBody=new THREE.Mesh(new THREE.CylinderGeometry(.62,.84,.9,8),new THREE.MeshStandardMaterial({color:0xd9c48b,metalness:.54,roughness:.4}));landerBody.position.y=1.45;lander.add(landerBody);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;const leg=new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,1.5,6),new THREE.MeshStandardMaterial({color:0xb9c0c0,metalness:.8,roughness:.35}));leg.position.set(Math.cos(a)*.72,.55,Math.sin(a)*.72);leg.rotation.z=Math.cos(a)*-.38;leg.rotation.x=Math.sin(a)*.38;lander.add(leg);}
    for(let i=0;i<2;i++){const rail=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,1.65,6),new THREE.MeshStandardMaterial({color:0xb8c2c6,metalness:.75,roughness:.35}));rail.position.set(.95+i*.24,1.2,.08);lander.add(rail);}
    for(let i=0;i<6;i++){const rung=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.3,6),new THREE.MeshStandardMaterial({color:0xb8c2c6,metalness:.75,roughness:.35}));rung.rotation.z=Math.PI/2;rung.position.set(1.06,.55+i*.24,.08);lander.add(rung);}
    const dust=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xc1b8a0,size:.13,transparent:true,opacity:.7}));scene.add(dust);
    const dustPositions=new Float32Array((lowQuality?90:180)*3);
    for(let i=0;i<dustPositions.length;i+=3){dustPositions[i]=(Math.random()-.5)*6;dustPositions[i+1]=Math.random()*1.2;dustPositions[i+2]=(Math.random()-.5)*3;}
    dust.geometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
    const astronaut=makeAstronaut();scene.add(astronaut);
    const flagGroup=new THREE.Group();scene.add(flagGroup);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,2.2,8),new THREE.MeshStandardMaterial({color:0xc5cbd0,metalness:.8,roughness:.24}));pole.position.y=1.1;flagGroup.add(pole);
    const flagCanvas=document.createElement('canvas');flagCanvas.width=512;flagCanvas.height=300;
    const flagCtx=flagCanvas.getContext('2d')!;
    const flagTexture=new THREE.CanvasTexture(flagCanvas); flagTexture.colorSpace=THREE.SRGBColorSpace;
    const flagMesh=new THREE.Mesh(new THREE.PlaneGeometry(1.35,.78),new THREE.MeshStandardMaterial({map:flagTexture,side:THREE.DoubleSide,roughness:.76}));flagMesh.position.set(.7,1.62,0);flagGroup.add(flagMesh);
    if(highQuality){
      lander.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});
      astronaut.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});
      flagGroup.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});
    }
    const beacon=new THREE.Mesh(new THREE.TorusGeometry(.48,.025,6,32),new THREE.MeshBasicMaterial({color:0x71e3ff,transparent:true,opacity:.9}));
    beacon.rotation.x=Math.PI/2;beacon.position.set(4,.03,-1);scene.add(beacon);
    const footprints:THREE.Mesh[]=[];
    const printMaterial=new THREE.MeshStandardMaterial({color:0x555960,roughness:1});
    for(let i=0;i<12;i++){
      const print=new THREE.Mesh(new THREE.SphereGeometry(.1,7,5),printMaterial);
      print.scale.set(.75,.12,1.3);print.position.set(1.3+i*.245,.005,.25-i*.107);print.rotation.y=i%2?-.18:.18;scene.add(print);footprints.push(print);
    }
    const pathPts=Array.from({length:120},(_,i)=>{const t=i/119;return new THREE.Vector3(Math.cos(t*Math.PI*2)*(.45+t*3.4),Math.sin(t*Math.PI*2)*(.18+t*.6),-4-t*8);});
    const trajectory=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts),new THREE.LineDashedMaterial({color:0x70def4,dashSize:.17,gapSize:.13,transparent:true,opacity:.65}));trajectory.computeLineDistances();scene.add(trajectory);
    const capsules=new THREE.Group();
    const capsuleMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0xdeddd5}):new THREE.MeshStandardMaterial({color:0xdeddd5,metalness:.64,roughness:.3});
    const capsule=new THREE.Mesh(new THREE.SphereGeometry(.38,lowQuality?12:18,lowQuality?8:12),capsuleMaterial);capsules.add(capsule);
    const windowGlass=new THREE.Mesh(
      new THREE.SphereGeometry(.37,lowQuality?18:28,lowQuality?12:18,Math.PI*.25,Math.PI*.5,Math.PI*.28,Math.PI*.44),
      new THREE.MeshBasicMaterial({color:0xc9efff,transparent:true,opacity:.025,side:THREE.DoubleSide,depthWrite:false}),
    );
    capsules.add(windowGlass);
    const capsuleInterior=new THREE.Group();
    const capsuleFrameMaterial=lowQuality?new THREE.MeshLambertMaterial({color:0x9ba8b0}):new THREE.MeshStandardMaterial({color:0x9ba8b0,metalness:.72,roughness:.28});
    const capsuleWindowFrame=new THREE.Mesh(new THREE.TorusGeometry(.4,.022,5,lowQuality?24:36),capsuleFrameMaterial);
    capsuleWindowFrame.position.set(0,0,.34);capsuleWindowFrame.scale.y=.72;capsuleInterior.add(capsuleWindowFrame);
    const capsuleInnerFrame=new THREE.Mesh(new THREE.TorusGeometry(.35,.009,4,lowQuality?20:32),capsuleFrameMaterial);
    capsuleInnerFrame.position.set(0,0,.345);capsuleInnerFrame.scale.y=.72;capsuleInterior.add(capsuleInnerFrame);
    const capsuleRivetGeometry=new THREE.SphereGeometry(.014,6,4);
    for(let i=0;i<10;i++){
      const angle=i/10*Math.PI*2;
      const rivet=new THREE.Mesh(capsuleRivetGeometry,capsuleFrameMaterial);
      rivet.position.set(Math.cos(angle)*.4,Math.sin(angle)*.29,.35);
      capsuleInterior.add(rivet);
    }
    const capsuleDashboard=new THREE.Mesh(new THREE.BoxGeometry(.55,.1,.17),lowQuality?new THREE.MeshLambertMaterial({color:0x172436}):new THREE.MeshStandardMaterial({color:0x172436,metalness:.34,roughness:.58}));
    capsuleDashboard.position.set(0,-.28,.22);capsuleInterior.add(capsuleDashboard);
    [0x40edc4,0x67dfff,0xffc66b].forEach((color,index)=>{
      const light=new THREE.Mesh(new THREE.SphereGeometry(.022,6,5),new THREE.MeshBasicMaterial({color}));
      light.position.set(-.13+index*.13,-.275,.315);capsuleInterior.add(light);
    });
    capsules.add(capsuleInterior);
    scene.add(capsules);
    const tliFlame=new THREE.Mesh(new THREE.ConeGeometry(.15,.9,12),new THREE.MeshBasicMaterial({color:0xffa64b,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    tliFlame.rotation.x=-Math.PI/2;tliFlame.position.set(0,0,.48);capsules.add(tliFlame);
    const orbitLine=new THREE.Mesh(new THREE.TorusGeometry(6.7,.012,5,lowQuality?64:120),new THREE.MeshBasicMaterial({color:0x81d8f5,transparent:true,opacity:.44}));orbitLine.rotation.x=Math.PI/2;orbitLine.position.set(0,-7,-10);scene.add(orbitLine);
    const confettiGeo=new THREE.BufferGeometry(), confettiCount=lowQuality?70:quality==='medium'?110:150, confettiPositions=new Float32Array(confettiCount*3), confettiColors=new Float32Array(confettiCount*3);
    const palette=[[.37,.85,1],[.71,.59,1],[.88,.92,1],[.35,.76,.63]];
    for(let i=0;i<confettiCount;i++){confettiPositions[i*3]=(Math.random()-.5)*13;confettiPositions[i*3+1]=Math.random()*12;confettiPositions[i*3+2]=(Math.random()-.5)*5;confettiColors.set(palette[i%palette.length],i*3);}
    confettiGeo.setAttribute('position',new THREE.BufferAttribute(confettiPositions,3));confettiGeo.setAttribute('color',new THREE.BufferAttribute(confettiColors,3));
    const confetti=new THREE.Points(confettiGeo,new THREE.PointsMaterial({size:.11,vertexColors:true,transparent:true,opacity:.95}));
    scene.add(confetti);

    let disposed=false, raf=0, prev=performance.now(), lastRender=0, drag=false, lastX=0,lastY=0, yaw=0,pitch=0,zoom=1;
    const activePointers=new Map<number,{x:number;y:number}>();
    let pinchStart=0,pinchZoom=1,renderedFlag='';
    let visibilityRaf=0;
    const resize=()=>{const w=host.clientWidth||innerWidth,h=host.clientHeight||innerHeight;renderer.setPixelRatio(Math.min(adaptivePixelRatio,devicePixelRatio||1));renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w/h<.8?60:LOW_POWER_DEVICE?56:48;camera.updateProjectionMatrix();};
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
    props.onLoaded();
    const dawnColor=skyColor.clone();
    const spaceColor=new THREE.Color(0x050813);
    const orbitAim=new THREE.Vector3();
    const cameraGoalPosition=new THREE.Vector3();
    const cameraGoalTarget=new THREE.Vector3();
    const renderedCameraTarget=new THREE.Vector3(0,1,0);
    const cameraTransitionPosition=new THREE.Vector3();
    const cameraTransitionTarget=new THREE.Vector3();
    const cameraOffset=new THREE.Vector3();
    const firstPersonForward=new THREE.Vector3();
    const earthward=new THREE.Vector3();
    const engineOffset=new THREE.Vector3(0,-1.85,0);
    const earthInverseQuaternion=new THREE.Quaternion();
    const cameraSpherical=new THREE.Spherical();
    const visualPosition=new THREE.Vector3();
    const moonTarget=new THREE.Vector3();
    const qualityMaxPoints={smoke:puffCount,exhaust:exhaustCount,stars:starCount};
    let particleScale=1;
    let averageFrameMs=16.7, lastAdaptiveCheck=0, lastFpsUpdate=0;
    let lastSceneSecond=-1, fractionalSecond=0,lastPhase=stateRef.current.phase;
    let cameraTransitionElapsed=1, lastCameraMode=stateRef.current.firstPerson;
    cameraTransitionPosition.copy(camera.position);
    cameraTransitionTarget.copy(renderedCameraTarget);
    const frame=(now:number)=>{
      if(disposed||document.hidden)return;
      raf=requestAnimationFrame(frame);
      if(lastRender&&now-lastRender<1000/60)return;
      const dt=Math.min((now-(lastRender||prev))/1000,.05);
      prev=now;lastRender=now;
      const s=stateRef.current;
      if(s.phaseSeconds!==lastSceneSecond){lastSceneSecond=s.phaseSeconds;fractionalSecond=0;}
      else if(!s.paused)fractionalSecond=Math.min(.98,fractionalSecond+dt);
      const t=s.phaseSeconds+fractionalSecond;
      averageFrameMs=averageFrameMs*.92+dt*1000*.08;
      if(s.flagName!==renderedFlag){drawFlag(s.flagName);renderedFlag=s.flagName;}
      const isEarth=s.phase==='ready'||s.phase==='countdown'||s.phase==='ascent'||s.phase==='orbit'||s.phase==='journey';
      const earthVisible=isEarth||s.phase==='surface'||s.phase==='finish';
      confetti.visible=s.phase==='finish';beacon.visible=s.phase==='surface'||s.phase==='finish';
      for(let index=0;index<footprints.length;index++)footprints[index].visible=s.phase==='finish'||s.phase==='surface'&&s.walking>=index*8;
      earth.visible=earthVisible;earthGlow.visible=earthVisible;cityLights.visible=earthVisible&&!lowQuality;clouds.visible=earthVisible;
      moonGroup.visible=s.phase==='orbit'||s.phase==='journey'||s.phase==='landing'||s.phase==='surface'||s.phase==='finish';
      const launchScene=s.phase==='ready'||s.phase==='countdown'||s.phase==='ascent';
      const launchFirstPerson=s.firstPerson&&launchScene;
      launchGround.visible=launchScene;concreteApron.visible=launchScene;pad.visible=launchScene;
      launchTower.visible=launchScene;supportArms.visible=launchScene;
      dawnSky.visible=launchScene;
      for(const light of padLights)light.visible=launchScene;
      rocket.visible=s.phase==='ready'||s.phase==='countdown'||s.phase==='ascent';
      for(const part of rocketBuild.exteriorParts)part.visible=!launchFirstPerson;
      for(const part of rocketBuild.firstStageParts)part.visible=!launchFirstPerson&&!(s.phase==='ascent'&&t>=165);
      rocketBuild.cockpit.visible=launchFirstPerson;
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
      capsule.visible=!s.firstPerson;
      windowGlass.visible=true;
      capsuleInterior.visible=s.firstPerson&&(s.phase==='orbit'||s.phase==='journey');
      orbitLine.visible=s.phase==='orbit';
      lunarFloor.visible=s.phase==='landing'||s.phase==='surface'||s.phase==='finish';
      lander.visible=s.phase==='landing'||s.phase==='surface'||s.phase==='finish';
      astronaut.visible=s.phase==='surface'||s.phase==='finish';
      flagGroup.visible=!!s.flagName&&(s.phase==='surface'||s.phase==='finish');
      dust.visible=s.phase==='landing';
      const altitudeProgress=s.phase==='ascent'?THREE.MathUtils.clamp(t/510,0,1):0;
      starMaterial.opacity=s.phase==='ascent'
        ? THREE.MathUtils.smoothstep(altitudeProgress,.36,.74)
        : (s.phase==='orbit'||s.phase==='journey'||s.phase==='landing'||s.phase==='surface'||s.phase==='finish')?0.9:0;
      const ignition=s.phase==='countdown'?THREE.MathUtils.clamp((t-2)/.8,0,1):s.phase==='ascent'?1-THREE.MathUtils.clamp(t/165,0,1):0;
      engineGlow.intensity=ignition*7;
      engineGlow.position.copy(rocket.position).add(engineOffset);
      const armRetract=s.phase==='countdown'?THREE.MathUtils.clamp((t-2)/1.2,0,1):s.phase==='ascent'?1:0;
      upperArm.rotation.z=-armRetract*1.06;
      lowerArm.rotation.z=armRetract*.92;
      const frameShake=ignition>0&&!reducedMotion ? .014*ignition : 0;
      cameraGoalPosition.copy(camera.position);
      cameraTarget.set(0,1,0);
      if(s.phase==='ready'||s.phase==='countdown'){
        rocket.position.set(0,0,0);if(!s.paused)rocket.rotation.z=Math.sin(now*.0006)*.006;
        cameraGoalPosition.set(0,4.1,16);
        cameraTarget.set(0,1,0);
        skyColor.copy(dawnColor);
        (dawnSky.material as THREE.MeshBasicMaterial).opacity=1;
        flame.scale.set(1,s.phase==='countdown'&&t>2?1.2:.45,1);
      }
      if(s.phase==='ascent'){
        // Wall-clock ascent lasts 8.5 minutes; scene altitude maps this long arc into a compact cinematic climb.
        const p=altitudeProgress;
        rocket.position.set(Math.sin(t*.1)*.1, -.2+p*22, 0);
        if(!s.paused)rocket.rotation.z=Math.sin(t*.17)*.012;
        cameraGoalPosition.set(.4,rocket.position.y+4.4,16+Math.min(p*11,10));
        cameraTarget.set(rocket.position.x,rocket.position.y+1,0);
        if(booster.visible){booster.position.set(rocket.position.x-.12,rocket.position.y-1.3-Math.min((t-165)*.09,8),.2);booster.rotation.z=Math.min((t-165)*.004,.35);}
        if(stage2.visible){stage2.position.set(.1,rocket.position.y-1.25,0);stage2Flame.position.set(.1,rocket.position.y-2.35,0);}
        skyColor.lerpColors(dawnColor,spaceColor,p);
        (dawnSky.material as THREE.MeshBasicMaterial).opacity=1-p;
        earth.position.set(0,-8-p*3,-10-p*5);earth.scale.setScalar(1+p*.13);
      }
      if(s.phase==='orbit'){
        const orbitAngle=t/18*Math.PI*2;
        capsules.position.set(Math.cos(orbitAngle)*6.7,-7+Math.sin(orbitAngle)*1.15,-10-Math.sin(orbitAngle)*6.7);
        capsules.rotation.set(0,Math.PI+orbitAngle,0);
        earth.position.set(0,-7,-10);earth.rotation.y+=s.paused?0:dt*.045;
        moonGroup.position.set(0,1,-39);moonGroup.scale.setScalar(.92);
        cameraGoalPosition.set(0,13,22);
        cameraTarget.set(0,-7,-10);
      }
      if(s.phase==='journey'){
        const p=THREE.MathUtils.clamp(t/165,0,1);
        earth.position.set(-4-p*4,-2,-12-p*11);earth.scale.setScalar(1-p*.62);earth.rotation.y+=s.paused?0:dt*.07;
        moonGroup.position.set(4-p*3,1,-30+p*21);moonGroup.scale.setScalar(.16+p*.84);moon.rotation.y+=s.paused?0:dt*.025;
        capsules.position.set(-1+p*1.7,1+Math.sin(t*.06)*.28,-9-p*13);
        orbitAim.copy(moonGroup.position).sub(capsules.position);
        capsules.rotation.set(Math.sin(t*.025)*.08,Math.atan2(orbitAim.x,orbitAim.z),Math.sin(t*.06)*.08);
        if(t>=145){
          const capture=THREE.MathUtils.clamp((t-145)/10,0,1);
          const dx=capsules.position.x-moonGroup.position.x,dz=capsules.position.z-moonGroup.position.z;
          const startRadius=Math.hypot(dx,dz),startAngle=Math.atan2(dz,dx),angle=startAngle+capture*Math.PI*2;
          const radius=startRadius*(1-capture*.62);
          capsules.position.set(moonGroup.position.x+Math.cos(angle)*radius,moonGroup.position.y+(capsules.position.y-moonGroup.position.y)*(1-capture)+Math.sin(angle*2)*.22*capture,moonGroup.position.z+Math.sin(angle)*radius);
          capsules.rotation.set(0,angle+Math.PI/2,0);
        }
        cameraGoalPosition.set(capsules.position.x+3,capsules.position.y+3.2,capsules.position.z+13);
        cameraTarget.copy(moonGroup.position);
        skyColor.setRGB(.02-p*.005,.04-p*.012,.09-p*.045);
      }
      if(s.phase==='landing'){
        const p=THREE.MathUtils.clamp(t/55,0,1);
        moonGroup.position.set(0,0,-3);moonGroup.scale.setScalar(1.08);
        lander.position.set(Math.sin(s.tilt)*1.4*(1-p),4-p*3.75,0);lander.rotation.z=s.tilt*(1-p);
        flame.visible=false;landerFlame.scale.set(.8,s.throttle*1.5,.8);
        cameraGoalPosition.set(8,6,15);
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
        cameraGoalPosition.set(astronaut.position.x*.55,3.3,10);
        cameraTarget.set(astronaut.position.x,.9,0);
        astronaut.rotation.y=2.0+(!s.paused?Math.sin(now*.002)*.04:0);
        if(s.phase==='surface'&&t<8)astronaut.rotation.z=!s.paused?Math.sin(now*.003)*.035:0;
        else astronaut.rotation.z=0;
      }
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
          const particleTime=dt*60;
          for(let i=0;i<puffCount;i++){puffPositions[i*3]+=puffVel[i*3]*particleTime;puffPositions[i*3+1]+=puffVel[i*3+1]*particleTime;puffPositions[i*3+2]+=puffVel[i*3+2]*particleTime;if(puffPositions[i*3+1]>-2.25){puffPositions[i*3]=(Math.random()-.5)*2.4;puffPositions[i*3+1]=-3.18+Math.random()*.14;puffPositions[i*3+2]=(Math.random()-.5)*2.1;}}
          a.needsUpdate=true;
        }
        if(exhaust.visible){
          const a=exhaustGeo.attributes.position as THREE.BufferAttribute;
          const particleTime=dt*60;
          for(let i=0;i<exhaustCount;i++){
            exhaustPositions[i*3]+=exhaustVel[i*3]*particleTime;exhaustPositions[i*3+1]+=exhaustVel[i*3+1]*particleTime;exhaustPositions[i*3+2]+=exhaustVel[i*3+2]*particleTime;
            if(exhaustPositions[i*3+1]<-3.1){exhaustPositions[i*3]=(Math.random()-.5)*.4;exhaustPositions[i*3+1]=.1;exhaustPositions[i*3+2]=(Math.random()-.5)*.4;}
          }
          a.needsUpdate=true;
        }
      }
      earthGlow.position.copy(earth.position);earthGlow.scale.copy(earth.scale);
      cityLights.position.copy(earth.position);cityLights.quaternion.copy(earth.quaternion);cityLights.scale.copy(earth.scale);
      clouds.position.copy(earth.position);clouds.quaternion.copy(earth.quaternion);if(!s.paused&&!reducedMotion)clouds.rotateY(.00018);clouds.scale.copy(earth.scale);
      if(!lowQuality){
        earthInverseQuaternion.copy(earth.quaternion).invert();
        cityUniforms.uSunDirection.value.copy(sunDirection).applyQuaternion(earthInverseQuaternion);
      }
      if(s.firstPerson){
        if(launchScene){
          cameraGoalPosition.set(rocket.position.x,rocket.position.y+4.15*.72,rocket.position.z+.12*.72);
          cameraTarget.set(rocket.position.x,rocket.position.y+4.18*.72,rocket.position.z-22);
        }else if(s.phase==='journey'||s.phase==='orbit'){
          visualPosition.set(0,0,.05).applyQuaternion(capsules.quaternion);
          cameraGoalPosition.copy(capsules.position).add(visualPosition);
          if(s.phase==='orbit'){
            firstPersonForward.set(0,0,1).applyQuaternion(capsules.quaternion).normalize();
            earthward.copy(earth.position).sub(capsules.position).normalize();
            firstPersonForward.addScaledVector(earthward,.32).normalize();
            cameraTarget.copy(capsules.position).addScaledVector(firstPersonForward,38);
          }else{
            cameraTarget.copy(moonGroup.position);
          }
        }else if(s.phase==='landing'){
          cameraGoalPosition.set(lander.position.x,lander.position.y+1.5,lander.position.z+.2);
          cameraTarget.set(lander.position.x,lander.position.y+1.35,lander.position.z-14);
        }else if(s.phase==='surface'||s.phase==='finish'){
          cameraGoalPosition.set(astronaut.position.x,astronaut.position.y+1.4,astronaut.position.z+1.1);
          cameraTarget.set(4,1,-1);
        }else{
          cameraGoalPosition.set(0,3.05,.1);
          cameraTarget.set(0,3.05,-20);
        }
        if(frameShake>0){
          cameraGoalPosition.x+=Math.sin(now*.038)*frameShake;
          cameraGoalPosition.y+=Math.cos(now*.032)*frameShake*.55;
        }
      }else{
        cameraOffset.copy(cameraGoalPosition).sub(cameraTarget);
        cameraSpherical.setFromVector3(cameraOffset);
        cameraSpherical.theta+=yaw;
        cameraSpherical.phi=THREE.MathUtils.clamp(cameraSpherical.phi+pitch,.2,Math.PI-.2);
        cameraSpherical.radius=THREE.MathUtils.clamp(cameraSpherical.radius*zoom,4.5,92);
        cameraGoalPosition.setFromSpherical(cameraSpherical).add(cameraTarget);
      }
      if(s.phase!==lastPhase||s.firstPerson!==lastCameraMode){
        lastPhase=s.phase;lastCameraMode=s.firstPerson;
        cameraTransitionElapsed=0;
        cameraTransitionPosition.copy(camera.position);
        cameraTransitionTarget.copy(renderedCameraTarget);
      }
      if(cameraTransitionElapsed<1)cameraTransitionElapsed=Math.min(1,cameraTransitionElapsed+dt/.72);
      const cameraBlend=cameraTransitionElapsed>=1?1:1-Math.pow(1-cameraTransitionElapsed,3);
      camera.position.lerpVectors(cameraTransitionPosition,cameraGoalPosition,cameraBlend);
      renderedCameraTarget.lerpVectors(cameraTransitionTarget,cameraTarget,cameraBlend);
      camera.lookAt(renderedCameraTarget);
      if(!s.paused&&s.phase==='finish'){for(let i=0;i<confettiCount;i++){confettiPositions[i*3+1]-=dt*1.6;if(confettiPositions[i*3+1]<-5)confettiPositions[i*3+1]=10;}(confettiGeo.attributes.position as THREE.BufferAttribute).needsUpdate=true;}
      if(s.showFps&&fpsRef.current&&now-lastFpsUpdate>=200){
        fpsRef.current.textContent=`${Math.round(1000/Math.max(averageFrameMs,1))} FPS`;
        fpsRef.current.hidden=false;lastFpsUpdate=now;
      }else if(!s.showFps&&fpsRef.current){
        fpsRef.current.hidden=true;
      }
      if(now-lastAdaptiveCheck>=1500){
        if(averageFrameMs>25){
          if(adaptivePixelRatio>.68)adaptivePixelRatio=Math.max(.68,adaptivePixelRatio-.12);
          particleScale=Math.max(.4,particleScale-.12);
        }else if(averageFrameMs<17){
          adaptivePixelRatio=Math.min(maxPixelRatio,adaptivePixelRatio+.04);
          particleScale=Math.min(1,particleScale+.06);
        }
        renderer.setPixelRatio(Math.min(adaptivePixelRatio,devicePixelRatio||1));
        renderer.setSize(host.clientWidth||innerWidth,host.clientHeight||innerHeight,false);
        smokeGeo.setDrawRange(0,Math.max(8,Math.floor(qualityMaxPoints.smoke*particleScale)));
        exhaustGeo.setDrawRange(0,Math.max(8,Math.floor(qualityMaxPoints.exhaust*particleScale)));
        starsGeo.setDrawRange(0,Math.max(64,Math.floor(qualityMaxPoints.stars*particleScale)));
        lastAdaptiveCheck=now;
      }
      renderer.render(scene,camera);
    };
    const onVisibility=()=>{cancelAnimationFrame(raf);cancelAnimationFrame(visibilityRaf);if(!document.hidden){prev=performance.now();raf=requestAnimationFrame(frame);visibilityRaf=raf;}};
    document.addEventListener('visibilitychange',onVisibility);
    raf=requestAnimationFrame(frame);visibilityRaf=raf;
    return ()=>{
      disposed=true;cancelAnimationFrame(raf);cancelAnimationFrame(visibilityRaf);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('resize',resize);
       viewSurface.removeEventListener('pointerdown',down);viewSurface.removeEventListener('pointermove',move);viewSurface.removeEventListener('pointerup',up);viewSurface.removeEventListener('pointercancel',up);viewSurface.removeEventListener('wheel',wheel);
      scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Points){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{if('map'in m&&m.map)m.map.dispose();m.dispose();});}});
      cityTexture.dispose();
      renderer.dispose();renderer.domElement.remove();
    };
  }, [props.quality]);

  return <div className="mission-scene" ref={hostRef} aria-label="مشهد ثلاثي الأبعاد لرحلة القمر" data-testid="simulation-three-scene">
    <div className="mission-fps-counter" ref={fpsRef} hidden aria-hidden="true" />
    {fallback&&<MissionCanvasFallback state={stateRef.current}/>}
  </div>;
}
