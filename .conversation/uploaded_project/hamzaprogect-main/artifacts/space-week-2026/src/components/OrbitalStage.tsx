import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { canCreateWebGLContext } from '@/lib/webgl';
import { CENTURY_MS, J2000_EPOCH, orbitalPoint, planets, positionFor } from './solar-system-model';

type PlanetSpec = (typeof planets)[number];

function makeGlow(color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
  gradient.addColorStop(0, `${color}88`);
  gradient.addColorStop(.28, `${color}30`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makePlanetTexture(spec: PlanetSpec): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const color = `#${spec.color.toString(16).padStart(6, '0')}`;
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (spec.name === 'الأرض') {
    context.fillStyle = '#548d70';
    [[42, 48, 24, 17], [61, 70, 13, 25], [118, 46, 34, 19], [151, 67, 13, 28], [204, 43, 27, 15], [226, 70, 16, 19]].forEach(([x, y, rx, ry]) => {
      context.beginPath();
      context.ellipse(x, y, rx, ry, -.32, 0, Math.PI * 2);
      context.fill();
    });
    context.strokeStyle = 'rgba(225, 246, 255, .23)';
    context.lineWidth = 3;
    for (let y = 20; y < 120; y += 31) {
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(64, y - 11, 186, y + 12, 256, y - 4);
      context.stroke();
    }
  } else if (spec.name === 'المشتري' || spec.name === 'زحل') {
    for (let y = 4; y < 128; y += 9 + Math.random() * 9) {
      context.fillStyle = `rgba(${y % 2 ? '255,245,220' : '73,49,43'}, ${.08 + Math.random() * .18})`;
      context.fillRect(0, y, 256, 3 + Math.random() * 7);
    }
    if (spec.name === 'المشتري') {
      context.fillStyle = 'rgba(172, 96, 66, .7)';
      context.beginPath();
      context.ellipse(178, 77, 20, 8, -.08, 0, Math.PI * 2);
      context.fill();
    }
  } else if (spec.name === 'أورانوس' || spec.name === 'نبتون' || spec.name === 'الزهرة') {
    for (let y = 7; y < 128; y += 16) {
      context.strokeStyle = `rgba(255,255,255,${.07 + Math.random() * .1})`;
      context.lineWidth = 2 + Math.random() * 4;
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(72, y + 3, 174, y - 5, 256, y + 1);
      context.stroke();
    }
  } else {
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = 1 + Math.random() * (spec.name === 'عطارد' ? 7 : 4);
      context.beginPath();
      context.ellipse(x, y, radius, radius * (.35 + Math.random() * .4), 0, 0, Math.PI * 2);
      context.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.11)' : 'rgba(30,20,20,.12)';
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function CanvasSolarFallback() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = matchMedia('(max-width: 720px)').matches;
    const stars = Array.from({ length: mobile ? 170 : 390 }, () => ({
      x: Math.random(),
      y: Math.random(),
      phase: Math.random() * Math.PI * 2,
      radius: .35 + Math.random() * 1.05,
      tint: Math.random() > .82 ? '#b8a3ff' : Math.random() > .62 ? '#95e9ff' : '#f1f5ff',
    }));
    let width = 0;
    let height = 0;
    let ratio = 1;
    let raf = 0;
    let disposed = false;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (time: number) => {
      if (disposed || document.hidden) return;
      context.clearRect(0, 0, width, height);
      const nebulaOne = context.createRadialGradient(width * .23, height * .28, 0, width * .23, height * .28, width * .45);
      nebulaOne.addColorStop(0, 'rgba(89, 61, 182, .13)');
      nebulaOne.addColorStop(1, 'rgba(66, 48, 139, 0)');
      context.fillStyle = nebulaOne;
      context.fillRect(0, 0, width, height);
      const nebulaTwo = context.createRadialGradient(width * .83, height * .72, 0, width * .83, height * .72, width * .38);
      nebulaTwo.addColorStop(0, 'rgba(19, 113, 147, .10)');
      nebulaTwo.addColorStop(1, 'rgba(19, 113, 147, 0)');
      context.fillStyle = nebulaTwo;
      context.fillRect(0, 0, width, height);

      stars.forEach((star) => {
        const twinkle = reduced ? .58 : .22 + (Math.sin(time * .0014 + star.phase) + 1) * .3;
        context.globalAlpha = twinkle;
        context.fillStyle = star.tint;
        context.beginPath();
        context.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;

      const scale = Math.min(width / 26, height / 19) * .78;
      const centerX = width * .5;
      const centerY = height * .5;
      const centuries = (Date.now() - J2000_EPOCH) / CENTURY_MS;
      planets.forEach((planet) => {
        context.beginPath();
        for (let step = 0; step <= 160; step++) {
          const position = orbitalPoint(planet, step / 160 * Math.PI * 2, 0);
          const x = centerX + position.x * scale;
          const y = centerY - position.y * scale * .84;
          if (step === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = planet.name === 'الأرض' ? 'rgba(92, 196, 255, .25)' : 'rgba(165, 190, 226, .12)';
        context.lineWidth = 1;
        context.stroke();
      });

      const sunRadius = Math.max(9, scale * .2);
      const sunGlow = context.createRadialGradient(centerX, centerY, sunRadius * .12, centerX, centerY, sunRadius * 5);
      sunGlow.addColorStop(0, 'rgba(255, 202, 120, .57)');
      sunGlow.addColorStop(.27, 'rgba(255, 147, 81, .21)');
      sunGlow.addColorStop(1, 'rgba(255, 117, 68, 0)');
      context.fillStyle = sunGlow;
      context.beginPath();
      context.arc(centerX, centerY, sunRadius * 5, 0, Math.PI * 2);
      context.fill();
      const sunFace = context.createRadialGradient(centerX - sunRadius * .27, centerY - sunRadius * .3, sunRadius * .06, centerX, centerY, sunRadius);
      sunFace.addColorStop(0, '#fff2c9');
      sunFace.addColorStop(.55, '#ffc477');
      sunFace.addColorStop(1, '#ff865d');
      context.fillStyle = sunFace;
      context.beginPath();
      context.arc(centerX, centerY, sunRadius, 0, Math.PI * 2);
      context.fill();

      planets.forEach((planet) => {
        const position = positionFor(planet, centuries);
        const x = centerX + position.x * scale;
        const y = centerY - position.y * scale * .84;
        const radius = Math.max(2.7, planet.size * scale * .28);
        context.save();
        if (planet.name === 'زحل') {
          context.translate(x, y);
          context.rotate(-.22);
          context.beginPath();
          context.ellipse(0, 0, radius * 1.9, radius * .55, 0, 0, Math.PI * 2);
          context.strokeStyle = 'rgba(229, 210, 166, .72)';
          context.lineWidth = Math.max(1.5, radius * .27);
          context.stroke();
          context.translate(-x, -y);
        }
        const glow = context.createRadialGradient(x, y, radius * .3, x, y, radius * 3.8);
        glow.addColorStop(0, `#${planet.color.toString(16).padStart(6, '0')}72`);
        glow.addColorStop(1, `#${planet.color.toString(16).padStart(6, '0')}00`);
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, radius * 3.8, 0, Math.PI * 2);
        context.fill();
        const face = context.createRadialGradient(x - radius * .38, y - radius * .38, radius * .06, x, y, radius);
        face.addColorStop(0, '#ffffffaa');
        face.addColorStop(.3, `#${planet.color.toString(16).padStart(6, '0')}`);
        face.addColorStop(1, '#11182c');
        context.fillStyle = face;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.restore();
        if (planet.name === 'الأرض') {
          const days = (Date.now() - J2000_EPOCH) / 86400000;
          const angle = days * .22997 + 1.3;
          const moonX = x + Math.cos(angle) * scale * .47;
          const moonY = y - Math.sin(angle) * scale * .47;
          context.beginPath();
          context.ellipse(x, y, scale * .47, scale * .39, -.2, 0, Math.PI * 2);
          context.strokeStyle = 'rgba(184, 216, 237, .34)';
          context.lineWidth = .8;
          context.stroke();
          context.beginPath();
          context.arc(moonX, moonY, Math.max(1.2, scale * .025), 0, Math.PI * 2);
          context.fillStyle = '#d9e3f4';
          context.fill();
        }
      });
      raf = requestAnimationFrame(draw);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return <canvas ref={canvasRef} className="fallback-solar-canvas" aria-hidden="true" />;
}

export default function OrbitalStage() {
  const host = useRef<HTMLDivElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    if (!canCreateWebGLContext()) {
      setWebglUnavailable(true);
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setWebglUnavailable(true);
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
    camera.position.set(0, 0, 25);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    root.appendChild(renderer.domElement);
    const ambient = new THREE.AmbientLight(0x92a9d0, 1.1);
    scene.add(ambient);
    const sunLight = new THREE.PointLight(0xffd2a0, 48, 50, 1.6);
    scene.add(sunLight);
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(.78, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xffc17b, emissive: 0xff762b, emissiveIntensity: 1.8, roughness: .35 }),
    );
    scene.add(sun);
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('#ffae5b'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sunGlow.scale.set(5.8, 5.8, 1);
    scene.add(sunGlow);
    const solarCorona = new THREE.Mesh(new THREE.SphereGeometry(.96, 32, 24), new THREE.MeshBasicMaterial({ color: 0xff9d61, transparent: true, opacity: .14, side: THREE.BackSide }));
    scene.add(solarCorona);

    const planetMeshes: THREE.Mesh[] = [];
    const ringGeometry = new THREE.RingGeometry(1, 1.56, 72);
    planets.forEach((spec) => {
      const orbitPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i++) {
        orbitPoints.push(orbitalPoint(spec, i / 160 * Math.PI * 2, 0));
      }
      const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPoints), new THREE.LineBasicMaterial({ color: spec.name === 'الأرض' ? 0x4ea8df : 0x8295bd, transparent: true, opacity: spec.name === 'الأرض' ? .25 : .12 }));
      scene.add(orbit);
      const material = new THREE.MeshStandardMaterial({
        map: makePlanetTexture(spec),
        color: spec.color,
        roughness: .82,
        metalness: .01,
      });
      const planet = new THREE.Mesh(new THREE.SphereGeometry(spec.size, 24, 18), material);
      scene.add(planet);
      planetMeshes.push(planet);
      if (spec.name === 'زحل') {
        const saturnRing = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xd4c19a, transparent: true, opacity: .68, side: THREE.DoubleSide, depthWrite: false }));
        saturnRing.scale.set(spec.size * 1.27, spec.size * 1.27, 1);
        saturnRing.rotation.x = Math.PI * .31;
        planet.add(saturnRing);
      }
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(.085, 14, 10), new THREE.MeshStandardMaterial({ color: 0xc8cfdd, roughness: .85 }));
    const moonOrbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 81 }, (_, i) => new THREE.Vector3(Math.cos(i / 80 * Math.PI * 2) * .47, Math.sin(i / 80 * Math.PI * 2) * .47, 0))), new THREE.LineBasicMaterial({ color: 0xb8d8ed, transparent: true, opacity: .24 }));
    scene.add(moonOrbit);
    const starCount = window.innerWidth < 720 ? 380 : 950;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - .5) * 44;
      starPositions[i * 3 + 1] = (Math.random() - .5) * 27;
      starPositions[i * 3 + 2] = -4 - Math.random() * 16;
      const tint = Math.random();
      starColors.set(tint > .8 ? [0.53, .73, 1] : tint < .1 ? [.77, .58, 1] : [.75, .83, 1], i * 3);
    }
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ size: .035, vertexColors: true, transparent: true, opacity: .9, sizeAttenuation: true }));
    scene.add(stars);
    const starTwinkles: THREE.Sprite[] = [];
    const twinkleCount = window.innerWidth < 720 ? 9 : 20;
    for (let i = 0; i < twinkleCount; i++) {
      const twinkle = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlow(i % 4 === 0 ? '#c6aaff' : '#d5efff'),
        transparent: true,
        opacity: .48,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      twinkle.position.set((Math.random() - .5) * 34, (Math.random() - .5) * 22, -2);
      const scale = .2 + Math.random() * .24;
      twinkle.scale.set(scale, scale, 1);
      scene.add(twinkle);
      starTwinkles.push(twinkle);
    }
    const nebula = new THREE.Group();
    const nebulaSprites: THREE.Sprite[] = [];
    if (window.innerWidth >= 600) {
      [['#5340bd', 10, 4, -8, 0], ['#1d7294', -10, -5, -10, 1], ['#a3448b', 2, 10, -13, 2]].forEach(([color, x, y, z, i]) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow(String(color)), transparent: true, opacity: .22, depthWrite: false }));
        sprite.position.set(Number(x), Number(y), Number(z));
        sprite.scale.set(13 + Number(i), 8 + Number(i), 1);
        nebula.add(sprite);
        nebulaSprites.push(sprite);
      });
    }
    scene.add(nebula);
    const earthGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('#3b9fff'), transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending }));
    earthGlow.scale.set(1.5, 1.5, 1);
    scene.add(earthGlow);

    const resize = () => {
      const width = root.clientWidth || innerWidth;
      const height = root.clientHeight || innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.set(width < 600 ? 0 : 1.2, 0, width < 600 ? 29 : 25);
      camera.updateProjectionMatrix();
    };
    resize();
    let raf = 0;
    let previousFrame = 0;
    let disposed = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = () => {
      if (disposed || document.hidden) return;
      const elapsedSeconds = previousFrame ? Math.min((performance.now() - previousFrame) / 1000, .1) : 0;
      previousFrame = performance.now();
      const centuries = (Date.now() - J2000_EPOCH) / CENTURY_MS;
      planets.forEach((spec, index) => {
        const mesh = planetMeshes[index];
        mesh.position.copy(positionFor(spec, centuries));
        mesh.rotation.y += reduced ? 0 : spec.rotation * elapsedSeconds;
        if (spec.name === 'الأرض') {
          earthGlow.position.copy(mesh.position);
          moonOrbit.position.copy(mesh.position);
          const days = (Date.now() - J2000_EPOCH) / 86400000;
          const angle = days * .22997 + 1.3;
          moon.position.set(mesh.position.x + Math.cos(angle) * .47, mesh.position.y + Math.sin(angle) * .47, mesh.position.z + .025);
        }
      });
      stars.rotation.z = reduced ? 0 : Math.sin(Date.now() * .00005) * .002;
      starTwinkles.forEach((star, index) => {
        const material = star.material as THREE.SpriteMaterial;
        material.opacity = reduced ? .4 : .2 + (Math.sin(performance.now() * .0015 + index * 1.7) + 1) * .28;
      });
      if (!reduced) nebula.rotation.z = Math.sin(Date.now() * .000025) * .008;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(frame);
    };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) {
          object.geometry?.dispose?.();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if ('map' in material && material.map) material.map.dispose();
            material.dispose();
          });
        }
      });
      ringGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className="space-canvas" ref={host} aria-hidden="true" data-testid="visual-solar-system">
      {webglUnavailable && <CanvasSolarFallback />}
    </div>
  );
}
