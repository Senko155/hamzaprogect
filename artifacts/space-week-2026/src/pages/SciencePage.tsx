import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { ArrowDownLeft, ArrowDownRight, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { canCreateWebGLContext } from '@/lib/webgl';
import { CENTURY_MS, J2000_EPOCH, orbitalPoint, planets, positionFor, visualSemiMajorAxis } from '@/components/solar-system-model';
import { makeMathPlanetTexture, makeSunSurfaceTexture } from '@/components/math-planet-textures';
import { planetExtraTextureUrls, planetSurfaceTextureUrl } from '@/components/planet-texture-sources';
import { useLanguage } from '../i18n/LanguageContext';
import { videos } from '../videos.js';
import type { Language } from '../i18n/LanguageContext';
import VideoLanguageToggle from '../components/VideoLanguageToggle';
import LocalizedVideo from '../components/LocalizedVideo';
import { translations } from '../translations.js';

type PlanetId = keyof typeof translations.ar.science.names;

type Body = { id: PlanetId; color: number; size: number };
const bodies: Body[] = [
  { id: 'sun', color: 0xffb96b, size: .78 },
  ...planets.map(({ id, color, size }) => ({ id: id as PlanetId, color, size })),
];

type MoonSpec = { name: string; color: number; size: number; orbit: number; period: number; phase: number };
const moonsByPlanet: Record<string, MoonSpec[]> = {
  earth: [{ name: 'Moon', color: 0xd9dce2, size: .14, orbit: 2.1, period: 19, phase: .4 }],
  mars: [
    { name: 'Phobos', color: 0xaaa59b, size: .075, orbit: 1.8, period: 12, phase: .3 },
    { name: 'Deimos', color: 0xc4b9a9, size: .055, orbit: 2.55, period: 17, phase: 2.2 },
  ],
  jupiter: [
    { name: 'Io', color: 0xd8b967, size: .1, orbit: 1.55, period: 12, phase: .2 },
    { name: 'Europa', color: 0xd8c9aa, size: .085, orbit: 2.12, period: 16, phase: 1.4 },
    { name: 'Ganymede', color: 0x9a8972, size: .145, orbit: 2.72, period: 22, phase: 2.9 },
    { name: 'Callisto', color: 0x766f68, size: .12, orbit: 3.36, period: 28, phase: 4.3 },
  ],
  saturn: [
    { name: 'Titan', color: 0xd8a956, size: .14, orbit: 2.45, period: 24, phase: .6 },
    { name: 'Rhea', color: 0xb6b2a9, size: .09, orbit: 3.02, period: 17, phase: 2.3 },
    { name: 'Dione', color: 0xc8c4b9, size: .075, orbit: 3.6, period: 14, phase: 4.1 },
    { name: 'Enceladus', color: 0xe1e3dd, size: .065, orbit: 4.18, period: 11, phase: 5.3 },
  ],
  uranus: [
    { name: 'Miranda', color: 0xa8a59c, size: .055, orbit: 1.95, period: 12, phase: .4 },
    { name: 'Ariel', color: 0xc2bfb7, size: .07, orbit: 2.43, period: 16, phase: 1.6 },
    { name: 'Umbriel', color: 0x77756f, size: .075, orbit: 2.92, period: 20, phase: 2.8 },
    { name: 'Titania', color: 0xaaa69d, size: .1, orbit: 3.42, period: 25, phase: 4.1 },
    { name: 'Oberon', color: 0x908d84, size: .09, orbit: 3.94, period: 30, phase: 5.4 },
  ],
  neptune: [{ name: 'Triton', color: 0xc4d0d0, size: .12, orbit: 2.2, period: 22, phase: .9 }],
};

const scienceOrbitAxes: Record<string, number> = {
  mercury: 6,
  venus: 10.5,
  earth: 15,
  mars: 22,
  jupiter: 33,
  saturn: 54,
  uranus: 82,
  neptune: 112,
};

const scienceOrbitMultiplier = (spec: (typeof planets)[number]) =>
  scienceOrbitAxes[spec.id] / visualSemiMajorAxis(spec.a);

function sceneOrbitalPoint(spec: (typeof planets)[number], anomaly: number, mathMode: boolean) {
  return orbitalPoint(spec, anomaly, 0).multiplyScalar(mathMode ? 1.28 : scienceOrbitMultiplier(spec));
}

function scenePositionFor(spec: (typeof planets)[number], centuries: number, mathMode: boolean) {
  return positionFor(spec, centuries).multiplyScalar(mathMode ? 1.28 : scienceOrbitMultiplier(spec));
}

const scienceSystemExtent = Math.max(
  ...planets.map((spec) => {
    const bodyRadius = spec.size * 2.4;
    const ringExtent = spec.id === 'saturn' ? 2.22 : spec.id === 'uranus' ? 1.73 : 1;
    const moonExtent = Math.max(0, ...(moonsByPlanet[spec.id] ?? []).map((moon) => bodyRadius * (moon.orbit + moon.size)));
    return scienceOrbitAxes[spec.id] * (1 + spec.e) + Math.max(bodyRadius * ringExtent, moonExtent);
  }),
  .78 * 2.4 * 1.48,
) + 4;

const axialTilt: Record<string, number> = {
  sun: 7.25, mercury: .034, venus: 177.4, earth: 23.44,
  mars: 25.19, jupiter: 3.13, saturn: 26.73, uranus: 97.77, neptune: 28.32,
};
const rotationPeriod: Record<string, number> = {
  sun: 34, mercury: 33, venus: -38, earth: 30, mars: 31,
  jupiter: 21, saturn: 25, uranus: -29, neptune: 27,
};

function makeAtmosphereMaterial(color: number, opacity: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDirection;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float glowOpacity;
      varying vec3 vNormal;
      varying vec3 vViewDirection;
      void main() {
        float edge = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDirection)), 0.0), 3.4);
        gl_FragColor = vec4(glowColor, edge * glowOpacity);
      }
    `,
    uniforms: {
      glowColor: { value: new THREE.Color(color) },
      glowOpacity: { value: opacity },
    },
    side: THREE.FrontSide,
  });
}

function makeBumpTexture(id: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  let seed = [...id].reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 17);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  context.fillStyle = '#707070';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const count = id === 'mercury' ? 470 : 210;
  for (let index = 0; index < count; index++) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = id === 'mercury' ? 3 + random() * 22 : 2 + random() * 12;
    const crater = context.createRadialGradient(x - radius * .24, y - radius * .22, 1, x, y, radius);
    crater.addColorStop(0, '#bcbcbc');
    crater.addColorStop(.65, '#525252');
    crater.addColorStop(.88, '#929292');
    crater.addColorStop(1, '#666666');
    context.fillStyle = crater;
    context.beginPath();
    context.ellipse(x, y, radius, radius * (.55 + random() * .25), random() * .2, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function makeEarthFallbackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const ocean = context.createLinearGradient(0, 0, 0, canvas.height);
    ocean.addColorStop(0, '#123f68');
    ocean.addColorStop(.5, '#17648b');
    ocean.addColorStop(1, '#0d345b');
    context.fillStyle = ocean;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'earth-blue-ocean-fallback';
  return texture;
}

type ProjectedLabel = { id: string; x: number; y: number; radius: number };
type LabelSize = { width: number; height: number };
function measureLabels(labels: Map<string, HTMLButtonElement | null>) {
  const sizes = new Map<string, LabelSize>();
  labels.forEach((label, id) => {
    if (label) sizes.set(id, { width: label.offsetWidth || 70, height: label.offsetHeight || 31 });
  });
  return sizes;
}

function placeProjectedLabels(
  bodiesToPlace: ProjectedLabel[],
  labels: Map<string, HTMLButtonElement | null>,
  sizes: Map<string, LabelSize>,
  previous: Map<string, { x: number; y: number }>,
  width: number,
  height: number,
  selectedId: string | null,
  preferAbove: boolean,
  host: HTMLDivElement,
) {
  const placements = new Map<string, { x: number; y: number }>();
  const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
  const hostRect = host.getBoundingClientRect();
  const reserved = preferAbove
    ? Array.from(document.querySelectorAll(
        '.math-page .math-title, .math-page .math-scene-prompt, .math-page .video-language-row, .math-page .math-video-facts, .math-page .math-planet-picker, .math-page .math-back',
      )).map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left - hostRect.left + rect.width / 2, y: rect.top - hostRect.top + rect.height / 2, width: rect.width, height: rect.height };
      })
    : [];
  const rings = preferAbove ? [1, 1.5, 2.2, 3.1, 4.2, 5.4] : [1, 1.55, 2.15, 2.85];
  const ordered = [...bodiesToPlace].sort((a, b) => {
    if (a.id === selectedId) return -1;
    if (b.id === selectedId) return 1;
    return a.y - b.y || a.x - b.x;
  });
  ordered.forEach((body) => {
    const label = labels.get(body.id);
    const size = sizes.get(body.id);
    if (!label || !size || body.x < -body.radius || body.x > width + body.radius || body.y < -body.radius || body.y > height + body.radius) {
      if (label) { label.style.opacity = '0'; label.style.pointerEvents = 'none'; label.tabIndex = -1; }
      return;
    }
    const old = previous.get(body.id);
    let best: { x: number; y: number; score: number } | null = null;
    const angles = preferAbove
      ? [-Math.PI / 2, -5 * Math.PI / 12, -7 * Math.PI / 12, -Math.PI / 3, -2 * Math.PI / 3, -Math.PI / 4, -3 * Math.PI / 4]
      : Array.from({ length: 8 }, (_, index) => -Math.PI / 2 + index * Math.PI / 4);
    for (const ring of rings) {
      for (let index = 0; index < angles.length; index++) {
        const angle = angles[index];
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const extent = Math.abs(cos) * size.width / 2 + Math.abs(sin) * size.height / 2;
        const distance = body.radius + extent + 7;
        let x = body.x + cos * distance * ring;
        let y = body.y + sin * distance * ring;
        x = THREE.MathUtils.clamp(x, size.width / 2 + 7, Math.max(size.width / 2 + 7, width - size.width / 2 - 7));
        y = THREE.MathUtils.clamp(y, size.height / 2 + 7, Math.max(size.height / 2 + 7, height - size.height / 2 - 7));
        const rect = { x, y, width: size.width, height: size.height };
        let overlapPenalty = 0;
        const overlaps = (other: { x: number; y: number; width: number; height: number }) => {
          const overlapX = Math.max(0, (rect.width + other.width) / 2 + 5 - Math.abs(rect.x - other.x));
          const overlapY = Math.max(0, (rect.height + other.height) / 2 + 5 - Math.abs(rect.y - other.y));
          return overlapX * overlapY;
        };
        let blockedByControl = false;
        reserved.forEach((other) => {
          const area = overlaps(other);
          if (area > 0) blockedByControl = true;
        });
        if (blockedByControl) continue;
        occupied.forEach((other) => { overlapPenalty += overlaps(other); });
        const oldPenalty = old ? Math.hypot(x - old.x, y - old.y) * .22 : 0;
        const distancePenalty = Math.hypot(x - body.x, y - body.y) + oldPenalty;
        const score = distancePenalty + overlapPenalty * 1000;
        if (!best || score < best.score) best = { x, y, score };
      }
      if (best && best.score < 1200) break;
    }
    if (!best) {
      label.style.opacity = '0';
      label.style.pointerEvents = 'none';
      label.tabIndex = -1;
      return;
    }
    const position = { x: best.x, y: best.y };
    previous.set(body.id, position);
    placements.set(body.id, position);
    occupied.push({ ...position, width: size.width, height: size.height });
  });
  return placements;
}

function drawMathPlanet(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  id: string,
  sunX: number,
  sunY: number,
) {
  const colors: Record<string, [string, string, string]> = {
    mercury: ['#b8b3ab', '#77716e', '#3b3b43'],
    venus: ['#ffe0a0', '#cf773c', '#8f412e'],
    earth: ['#5cc8e8', '#2f8a5a', '#152c61'],
    mars: ['#e8895c', '#a94634', '#54292c'],
    jupiter: ['#f0d5a7', '#bc8868', '#72463c'],
    saturn: ['#f0dfae', '#b8a071', '#786542'],
    uranus: ['#c8f7ee', '#83d0d0', '#3f8794'],
    neptune: ['#7a9dff', '#3154bd', '#17276e'],
  };
  const palette = colors[id];
  if (!palette) return;
  const [light, mid, dark] = palette;
  const sunDistance = Math.hypot(sunX - x, sunY - y) || 1;
  const lightX = (sunX - x) / sunDistance;
  const lightY = (sunY - y) / sunDistance;
  context.save();
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  const face = context.createRadialGradient(
    x + lightX * radius * .4,
    y + lightY * radius * .4,
    radius * .05,
    x - lightX * radius * .15,
    y - lightY * radius * .15,
    radius * 1.2,
  );
  face.addColorStop(0, light);
  face.addColorStop(.48, mid);
  face.addColorStop(1, dark);
  context.fillStyle = face;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  if (id === 'jupiter' || id === 'saturn' || id === 'uranus' || id === 'neptune') {
    context.globalAlpha = .6;
    for (let band = -3; band <= 3; band++) {
      context.fillStyle = band % 2 ? light : dark;
      context.beginPath();
      context.ellipse(x, y + band * radius * .3, radius * 1.2, radius * .11, 0, 0, Math.PI * 2);
      context.fill();
    }
    if (id === 'jupiter') {
      context.globalAlpha = .95;
      context.fillStyle = '#c65742';
      context.beginPath();
      context.ellipse(x + radius * .25, y + radius * .23, radius * .25, radius * .12, -.15, 0, Math.PI * 2);
      context.fill();
    }
  } else if (id === 'earth') {
    context.globalAlpha = .78;
    context.fillStyle = '#46884f';
    [[-.38, -.12, .34, .18], [.18, -.24, .37, .2], [.22, .36, .2, .32]].forEach(([dx, dy, rx, ry]) => {
      context.beginPath();
      context.ellipse(x + radius * dx, y + radius * dy, radius * rx, radius * ry, -.3, 0, Math.PI * 2);
      context.fill();
    });
    context.strokeStyle = 'rgba(255,255,255,.8)';
    context.lineWidth = Math.max(1, radius * .1);
    for (let cloud = -1; cloud <= 1; cloud++) {
      context.beginPath();
      context.arc(x, y + radius * cloud * .3, radius * .86, Math.PI * 1.08, Math.PI * 1.88);
      context.stroke();
    }
  } else {
    const craterCount = id === 'mercury' ? 11 : 5;
    for (let crater = 0; crater < craterCount; crater++) {
      const angle = crater * 2.399;
      const distance = radius * (.12 + ((crater * 37) % 61) / 100);
      const cx = x + Math.cos(angle) * distance;
      const cy = y + Math.sin(angle) * distance;
      const craterRadius = radius * (id === 'mercury' ? .07 + (crater % 4) * .018 : .05 + (crater % 3) * .018);
      context.fillStyle = 'rgba(52,32,28,.38)';
      context.beginPath();
      context.arc(cx, cy, craterRadius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(255,226,190,.46)';
      context.lineWidth = Math.max(.7, radius * .025);
      context.stroke();
    }
  }
  const shadow = context.createRadialGradient(
    x + lightX * radius * .15,
    y + lightY * radius * .15,
    radius * .12,
    x - lightX * radius * .35,
    y - lightY * radius * .35,
    radius * 1.1,
  );
  shadow.addColorStop(0, 'rgba(0,0,0,0)');
  shadow.addColorStop(.6, 'rgba(0,0,0,.12)');
  shadow.addColorStop(1, 'rgba(0,0,0,.72)');
  context.globalAlpha = 1;
  context.fillStyle = shadow;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  context.restore();
}

function drawSciencePlanet(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  id: string,
  sunX: number,
  sunY: number,
  texture: HTMLCanvasElement | HTMLImageElement | undefined,
  rotation = 0,
) {
  const distance = Math.hypot(sunX - x, sunY - y) || 1;
  const lightX = (sunX - x) / distance;
  const lightY = (sunY - y) / distance;
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.translate(-x, -y);
  context.shadowBlur = 0;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = id === 'earth' ? '#1d5b79' : id === 'uranus' ? '#82d7d6' : id === 'neptune' ? '#2347b2' : '#bd8060';
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  if (texture) context.drawImage(texture, x - radius, y - radius, radius * 2, radius * 2);
  if (id === 'earth') {
    context.strokeStyle = 'rgba(240,250,255,.48)';
    context.lineWidth = Math.max(1, radius * .025);
    for (let cloud = -1; cloud <= 1; cloud++) {
      context.beginPath();
      context.ellipse(x + cloud * radius * .16, y - cloud * radius * .12, radius * .8, radius * (.18 + Math.abs(cloud) * .035), -.28, .12, Math.PI * 1.72);
      context.stroke();
    }
    const oceanGlint = context.createRadialGradient(x + lightX * radius * .28, y + lightY * radius * .28, 1, x + lightX * radius * .2, y + lightY * radius * .2, radius * .72);
    oceanGlint.addColorStop(0, 'rgba(167,225,255,.2)');
    oceanGlint.addColorStop(1, 'rgba(150,215,255,0)');
    context.fillStyle = oceanGlint;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  if (id === 'venus') {
    context.globalAlpha = .4;
    context.strokeStyle = 'rgba(255,220,161,.68)';
    context.lineWidth = Math.max(1, radius * .045);
    for (let band = -2; band <= 2; band++) {
      context.beginPath();
      context.ellipse(x, y + band * radius * .24, radius * .95, radius * .18, .08, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  const shade = context.createRadialGradient(
    x - lightX * radius * .3,
    y - lightY * radius * .3,
    radius * .05,
    x - lightX * radius * .55,
    y - lightY * radius * .55,
    radius * 1.25,
  );
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(.43, 'rgba(0,0,0,.12)');
  shade.addColorStop(.76, 'rgba(0,0,0,.5)');
  shade.addColorStop(1, 'rgba(0,0,0,.88)');
  context.fillStyle = shade;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  const rim = context.createRadialGradient(
    x + lightX * radius * .24,
    y + lightY * radius * .24,
    radius * .52,
    x + lightX * radius * .34,
    y + lightY * radius * .34,
    radius * 1.04,
  );
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(.84, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(255,231,190,.3)');
  context.fillStyle = rim;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  context.restore();
}

function drawScienceSaturnRings(context: CanvasRenderingContext2D, x: number, y: number, radius: number, rotation: number, front: boolean) {
  const rings = [
    { scale: 1.45, color: 'rgba(224,205,160,.44)', width: .11 },
    { scale: 1.7, color: 'rgba(173,147,103,.72)', width: .16 },
    { scale: 1.94, color: 'rgba(238,222,185,.78)', width: .12 },
    { scale: 2.16, color: 'rgba(129,107,76,.52)', width: .09 },
  ];
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  rings.forEach(({ scale, color, width }) => {
    context.beginPath();
    context.ellipse(0, 0, radius * scale, radius * scale * .34, 0, front ? Math.PI : 0, front ? Math.PI * 2 : Math.PI);
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, radius * width);
    context.stroke();
  });
  context.restore();
}

function ScienceCanvasFallback({ host, selectedId, onSelect, mathMode, onEarthTextureStatus }: { host: HTMLDivElement | null; selectedId: string | null; onSelect: (id: string) => void; mathMode: boolean; onEarthTextureStatus: (available: boolean) => void }) {
  const { language } = useLanguage();
  const languageRef = useRef(language);
  languageRef.current = language;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef(selectedId);
  const selectRef = useRef(onSelect);
  selectedRef.current = selectedId;
  selectRef.current = onSelect;
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !host) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;
    let raf = 0;
    let disposed = false;
    let angle = -.22;
    let pitch = 0;
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let dragMode: 'rotate' | 'pan' = 'rotate';
    let gesture: { id: number; x: number; y: number; moved: boolean } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let pinchZoom = 1;
    let pinchCenter: { x: number; y: number } | null = null;
    let lastPositions = new Map<string, { x: number; y: number; radius: number }>();
    const fallbackTextureMaps: THREE.CanvasTexture[] = [];
    const planetTextures = new Map<string, HTMLCanvasElement | HTMLImageElement>();
    const fallbackBaseImages = new Map<string, HTMLCanvasElement>();
    bodies.forEach(({ id }) => {
      if (mathMode) return;
      const texture = id === 'sun'
        ? makeSunSurfaceTexture()
        : id === 'earth' && !mathMode
          ? makeEarthFallbackTexture()
          : makeMathPlanetTexture(id);
      fallbackTextureMaps.push(texture);
      planetTextures.set(id, texture.image as HTMLCanvasElement);
      fallbackBaseImages.set(id, texture.image as HTMLCanvasElement);
    });
    let loadedTextureId: string | null = null;
    let fallbackTextureRequest = 0;
    const epoch = J2000_EPOCH;
    const viewFocus = new THREE.Vector3();
    const transitionFromFocus = new THREE.Vector3();
    const transitionToFocus = new THREE.Vector3();
    const frozenPlanetPosition = new THREE.Vector3();
    let activeFocusId: string | null = null;
    let transitionFromId: string | null = null;
    let transitionToId: string | null = null;
    let frozenPlanetId: string | null = null;
    let transitionStarted = 0;
    let focusLevel = 0;
    let transitionFromLevel = 0;
    let transitionToLevel = 0;
    let cameraZoom = 1;
    let transitionFromZoom = 1;
    let transitionToZoom = 1;
    let centerXRatio = .5;
    let centerYRatio = .52;
    let transitionFromX = .5;
    let transitionToX = .5;
    let transitionFromY = .52;
    let transitionToY = .52;
    const labels = new Map<string, HTMLButtonElement | null>(bodies.map((body) => [body.id, document.querySelector<HTMLButtonElement>(`[data-body-label="${body.id}"]`)]));
    let labelSizes = measureLabels(labels);
    let measuredLanguage = languageRef.current;
    const previousLabelPositions = new Map<string, { x: number; y: number }>();
    const stars = Array.from({ length: window.innerWidth < 720 ? 125 : 220 }, () => ({
      x: Math.random(), y: Math.random(), r: .35 + Math.random() * .8, alpha: .18 + Math.random() * .4,
    }));
    const resize = () => {
      width = host.clientWidth || window.innerWidth;
      height = host.clientHeight || window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      labelSizes = measureLabels(labels);
    };
    const rotate = (x: number, y: number, z: number) => {
      const yawX = x * Math.cos(angle) - y * Math.sin(angle);
      const yawY = x * Math.sin(angle) + y * Math.cos(angle);
      return { x: yawX, y: yawY * Math.cos(pitch) - z * Math.sin(pitch), z: yawY * Math.sin(pitch) + z * Math.cos(pitch) };
    };
    const clampPan = () => {
      panX = THREE.MathUtils.clamp(panX, -width * .42, width * .42);
      panY = THREE.MathUtils.clamp(panY, -height * .36, height * .36);
    };
    const onContextMenu = (event: Event) => event.preventDefault();
    const down = (event: PointerEvent) => {
      dragMode = !mathMode && (event.button === 2 || event.shiftKey) ? 'pan' : 'rotate';
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = zoom;
        pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: pointers.size > 1 || dragMode === 'pan' };
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (previous) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size > 1) {
        const [a, b] = [...pointers.values()];
        const current = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDistance) zoom = THREE.MathUtils.clamp(pinchZoom * current / pinchDistance, .55, 22);
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (!mathMode && pinchCenter) {
          panX += center.x - pinchCenter.x;
          panY += center.y - pinchCenter.y;
          clampPan();
        }
        pinchCenter = center;
        if (gesture) gesture.moved = true;
        return;
      }
      if (!previous || !gesture || gesture.id !== event.pointerId) return;
      if (Math.abs(event.clientX - gesture.x) + Math.abs(event.clientY - gesture.y) > 5) gesture.moved = true;
      if (dragMode === 'pan') {
        panX += event.clientX - previous.x;
        panY += event.clientY - previous.y;
        clampPan();
      } else {
        angle += (event.clientX - previous.x) * .006;
        pitch = THREE.MathUtils.clamp(pitch + (event.clientY - previous.y) * .005, -.85, .85);
      }
    };
    const up = (event: PointerEvent) => {
      const moved = gesture?.moved ?? false;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) {
        pinchDistance = 0;
        pinchCenter = null;
      }
      if (gesture?.id === event.pointerId) gesture = null;
      if (moved || pointers.size) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = [...lastPositions.entries()]
        .map(([id, point]) => ({ id, d: Math.hypot(x - point.x, y - point.y), radius: point.radius }))
        .filter((point) => point.d < Math.max(20, point.radius + 9))
        .sort((a, b) => a.d - b.d)[0];
      if (hit) selectRef.current(hit.id);
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom * Math.exp(-event.deltaY * .001), .55, 22);
    };
    const requestFallbackTexture = (bodyId: string | null) => {
      if (mathMode || bodyId === loadedTextureId) return;
      if (loadedTextureId) {
        const baseImage = fallbackBaseImages.get(loadedTextureId);
        if (baseImage) planetTextures.set(loadedTextureId, baseImage);
      }
      loadedTextureId = bodyId;
      const request = ++fallbackTextureRequest;
      if (!bodyId) return;
      const resolution = window.innerWidth >= 1000 ? '4k' : '2k';
      const firstUrl = planetSurfaceTextureUrl(bodyId, resolution);
      if (!firstUrl) return;
      const loadImage = (url: string, canRetry: boolean) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.decoding = 'async';
        image.onload = () => {
          if (!disposed && request === fallbackTextureRequest) planetTextures.set(bodyId, image);
        };
        image.onerror = () => {
          const fallback = planetSurfaceTextureUrl(bodyId, '2k');
          if (canRetry && resolution === '4k' && fallback) loadImage(fallback, false);
        };
        image.src = url;
      };
      loadImage(firstUrl, true);
    };
    const draw = (time: number) => {
      if (disposed || document.hidden) return;
      const selected = mathMode ? null : selectedRef.current;
      requestFallbackTexture(selected);
      const centuries = (Date.now() - epoch) / CENTURY_MS;
      if (selected !== activeFocusId) {
        transitionFromFocus.copy(viewFocus);
        transitionFromLevel = focusLevel;
        transitionFromZoom = cameraZoom;
        transitionFromX = centerXRatio;
        transitionFromY = centerYRatio;
        transitionFromId = activeFocusId;
        transitionToId = selected;
        transitionToLevel = selected ? 1 : 0;
        const focusBody = bodies.find((body) => body.id === selected);
        transitionToFocus.set(0, 0, 0);
        if (selected && focusBody?.id !== 'sun') {
          const spec = planets.find((planet) => planet.id === selected);
          if (spec) {
            transitionToFocus.copy(positionFor(spec, centuries));
            frozenPlanetId = spec.id;
            frozenPlanetPosition.copy(transitionToFocus);
          }
        } else frozenPlanetId = null;
        const baseRadius = focusBody?.id === 'sun'
          ? Math.max(6, .78 * Math.min(width / 22, height / 23) * .87 * .3)
          : focusBody
            ? Math.max(3.2, focusBody.size * Math.min(width / 22, height / 23) * .87 * .3)
            : 1;
        transitionToZoom = focusBody
          ? THREE.MathUtils.clamp(.33 * width / (baseRadius * zoom), 2, 60)
          : 1;
        transitionToX = selected ? width < 760 ? .53 : .62 : .5;
        transitionToY = selected ? width < 760 ? .35 : .42 : .52;
        transitionStarted = time;
        activeFocusId = selected;
      }
      const linearProgress = transitionStarted ? THREE.MathUtils.clamp((time - transitionStarted) / 700, 0, 1) : 1;
      const ease = linearProgress * linearProgress * (3 - 2 * linearProgress);
      viewFocus.lerpVectors(transitionFromFocus, transitionToFocus, ease);
      focusLevel = THREE.MathUtils.lerp(transitionFromLevel, transitionToLevel, ease);
      cameraZoom = THREE.MathUtils.lerp(transitionFromZoom, transitionToZoom, ease);
      centerXRatio = THREE.MathUtils.lerp(transitionFromX, transitionToX, ease);
      centerYRatio = THREE.MathUtils.lerp(transitionFromY, transitionToY, ease);
      context.clearRect(0, 0, width, height);
      stars.forEach((star) => {
        context.globalAlpha = star.alpha;
        context.fillStyle = '#c7e8ff';
        context.beginPath();
        context.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
      const planetScale = mathMode ? 1.3 : 2.4;
      const scale = Math.min(width / (mathMode ? 31 : 22), height / (mathMode ? 29 : 23)) * .87;
      const cameraScale = scale * zoom * cameraZoom;
      const centerX = width * centerXRatio;
      const centerY = height * centerYRatio;
      const rotatedFocus = rotate(viewFocus.x, viewFocus.y, viewFocus.z);
      const transform = (point: THREE.Vector3) => {
        const p = rotate(point.x, point.y, point.z);
        return {
          x: centerX + panX + (p.x - rotatedFocus.x) * cameraScale,
          y: centerY + panY - (p.y - rotatedFocus.y) * cameraScale,
        };
      };
      const focusWeight = (id: string) => (transitionFromId === id ? 1 - ease : 0) + (transitionToId === id ? ease : 0);
      const opacityFor = (id: string) => THREE.MathUtils.clamp(1 - focusLevel * .84 + focusWeight(id) * .84, .12, 1);
      planets.forEach((spec) => {
        context.globalAlpha = (spec.id === 'earth' ? .29 : .15) * (1 - focusLevel * .72);
        context.strokeStyle = spec.id === 'earth' ? '#55bbeb' : '#8ba2c5';
        context.lineWidth = 1;
        context.beginPath();
        for (let step = 0; step <= 120; step++) {
          const p = transform(sceneOrbitalPoint(spec, step / 120 * Math.PI * 2, mathMode));
          if (step === 0) context.moveTo(p.x, p.y);
          else context.lineTo(p.x, p.y);
        }
        context.closePath();
        context.stroke();
        context.globalAlpha = 1;
      });
      const sunPoint = transform(new THREE.Vector3());
      const sunRadius = Math.max(mathMode ? 6 : 7.8, .78 * scale * .3 * planetScale) * zoom * cameraZoom;
      const sunGlow = context.createRadialGradient(sunPoint.x, sunPoint.y, 1, sunPoint.x, sunPoint.y, sunRadius * 4.2);
      sunGlow.addColorStop(0, '#ffe8b4');
      sunGlow.addColorStop(.25, '#ffc276b8');
      sunGlow.addColorStop(1, '#ff935000');
      context.globalAlpha = opacityFor('sun');
      context.fillStyle = sunGlow;
      context.beginPath();
      context.arc(sunPoint.x, sunPoint.y, sunRadius * 4.2, 0, Math.PI * 2);
      context.fill();
      const sunFace = context.createRadialGradient(sunPoint.x - sunRadius * .35, sunPoint.y - sunRadius * .35, 1, sunPoint.x, sunPoint.y, sunRadius);
      sunFace.addColorStop(0, '#fff5d3');
      sunFace.addColorStop(.55, '#ffc578');
      sunFace.addColorStop(1, '#f07652');
      context.fillStyle = sunFace;
      context.beginPath();
      context.arc(sunPoint.x, sunPoint.y, sunRadius, 0, Math.PI * 2);
      context.fill();
      if (!mathMode) {
        const sunTexture = planetTextures.get('sun');
        if (sunTexture) {
          context.save();
          context.beginPath();
          context.arc(sunPoint.x, sunPoint.y, sunRadius, 0, Math.PI * 2);
          context.clip();
          context.translate(sunPoint.x, sunPoint.y);
          context.rotate(time * 2 * Math.PI / 34000);
          context.translate(-sunPoint.x, -sunPoint.y);
          context.globalAlpha = opacityFor('sun') * .72;
          context.drawImage(sunTexture, sunPoint.x - sunRadius, sunPoint.y - sunRadius, sunRadius * 2, sunRadius * 2);
          context.restore();
        }
      }
      lastPositions = new Map([['sun', { ...sunPoint, radius: sunRadius }]]);
      planets.forEach((spec) => {
        const worldPosition = !mathMode && frozenPlanetId === spec.id && selected === spec.id
          ? frozenPlanetPosition
          : scenePositionFor(spec, centuries, mathMode);
        const point = transform(worldPosition);
        const radius = mathMode
          ? Math.max(5.5 + spec.size * scale * .36 * planetScale, spec.size * scale * .3 * planetScale) * zoom * cameraZoom
          : Math.max(4.16, spec.size * scale * .3 * planetScale) * zoom * cameraZoom;
        context.globalAlpha = opacityFor(spec.id);
        if (spec.id === 'saturn' && mathMode) {
          context.save();
          context.translate(point.x, point.y);
          context.rotate(-.22 + angle);
          context.beginPath();
          context.ellipse(0, 0, radius * 1.9, radius * .62, 0, 0, Math.PI * 2);
          context.strokeStyle = '#e5d2a6';
          context.lineWidth = Math.max(1.5, radius * .24);
          context.stroke();
          context.restore();
        } else if (spec.id === 'saturn') {
          drawScienceSaturnRings(context, point.x, point.y, radius, -.22 + angle, false);
        }
        const color = `#${spec.color.toString(16).padStart(6, '0')}`;
        const glow = context.createRadialGradient(point.x - radius * .35, point.y - radius * .35, 1, point.x, point.y, radius * 2.7);
        glow.addColorStop(0, '#ffffffcc');
        glow.addColorStop(.35, color);
        glow.addColorStop(1, '#11182c');
        context.fillStyle = glow;
        context.shadowBlur = selected === spec.id ? 22 : 10;
        context.shadowColor = color;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        if (mathMode) drawMathPlanet(context, point.x, point.y, radius, spec.id, sunPoint.x, sunPoint.y);
        else drawSciencePlanet(context, point.x, point.y, radius, spec.id, sunPoint.x, sunPoint.y, planetTextures.get(spec.id), time * 2 * Math.PI / (Math.abs(rotationPeriod[spec.id] ?? 30) * 1000) * Math.sign(rotationPeriod[spec.id] ?? 1));
        if (!mathMode && spec.id === 'saturn') drawScienceSaturnRings(context, point.x, point.y, radius, -.22 + angle, true);
        if (mathMode && spec.id === 'saturn') {
          context.save();
          context.translate(point.x, point.y);
          context.rotate(-.22 + angle);
          context.beginPath();
          context.ellipse(0, 0, radius * 2.05, radius * .64, 0, Math.PI, Math.PI * 2);
          context.strokeStyle = 'rgba(238,222,184,.86)';
          context.lineWidth = Math.max(1.4, radius * .18);
          context.stroke();
          context.strokeStyle = 'rgba(117,93,59,.62)';
          context.lineWidth = Math.max(.8, radius * .07);
          context.beginPath();
          context.ellipse(0, 0, radius * 1.48, radius * .45, 0, Math.PI, Math.PI * 2);
          context.stroke();
          context.restore();
        }
        context.shadowBlur = 0;
        lastPositions.set(spec.id, { ...point, radius });
      });
      if (!mathMode) {
        Object.entries(moonsByPlanet).forEach(([planetId, moonSpecs]) => {
          const planetPoint = lastPositions.get(planetId);
          if (!planetPoint) return;
          moonSpecs.forEach((moonSpec, index) => {
            const orbitRadius = planetPoint.radius * moonSpec.orbit;
            const orbitAngle = time * 2 * Math.PI / (moonSpec.period * 1000) + moonSpec.phase;
            const moonX = planetPoint.x + Math.cos(orbitAngle) * orbitRadius;
            const moonY = planetPoint.y + Math.sin(orbitAngle) * orbitRadius * .72;
            context.beginPath();
            context.ellipse(planetPoint.x, planetPoint.y, orbitRadius, orbitRadius * .72, 0, 0, Math.PI * 2);
            context.strokeStyle = 'rgba(191,213,242,.24)';
            context.lineWidth = Math.max(1, planetPoint.radius * .012);
            context.stroke();
            const moonRadius = Math.max(1.8, planetPoint.radius * moonSpec.size);
            const moonShade = context.createRadialGradient(moonX - moonRadius * .35, moonY - moonRadius * .35, .3, moonX, moonY, moonRadius);
            const moonColor = `#${moonSpec.color.toString(16).padStart(6, '0')}`;
            moonShade.addColorStop(0, '#f0eee7');
            moonShade.addColorStop(.58, moonColor);
            moonShade.addColorStop(1, '#33333b');
            context.fillStyle = moonShade;
            context.beginPath();
            context.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
            context.fill();
            context.globalAlpha = .35;
            context.fillStyle = '#37363a';
            for (let crater = 0; crater < 3; crater++) {
              const craterAngle = crater * 2.1 + index;
              context.beginPath();
              context.arc(moonX + Math.cos(craterAngle) * moonRadius * .42, moonY + Math.sin(craterAngle) * moonRadius * .3, Math.max(.4, moonRadius * .13), 0, Math.PI * 2);
              context.fill();
            }
            context.globalAlpha = 1;
          });
        });
      }
      context.globalAlpha = 1;
      const projectedBodies: ProjectedLabel[] = bodies.flatMap((body) => {
        const point = lastPositions.get(body.id);
        return point ? [{ id: body.id, ...point }] : [];
      });
      if (measuredLanguage !== languageRef.current) {
        labelSizes = measureLabels(labels);
        previousLabelPositions.clear();
        measuredLanguage = languageRef.current;
      }
      const placements = placeProjectedLabels(projectedBodies, labels, labelSizes, previousLabelPositions, width, height, selected, mathMode, host);
      placements.forEach((position, id) => {
        const label = labels.get(id);
        if (!label) return;
        label.style.left = `${position.x}px`;
        label.style.top = `${position.y}px`;
        label.style.transform = 'translate(-50%, -50%)';
        label.style.opacity = String(opacityFor(id));
        label.style.pointerEvents = 'auto';
        label.tabIndex = 0;
      });
      raf = requestAnimationFrame(draw);
    };
    const visibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(draw);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    resize();
    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      fallbackTextureRequest++;
      fallbackTextureMaps.forEach((texture) => texture.dispose());
    };
  }, [host]);
  return <canvas ref={canvasRef} className="science-fallback-canvas" aria-hidden="true" />;
}

export function ScienceScene({ selectedId, onSelect, mathMode = false, showMathLabels = true }: { selectedId: string | null; onSelect: (id: string) => void; mathMode?: boolean; showMathLabels?: boolean }) {
  const { t, language, direction } = useLanguage();
  const hostRef = useRef<HTMLDivElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const languageRef = useRef(language);
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;
  languageRef.current = language;
  useEffect(() => {
    hostRef.current?.querySelector<HTMLElement>('.science-webgl')?.setAttribute('aria-label', t.science.canvasDescription);
  }, [language, t]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!canCreateWebGLContext()) {
      setWebglFailed(true);
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setWebglFailed(true);
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 120);
    const target = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    const cameraOffset = new THREE.Vector3();
    const lookAtTarget = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    const screenUp = new THREE.Vector3();
    const projectedPoint = new THREE.Vector3();
    const planetScale = mathMode ? 1.3 : 2.4;
    const orbitScale = mathMode ? 1.28 : 1;
    const overviewDistanceForViewport = () => {
      const width = mathMode ? window.innerWidth : host.clientWidth || window.innerWidth;
      const height = mathMode ? window.innerHeight : host.clientHeight || window.innerHeight;
      const aspect = width / Math.max(height, 1);
      const verticalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      if (mathMode) {
        const fitDistance = 16.5 / (verticalTangent * Math.min(aspect, 1));
        return Math.max(43, fitDistance);
      }
      const ringAwareMargin = aspect < .7 ? 1.5 : 1.16;
      return (10.7 * ringAwareMargin) / (verticalTangent * Math.min(aspect, 1));
    };
    let overviewDistance = overviewDistanceForViewport();
    const spherical = new THREE.Spherical(overviewDistance, 1.22, .48);
    let desiredTheta = spherical.theta;
    let desiredPhi = spherical.phi;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const selectables: THREE.Object3D[] = [];
    const meshes = new Map<string, THREE.Mesh>();
    const bodyRoots = new Map<string, THREE.Group>();
    const spinGroups = new Map<string, THREE.Group>();
    const planetMaterials = new Map<string, THREE.MeshPhongMaterial>();
    const basePlanetTextures = new Map<string, THREE.Texture>();
    const atmospheres = new Map<string, THREE.Mesh>();
    const specialLayers = new Map<string, THREE.Mesh>();
    const moonAssemblies: Array<{ planetId: string; orbit: THREE.Group; period: number }> = [];
    const moonMaterials = new Map<number, THREE.MeshStandardMaterial>();
    const loadedSelectionTextures: THREE.Texture[] = [];
    const sharedSphere = new THREE.SphereGeometry(1, 56, 40);
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
    const nightSunDirection = new THREE.Vector3();
    let earthNightMaterial: THREE.MeshBasicMaterial | null = null;
    let earthCloudMaterial: THREE.MeshLambertMaterial | null = null;
    let venusCloudMaterial: THREE.MeshPhongMaterial | null = null;
    let saturnRingMaterial: THREE.MeshBasicMaterial | null = null;
    let selectedTextureBody: string | null = null;
    let textureRequestId = 0;
    const frozen = new Map<string, THREE.Vector3>();
    const slowProgress = new Map<string, number>();
    const epoch = J2000_EPOCH;
    let desiredDistance = overviewDistance;
    let zoomDistance = overviewDistance;
    const maxZoomDistance = () => mathMode ? 60 : Math.max(60, overviewDistance * 1.8);
    let dragging: { id: number; x: number; y: number; moved: boolean } | null = null;
    let dragMode: 'rotate' | 'pan' = 'rotate';
    let gestureMoved = false;
    const activePointers = new Map<number, { x: number; y: number }>();
    let hoveredId: string | null = null;
    let pinchStart = 0;
    let pinchZoom = overviewDistance;
    let pinchSelectedZoom = 1;
    let selectedZoom = 1;
    let pinchCenter: { x: number; y: number } | null = null;
    const panOffset = new THREE.Vector3();
    const panRight = new THREE.Vector3();
    const panUp = new THREE.Vector3();
    const panDelta = new THREE.Vector3();
    let raf = 0;
    let previous = 0;
    let disposed = false;
    let activeSceneSelection: string | null = null;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'science-webgl';
      renderer.domElement.setAttribute('aria-label', t.science.canvasDescription);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.dataset.testid = 'science-solar-canvas';
    host.appendChild(renderer.domElement);
    const labelElements = new Map<string, HTMLButtonElement | null>(bodies.map((body) => [body.id, document.querySelector<HTMLButtonElement>(`[data-body-label="${body.id}"]`)]));
    let labelSizes = measureLabels(labelElements);
    let measuredLanguage = languageRef.current;
    const previousLabelPositions = new Map<string, { x: number; y: number }>();

    scene.add(new THREE.AmbientLight(0x9cb3d4, mathMode ? .55 : .2));
    const solarLight = new THREE.PointLight(0xffd39a, 65, 65, 1.7);
    if (!mathMode) {
      solarLight.castShadow = true;
      solarLight.shadow.mapSize.set(512, 512);
      solarLight.shadow.camera.near = .1;
      solarLight.shadow.camera.far = 40;
      solarLight.shadow.radius = 3;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    scene.add(solarLight);
    const sunRadius = .78 * planetScale;
    const sunRoot = new THREE.Group();
    scene.add(sunRoot);
    const sunMaterial = new THREE.MeshStandardMaterial({
      map: mathMode ? undefined : makeSunSurfaceTexture(),
      color: mathMode ? 0xffc17b : 0xffffff,
      emissive: 0xff762b,
      emissiveIntensity: mathMode ? 2.3 : 1.3,
      roughness: .48,
    });
    const sun = new THREE.Mesh(sharedSphere, sunMaterial);
    sun.scale.setScalar(sunRadius);
    sun.userData.bodyId = 'sun';
    sunRoot.add(sun);
    sunRoot.rotation.x = THREE.MathUtils.degToRad(90 - axialTilt.sun);
    bodyRoots.set('sun', sunRoot);
    spinGroups.set('sun', sunRoot);
    meshes.set('sun', sun);
    selectables.push(sun);
    const sunHalo = new THREE.Mesh(
      sharedSphere,
      new THREE.MeshBasicMaterial({ color: 0xffa65d, transparent: true, opacity: mathMode ? .18 : .15, side: THREE.BackSide }),
    );
    sunHalo.scale.setScalar(sunRadius * (mathMode ? 1.26 : 1.18));
    sunRoot.add(sunHalo);
    if (!mathMode) {
      const corona = new THREE.Mesh(
        sharedSphere,
        new THREE.MeshBasicMaterial({ color: 0xff7c3a, transparent: true, opacity: .045, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      corona.scale.setScalar(sunRadius * 1.48);
      sunRoot.add(corona);
    }

    const sunBaseTexture = sunMaterial.map;
    if (sunBaseTexture) basePlanetTextures.set('sun', sunBaseTexture);
    planets.forEach((spec) => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) points.push(orbitalPoint(spec, i / 128 * Math.PI * 2, 0).multiplyScalar(orbitScale));
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: spec.id === 'earth' ? 0x4ea8df : 0x8295bd, transparent: true, opacity: spec.id === 'earth' ? .28 : .14 }),
      ));
      const planetRadius = spec.size * planetScale;
      const root = new THREE.Group();
      scene.add(root);
      bodyRoots.set(spec.id, root);
      const axialGroup = new THREE.Group();
      axialGroup.rotation.x = mathMode
        ? spec.id === 'uranus' ? THREE.MathUtils.degToRad(98) : 0
        : THREE.MathUtils.degToRad(90 - (axialTilt[spec.id] ?? 0));
      root.add(axialGroup);
      const spinGroup = new THREE.Group();
      axialGroup.add(spinGroup);
      spinGroups.set(spec.id, spinGroup);

      const map = makeMathPlanetTexture(spec.id);
      basePlanetTextures.set(spec.id, map);
      const bump = !mathMode && (spec.id === 'mercury' || spec.id === 'mars') ? makeBumpTexture(spec.id) : undefined;
      const material = new THREE.MeshPhongMaterial({
        map,
        color: 0xffffff,
        emissive: 0x000000,
        specular: spec.id === 'earth' && !mathMode ? new THREE.Color(0x526a83) : new THREE.Color(0x171717),
        shininess: spec.id === 'earth' && !mathMode ? 22 : 6,
        bumpMap: bump,
        bumpScale: spec.id === 'mercury' ? .075 : .03,
        transparent: true,
        opacity: 1,
      });
      const planet = new THREE.Mesh(sharedSphere, material);
      planet.scale.setScalar(planetRadius);
      planet.castShadow = !mathMode;
      planet.receiveShadow = !mathMode;
      planet.userData.bodyId = spec.id;
      spinGroup.add(planet);
      meshes.set(spec.id, planet);
      planetMaterials.set(spec.id, material);
      if (bump) (material.userData as { retainedBump?: THREE.Texture }).retainedBump = bump;

      if (!mathMode) {
        const atmosphere = new THREE.Mesh(sharedSphere, makeAtmosphereMaterial(
          spec.id === 'earth' ? 0x4caeff : spec.id === 'venus' ? 0xffad54 : spec.id === 'mars' ? 0xe77b55 : 0x73bbff,
          spec.id === 'earth' ? .42 : spec.id === 'venus' ? .24 : .17,
        ));
        atmosphere.scale.setScalar(planetRadius * (spec.id === 'venus' ? 1.09 : 1.045));
        axialGroup.add(atmosphere);
        atmospheres.set(spec.id, atmosphere);
      }

      if (spec.id === 'saturn') {
        const ringBands = mathMode
          ? [
              { inner: 1.18, outer: 1.38, color: 0xeee0ba, opacity: .52 },
              { inner: 1.41, outer: 1.72, color: 0xcbb787, opacity: .72 },
              { inner: 1.76, outer: 1.88, color: 0x8d7959, opacity: .42 },
              { inner: 1.94, outer: 2.18, color: 0xe6d5aa, opacity: .65 },
            ]
          : [{ inner: 1.08, outer: 2.22, color: 0xd9c7a0, opacity: .92 }];
        ringBands.forEach(({ inner, outer, color, opacity }) => {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(inner, outer, 144),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, alphaTest: mathMode ? 0 : .04 }),
          );
          if (!mathMode) saturnRingMaterial = ring.material as THREE.MeshBasicMaterial;
          ring.scale.setScalar(planetRadius);
          ring.rotation.x = mathMode ? Math.PI * .31 : -Math.PI / 2;
          ring.castShadow = !mathMode;
          ring.receiveShadow = false;
          axialGroup.add(ring);
        });
      }
      if (spec.id === 'uranus') {
        const uranusBands = [
          { inner: 1.2, outer: 1.29, color: 0x7899a4, opacity: .2 },
          { inner: 1.36, outer: 1.4, color: 0x9ab8c0, opacity: .13 },
          { inner: 1.47, outer: 1.58, color: 0x657e8b, opacity: .18 },
          { inner: 1.68, outer: 1.73, color: 0xacc3c6, opacity: .1 },
        ];
        uranusBands.forEach(({ inner, outer, color, opacity }) => {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(inner, outer, 88),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
          );
          ring.scale.setScalar(mathMode ? spec.size : planetRadius);
          ring.rotation.x = mathMode ? 0 : -Math.PI / 2;
          axialGroup.add(ring);
        });
      }

      if (!mathMode && spec.id === 'earth') {
        earthCloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .76, depthWrite: false });
        const cloudLayer = new THREE.Mesh(sharedSphere, earthCloudMaterial);
        cloudLayer.scale.setScalar(planetRadius * 1.012);
        cloudLayer.visible = false;
        axialGroup.add(cloudLayer);
        specialLayers.set('earthCloud', cloudLayer);

        earthNightMaterial = new THREE.MeshBasicMaterial({
          color: 0xffd08a,
          transparent: true,
          opacity: .72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        earthNightMaterial.onBeforeCompile = (shader) => {
          shader.uniforms.nightSunDirection = { value: nightSunDirection };
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vEarthWorldNormal;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEarthWorldNormal = normalize(mat3(modelMatrix) * normal);');
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 nightSunDirection;\nvarying vec3 vEarthWorldNormal;')
            .replace('#include <map_fragment>', '#include <map_fragment>\nfloat nightSide = 1.0 - smoothstep(-0.12, 0.12, dot(normalize(vEarthWorldNormal), normalize(nightSunDirection)));\ndiffuseColor.rgb *= nightSide;\ndiffuseColor.a *= nightSide;');
        };
        const nightLights = new THREE.Mesh(sharedSphere, earthNightMaterial);
        nightLights.scale.setScalar(planetRadius * 1.006);
        nightLights.visible = false;
        spinGroup.add(nightLights);
        specialLayers.set('earthNight', nightLights);
      }
      if (!mathMode && spec.id === 'venus') {
        venusCloudMaterial = new THREE.MeshPhongMaterial({
          color: 0xe7bd82,
          transparent: true,
          opacity: .56,
          shininess: 3,
          depthWrite: false,
        });
        const cloudShell = new THREE.Mesh(sharedSphere, venusCloudMaterial);
        cloudShell.scale.setScalar(planetRadius * 1.018);
        cloudShell.visible = false;
        axialGroup.add(cloudShell);
        specialLayers.set('venusCloud', cloudShell);
      }

      const hitArea = new THREE.Mesh(sharedSphere, new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        colorWrite: false,
        depthWrite: false,
      }));
      hitArea.scale.setScalar(planetRadius * (mathMode ? 1.65 : 1.6));
      hitArea.userData.bodyId = spec.id;
      root.add(hitArea);
      selectables.push(planet, hitArea);

      if (!mathMode) {
        (moonsByPlanet[spec.id] ?? []).forEach((moonSpec) => {
          let moonMaterial = moonMaterials.get(moonSpec.color);
          if (!moonMaterial) {
            moonMaterial = new THREE.MeshStandardMaterial({ color: moonSpec.color, roughness: .92, metalness: 0 });
            moonMaterials.set(moonSpec.color, moonMaterial);
          }
          const orbitGroup = new THREE.Group();
          const moonDistance = planetRadius * moonSpec.orbit;
          const orbitPoints = Array.from({ length: 65 }, (_, index) => {
            const angle = index / 64 * Math.PI * 2;
            return new THREE.Vector3(Math.cos(angle) * moonDistance, 0, Math.sin(angle) * moonDistance);
          });
          orbitGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(orbitPoints),
            new THREE.LineBasicMaterial({ color: 0xc5d9f3, transparent: true, opacity: .24 }),
          ));
          const moon = new THREE.Mesh(sharedSphere, moonMaterial);
          moon.scale.setScalar(planetRadius * moonSpec.size);
          moon.position.x = moonDistance;
          moon.castShadow = true;
          moon.receiveShadow = true;
          orbitGroup.add(moon);
          axialGroup.add(orbitGroup);
          moonAssemblies.push({ planetId: spec.id, orbit: orbitGroup, period: moonSpec.period });
        });
      }
    });
    const loadExternalTexture = (url: string) => new Promise<THREE.Texture>((resolve, reject) => {
      textureLoader.load(url, resolve, undefined, reject);
    });
    const clearSelectionTextures = () => {
      if (selectedTextureBody === 'sun') sunMaterial.map = basePlanetTextures.get('sun') ?? null;
      if (selectedTextureBody && selectedTextureBody !== 'sun') {
        const material = planetMaterials.get(selectedTextureBody);
        if (material) material.map = basePlanetTextures.get(selectedTextureBody) ?? null;
      }
      if (earthCloudMaterial) earthCloudMaterial.alphaMap = null;
      if (earthNightMaterial) earthNightMaterial.map = null;
      if (venusCloudMaterial) venusCloudMaterial.map = null;
      if (saturnRingMaterial) saturnRingMaterial.map = null;
      specialLayers.get('earthCloud') && (specialLayers.get('earthCloud')!.visible = false);
      specialLayers.get('earthNight') && (specialLayers.get('earthNight')!.visible = false);
      specialLayers.get('venusCloud') && (specialLayers.get('venusCloud')!.visible = false);
      moonMaterials.forEach((material) => { material.map = null; });
      loadedSelectionTextures.splice(0).forEach((texture) => texture.dispose());
      sunMaterial.needsUpdate = true;
      planetMaterials.forEach((material) => { material.needsUpdate = true; });
      if (earthCloudMaterial) earthCloudMaterial.needsUpdate = true;
      if (earthNightMaterial) earthNightMaterial.needsUpdate = true;
      if (venusCloudMaterial) venusCloudMaterial.needsUpdate = true;
      if (saturnRingMaterial) saturnRingMaterial.needsUpdate = true;
      moonMaterials.forEach((material) => { material.needsUpdate = true; });
    };
    const setSelectedTexture = async (bodyId: string, requestId: number) => {
      const resolution = window.innerWidth >= 1000 ? '4k' : '2k';
      const surfaceUrl = planetSurfaceTextureUrl(bodyId, resolution);
      if (!surfaceUrl) return;
      let surface: THREE.Texture;
      try {
        surface = await loadExternalTexture(surfaceUrl);
      } catch {
        const fallback = planetSurfaceTextureUrl(bodyId, '2k');
        if (!fallback || resolution === '2k') return;
        try {
          surface = await loadExternalTexture(fallback);
        } catch {
          return;
        }
      }
      if (disposed || requestId !== textureRequestId) {
        surface.dispose();
        return;
      }
      surface.colorSpace = THREE.SRGBColorSpace;
      surface.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const surfaceMaterial = bodyId === 'sun' ? sunMaterial : planetMaterials.get(bodyId);
      if (surfaceMaterial) {
        surfaceMaterial.map = surface;
        surfaceMaterial.needsUpdate = true;
        loadedSelectionTextures.push(surface);
      }
      const loadExtra = async (url: string, assign: (texture: THREE.Texture) => void) => {
        try {
          const texture = await loadExternalTexture(url);
          if (disposed || requestId !== textureRequestId) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          assign(texture);
          loadedSelectionTextures.push(texture);
        } catch {
          // Retain the procedural texture when an optional map is unavailable.
        }
      };
      if (bodyId === 'earth') {
        if (earthCloudMaterial) void loadExtra(planetExtraTextureUrls.earthClouds, (texture) => {
          earthCloudMaterial!.alphaMap = texture;
          earthCloudMaterial!.needsUpdate = true;
          const cloudLayer = specialLayers.get('earthCloud');
          if (cloudLayer) cloudLayer.visible = true;
        });
        if (earthNightMaterial) void loadExtra(planetExtraTextureUrls.earthNight, (texture) => {
          earthNightMaterial!.map = texture;
          earthNightMaterial!.needsUpdate = true;
          const nightLayer = specialLayers.get('earthNight');
          if (nightLayer) nightLayer.visible = true;
        });
      } else if (bodyId === 'venus' && venusCloudMaterial) {
        void loadExtra(planetExtraTextureUrls.venusClouds, (texture) => {
          venusCloudMaterial!.map = texture;
          venusCloudMaterial!.needsUpdate = true;
          const cloudLayer = specialLayers.get('venusCloud');
          if (cloudLayer) cloudLayer.visible = true;
        });
      } else if (bodyId === 'saturn' && saturnRingMaterial) {
        void loadExtra(planetExtraTextureUrls.saturnRings, (texture) => {
          saturnRingMaterial!.map = texture;
          saturnRingMaterial!.needsUpdate = true;
        });
      }
      if ((moonsByPlanet[bodyId] ?? []).length) {
        void loadExtra(planetExtraTextureUrls.moon, (texture) => {
          moonMaterials.forEach((material) => {
            material.map = texture;
            material.needsUpdate = true;
          });
        });
      }
    };
    const requestSelectedTextures = (bodyId: string | null) => {
      if (mathMode || bodyId === selectedTextureBody) return;
      textureRequestId++;
      clearSelectionTextures();
      selectedTextureBody = bodyId;
      if (bodyId) void setSelectedTexture(bodyId, textureRequestId);
    };
    const starPositions = new Float32Array((window.innerWidth < 720 ? 420 : 900) * 3);
    for (let i = 0; i < starPositions.length; i += 3) {
      starPositions[i] = (Math.random() - .5) * 50;
      starPositions[i + 1] = (Math.random() - .5) * 34;
      starPositions[i + 2] = -8 - Math.random() * 25;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starField = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xbcd8fa, size: .045, transparent: true, opacity: .78, sizeAttenuation: true }));
    scene.add(starField);

    const resize = () => {
      const width = host.clientWidth || window.innerWidth;
      const height = host.clientHeight || window.innerHeight;
      if (!mathMode) {
        const zoomRatio = zoomDistance / overviewDistance;
        overviewDistance = overviewDistanceForViewport();
        zoomDistance = overviewDistance * zoomRatio;
      }
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      labelSizes = measureLabels(labelElements);
    };
    resize();
    camera.position.setFromSpherical(spherical);
    camera.lookAt(target);
    const projectLabels = () => {
      const projectedBodies: ProjectedLabel[] = [];
      bodies.forEach((body) => {
        const label = labelElements.get(body.id);
        const root = bodyRoots.get(body.id);
        if (!label || !root) return;
        const screen = projectedPoint.copy(root.position).project(camera);
        const x = (screen.x * .5 + .5) * host.clientWidth;
        const y = (-screen.y * .5 + .5) * host.clientHeight;
        if (screen.z > -1 && screen.z < 1) {
          const distance = camera.position.distanceTo(root.position);
          const ringExtent = body.id === 'saturn' ? 2.22 : body.id === 'uranus' ? 1.73 : 1;
          const radius = body.size * planetScale * ringExtent * host.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance);
          projectedBodies.push({ id: body.id, x, y, radius });
        } else {
          label.style.opacity = '0';
          label.style.pointerEvents = 'none';
          label.tabIndex = -1;
        }
      });
      if (measuredLanguage !== languageRef.current) {
        labelSizes = measureLabels(labelElements);
        previousLabelPositions.clear();
        measuredLanguage = languageRef.current;
      }
      const placements = placeProjectedLabels(projectedBodies, labelElements, labelSizes, previousLabelPositions, host.clientWidth, host.clientHeight, selectedRef.current, mathMode, host);
      placements.forEach((position, id) => {
        const label = labelElements.get(id);
        if (!label) return;
        label.style.left = `${position.x}px`;
        label.style.top = `${position.y}px`;
        label.style.transform = 'translate(-50%, -50%)';
        label.style.opacity = mathMode || !selectedRef.current || selectedRef.current === id ? '1' : '.26';
        label.style.pointerEvents = 'auto';
        label.tabIndex = 0;
      });
    };
    const clampPan = () => {
      const boundary = selectedRef.current ? 7 : 16;
      if (panOffset.length() > boundary) panOffset.setLength(boundary);
    };
    const panByScreen = (dx: number, dy: number) => {
      if (mathMode) return;
      const distance = selectedRef.current ? spherical.radius : zoomDistance;
      const unitsPerPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(host.clientHeight, 1);
      panRight.setFromMatrixColumn(camera.matrix, 0);
      panUp.setFromMatrixColumn(camera.matrix, 1);
      panDelta.set(0, 0, 0)
        .addScaledVector(panRight, -dx * unitsPerPixel)
        .addScaledVector(panUp, dy * unitsPerPixel);
      panOffset.add(panDelta);
      clampPan();
    };
    const onDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('.science-body-label')) return;
      if (activePointers.size === 0) gestureMoved = false;
      dragMode = !mathMode && (event.button === 2 || event.shiftKey) ? 'pan' : 'rotate';
      if (dragMode === 'pan') gestureMoved = true;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size === 2) {
        gestureMoved = true;
        const [a, b] = [...activePointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = zoomDistance;
        pinchSelectedZoom = selectedZoom;
        pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      const prior = activePointers.get(event.pointerId);
      if (prior) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!prior && !dragging && event.pointerType === 'mouse') {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(selectables, false)[0]?.object;
        hoveredId = hit?.userData.bodyId ? String(hit.userData.bodyId) : null;
      }
      if (activePointers.size >= 2) {
        const [a, b] = [...activePointers.values()];
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (!mathMode && pinchCenter) panByScreen(center.x - pinchCenter.x, center.y - pinchCenter.y);
        pinchCenter = center;
        if (pinchStart > 0) {
          if (!mathMode && selectedRef.current) selectedZoom = THREE.MathUtils.clamp(pinchSelectedZoom * pinchStart / Math.max(gap, 1), .42, 2.6);
          else zoomDistance = THREE.MathUtils.clamp(pinchZoom * pinchStart / Math.max(gap, 1), 3.4, maxZoomDistance());
        }
        return;
      }
      if (!dragging || dragging.id !== event.pointerId || !prior) return;
      const dx = event.clientX - prior.x;
      const dy = event.clientY - prior.y;
      if (Math.abs(event.clientX - dragging.x) + Math.abs(event.clientY - dragging.y) > 6) {
        dragging.moved = true;
        gestureMoved = true;
      }
      if (dragMode === 'pan') panByScreen(dx, dy);
      else {
        desiredTheta -= dx * .005;
        desiredPhi = THREE.MathUtils.clamp(desiredPhi + dy * .005, .12, Math.PI - .12);
      }
    };
    const onUp = (event: PointerEvent) => {
      const wasDrag = gestureMoved || (dragging?.moved ?? false);
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) {
        pinchStart = 0;
        pinchCenter = null;
      }
      if (dragging?.id === event.pointerId) dragging = null;
      if (wasDrag) {
        if (activePointers.size === 0) gestureMoved = false;
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(selectables, false)[0]?.object;
      if (hit?.userData.bodyId) onSelectRef.current(String(hit.userData.bodyId));
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!mathMode && selectedRef.current) selectedZoom = THREE.MathUtils.clamp(selectedZoom * Math.exp(event.deltaY * .001), .42, 2.6);
      else zoomDistance = THREE.MathUtils.clamp(zoomDistance + event.deltaY * .015, 3.4, maxZoomDistance());
    };
    const onLeave = () => { hoveredId = null; };
    const onContextMenu = (event: Event) => event.preventDefault();
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('pointerleave', onLeave);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    const frame = (time: number) => {
      if (disposed || document.hidden) return;
      const delta = previous ? Math.min((time - previous) / 1000, .08) : 0;
      previous = time;
      const centuries = (Date.now() - epoch) / CENTURY_MS;
      const selected = mathMode ? null : selectedRef.current;
      if (selected !== activeSceneSelection) {
        activeSceneSelection = selected;
        if (!mathMode) {
          selectedZoom = 1;
          panOffset.set(0, 0, 0);
          requestSelectedTextures(selected);
        }
      }
      planets.forEach((spec) => {
        const root = bodyRoots.get(spec.id)!;
        if (!mathMode && selectedRef.current === spec.id) {
          if (!frozen.has(spec.id)) frozen.set(spec.id, root.position.clone());
          const progress = Math.min(1, (slowProgress.get(spec.id) ?? 0) + delta / .85);
          slowProgress.set(spec.id, progress);
          const eased = progress * progress * (3 - 2 * progress);
          root.position.copy(positionFor(spec, centuries).multiplyScalar(orbitScale)).lerp(frozen.get(spec.id)!, eased);
        } else {
          frozen.delete(spec.id);
          slowProgress.delete(spec.id);
          root.position.copy(positionFor(spec, centuries).multiplyScalar(orbitScale));
        }
        const spin = spinGroups.get(spec.id);
        if (spin && !reduced) {
          spin.rotation.y += mathMode
            ? spec.rotation * delta
            : (2 * Math.PI / Math.abs(rotationPeriod[spec.id] ?? 30)) * Math.sign(rotationPeriod[spec.id] ?? 1) * delta;
        }
      });
      const sunSpin = spinGroups.get('sun');
      if (sunSpin && !mathMode && !reduced) sunSpin.rotation.y += (2 * Math.PI / rotationPeriod.sun) * delta;
      if (!reduced) {
        const earthCloud = specialLayers.get('earthCloud');
        const venusCloud = specialLayers.get('venusCloud');
        if (earthCloud) earthCloud.rotation.y += delta * .018;
        if (venusCloud) venusCloud.rotation.y += delta * .012;
      }
      moonAssemblies.forEach(({ orbit, period }) => {
        if (!reduced) orbit.rotation.y += (2 * Math.PI / period) * delta;
      });
      const sunPulse = reduced ? 1.3 : 1.3 + Math.sin(time * .0012) * .08;
      if (!mathMode) sunMaterial.emissiveIntensity = selected === 'sun' ? sunPulse + .35 : sunPulse;
      if (selected) {
        const selectedRoot = bodyRoots.get(selected);
        if (selectedRoot) desiredTarget.copy(selectedRoot.position);
      } else desiredTarget.set(0, 0, 0);
      desiredTarget.add(panOffset);
      target.lerp(desiredTarget, reduced ? .16 : .075);
      const focusBody = bodies.find((body) => body.id === selected);
      const focusExtent = focusBody
        ? focusBody.size * planetScale * (focusBody.id === 'saturn' ? 2.22 : focusBody.id === 'uranus' ? 1.73 : 1)
        : 1;
      const viewAspect = (host.clientWidth || window.innerWidth) / Math.max(host.clientHeight || window.innerHeight, 1);
      const focusDistance = focusBody
        ? mathMode
          ? Math.max(1.2, focusBody.size * planetScale * 4.8)
          : Math.max(1.1, focusExtent / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(viewAspect, .3) * .34))
        : overviewDistance;
      desiredDistance = focusBody ? focusDistance * (mathMode ? 1 : selectedZoom) : zoomDistance;
      spherical.theta = THREE.MathUtils.damp(spherical.theta, desiredTheta, 12, delta);
      spherical.phi = THREE.MathUtils.damp(spherical.phi, desiredPhi, 12, delta);
      spherical.radius = THREE.MathUtils.lerp(spherical.radius, desiredDistance, reduced ? .18 : .065);
      cameraOffset.setFromSpherical(spherical);
      camera.position.copy(target).add(cameraOffset);
      if (selected && !mathMode) {
        cameraDirection.copy(target).sub(camera.position).normalize();
        screenUp.set(0, 1, 0).projectOnPlane(cameraDirection).normalize();
        lookAtTarget.copy(target).addScaledVector(screenUp, -spherical.radius * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .24);
      } else lookAtTarget.copy(target);
      camera.lookAt(lookAtTarget);
      meshes.forEach((mesh, id) => {
        const material = mesh.material as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial;
        const opacity = !mathMode && selected && selected !== id ? .17 : 1;
        material.opacity = THREE.MathUtils.lerp(material.opacity, opacity, .07);
        if (material instanceof THREE.MeshPhongMaterial) {
          material.emissive.setHex(selected === id ? 0x182331 : hoveredId === id ? 0x101820 : 0x000000);
          material.emissiveIntensity = selected === id ? .5 : hoveredId === id ? .3 : 0;
        }
      });
      if (selected === 'earth') nightSunDirection.copy(bodyRoots.get('earth')!.position).multiplyScalar(-1).normalize();
      if (!reduced) starField.rotation.z = Math.sin(time * .00004) * .004;
      renderer.render(scene, camera);
      projectLabels();
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else { previous = 0; raf = requestAnimationFrame(frame); }
    };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      textureRequestId++;
      clearSelectionTextures();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if ('map' in material && material.map) material.map.dispose();
            if ('alphaMap' in material && material.alphaMap) material.alphaMap.dispose();
            if ('bumpMap' in material && material.bumpMap) material.bumpMap.dispose();
            material.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const labelsLayer = (
    <div
      className={`science-body-labels${mathMode ? ` math-body-labels${showMathLabels ? '' : ' is-hidden'}` : ''}`}
      aria-label={t.science.selectBody}
      dir={direction}
      lang={language}
    >
      {bodies.map((body) => (
        <button
          className={`science-body-label${selectedId === body.id ? ' is-selected' : ''}`}
          key={body.id}
          type="button"
          data-body-label={body.id}
          data-testid={`button-select-${body.id}`}
          aria-label={`${t.science.explore(t.science.names[body.id])}`}
          aria-pressed={selectedId === body.id}
          onClick={() => onSelect(body.id)}
        >
          <i style={{ '--body-color': `#${body.color.toString(16).padStart(6, '0')}` } as CSSProperties} />
          {t.science.names[body.id]}
        </button>
      ))}
    </div>
  );

  return (
      <div className={`science-scene${webglFailed ? ' is-fallback' : ''}${mathMode ? ' math-planet-scene' : ''}`} ref={hostRef} data-testid="science-solar-scene">
      {webglFailed && <ScienceCanvasFallback host={hostRef.current} selectedId={selectedId} onSelect={onSelect} mathMode={mathMode} />}
      {mathMode ? createPortal(labelsLayer, document.body) : labelsLayer}
      {webglFailed && !selectedId && (
        <div className="science-fallback-selector" role="group" aria-label={t.science.selectWorld} data-testid="science-fallback-selector">
          {bodies.map((body) => (
            <button key={body.id} type="button" onClick={() => onSelect(body.id)} data-testid={`button-fallback-select-${body.id}`} aria-label={`${t.science.selectWorld}: ${t.science.names[body.id]}`}>
              <i style={{ '--body-color': `#${body.color.toString(16).padStart(6, '0')}` } as CSSProperties} />
              {t.science.names[body.id]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SciencePage() {
  const { language, direction, t } = useLanguage();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const body = useMemo(() => bodies.find((item) => item.id === selectedId) ?? null, [selectedId]);
  const [videoLanguageOverride, setVideoLanguageOverride] = useState<{ planetId: PlanetId; language: Language } | null>(null);
  const [playingSoundId, setPlayingSoundId] = useState<PlanetId | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const planetAudio: Record<PlanetId, string> = {
    sun: 'sun.mp3',
    mercury: 'mercury.mp3',
    venus: 'venus.mp3',
    earth: 'earth.mp3',
    mars: 'mars.mp3',
    jupiter: 'jupiter.mp3',
    saturn: 'saturn.mp3',
    uranus: 'uranus.mp3',
    neptune: 'neptune.mp3',
  };
  const stopPlanetSound = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
    }
    setPlayingSoundId(null);
  };
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    const ended = () => setPlayingSoundId(null);
    audio.addEventListener('ended', ended);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeEventListener('ended', ended);
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, []);
  useEffect(() => {
    stopPlanetSound();
  }, [language]);
  useEffect(() => {
    if (!selectedId) stopPlanetSound();
  }, [selectedId]);
  const videoLanguage = videoLanguageOverride && body && videoLanguageOverride.planetId === body.id
    ? videoLanguageOverride.language
    : language;
  const videoUrl = body ? videos[body.id].science[videoLanguage] : '';
  const togglePlanetSound = () => {
    if (!body) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (playingSoundId === body.id) {
      stopPlanetSound();
      return;
    }
    stopPlanetSound();
    audio.src = new URL(`${import.meta.env.BASE_URL}audio/${planetAudio[body.id]}`, window.location.origin).href;
    void audio.play().then(() => setPlayingSoundId(body.id)).catch(() => setPlayingSoundId(null));
  };
  const selectBody = (id: string) => {
    if (id !== selectedId) {
      setVideoLanguageOverride(null);
      stopPlanetSound();
    }
    setSelectedId(id);
  };
  const bodyFacts = body ? t.science.factsByPlanet[body.id] : null;
  return (
    <main className="science-page" dir={direction} lang={language} data-testid="page-science">
       <ScienceScene selectedId={selectedId} onSelect={selectBody} />
      <div className="science-hint" data-testid="science-hint"><span className="science-hint-pulse" />{t.science.hint}</div>
      <div className="science-instruction" aria-hidden="true"><RotateCcw size={14} /> {t.science.drag}</div>
      {!selectedId && (
        <div className="science-overview-note" data-testid="science-overview-copy">
          <span>{t.science.overviewKicker}</span>
          <strong>{t.science.overviewTitle}</strong>
          <small>{t.science.overviewHint}</small>
        </div>
      )}
      {selectedId && body && bodyFacts && (
        <section className="science-detail" aria-labelledby="science-body-title" data-testid="science-detail-panel">
          <div className="science-detail-heading">
            <h1 id="science-body-title" data-testid="science-body-title">{t.science.names[body.id]}</h1>
              <div className="science-detail-actions">
                <button
                  type="button"
                  className="science-sound-toggle"
                  onClick={togglePlanetSound}
                  aria-label={playingSoundId === body.id ? t.science.stopSound : t.science.playSound}
                  aria-pressed={playingSoundId === body.id}
                  data-testid="button-planet-sound"
                >
                  {playingSoundId === body.id ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <button type="button" className="science-return" onClick={() => { stopPlanetSound(); setVideoLanguageOverride(null); setSelectedId(null); }} data-testid="button-science-return">
                  {direction === 'rtl' ? <ArrowDownLeft size={15} /> : <ArrowDownRight size={15} />} {t.science.back}
                </button>
              </div>
          </div>
          <VideoLanguageToggle
            language={videoLanguage}
            onChange={(nextLanguage) => body && setVideoLanguageOverride({ planetId: body.id, language: nextLanguage })}
            label={t.video.language}
            arabicLabel={t.video.arabic}
            englishLabel={t.video.english}
          />
          <div className="science-video" data-testid="science-video-region">
            <LocalizedVideo
              key={`${body.id}-${videoLanguage}-${videoUrl}`}
              raw={videoUrl}
              title={t.science.videoTitle(t.science.names[body.id])}
              emptyLabel={t.science.emptyVideo}
              placeholderClassName="science-video-empty"
              mediaClassName="science-video-media"
              testId="science-video-player"
            />
          </div>
          <div className="science-facts" aria-label={t.science.facts(t.science.names[body.id])} data-testid="science-facts">
            <div><span>{t.science.distance}</span><strong>{bodyFacts.distance}</strong></div>
            <div><span>{t.science.dayLength}</span><strong>{bodyFacts.day}</strong></div>
            <div><span>{t.science.moons}</span><strong>{bodyFacts.moons}</strong></div>
          </div>
        </section>
      )}
      <div className="science-scale" dir="ltr" data-testid="science-model-caption">{t.science.modelCaption}</div>
    </main>
  );
}
