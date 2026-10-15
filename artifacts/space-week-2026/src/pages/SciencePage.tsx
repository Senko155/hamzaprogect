import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { ArrowDownLeft, ArrowDownRight, RotateCcw } from 'lucide-react';
import { canCreateWebGLContext } from '@/lib/webgl';
import { CENTURY_MS, J2000_EPOCH, orbitalPoint, planets, positionFor } from '@/components/solar-system-model';
import { makeMathPlanetTexture, makeSunSurfaceTexture } from '@/components/math-planet-textures';
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
  texture: HTMLCanvasElement | undefined,
) {
  const distance = Math.hypot(sunX - x, sunY - y) || 1;
  const lightX = (sunX - x) / distance;
  const lightY = (sunY - y) / distance;
  context.save();
  context.shadowBlur = 0;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = id === 'earth' ? '#1d5b79' : id === 'uranus' ? '#82d7d6' : id === 'neptune' ? '#2347b2' : '#bd8060';
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  if (texture) context.drawImage(texture, x - radius, y - radius, radius * 2, radius * 2);

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

function ScienceCanvasFallback({ host, selectedId, onSelect, mathMode }: { host: HTMLDivElement | null; selectedId: string | null; onSelect: (id: string) => void; mathMode: boolean }) {
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
    let zoom = 1;
    let gesture: { id: number; x: number; y: number; moved: boolean } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let pinchZoom = 1;
    let lastPositions = new Map<string, { x: number; y: number; radius: number }>();
    const planetTextures = new Map<string, THREE.CanvasTexture>(
      mathMode ? [] : planets.map((planet) => [planet.id, makeMathPlanetTexture(planet.id)]),
    );
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
    const rotate = (x: number, y: number) => ({
      x: x * Math.cos(angle) - y * Math.sin(angle),
      y: x * Math.sin(angle) + y * Math.cos(angle),
    });
    const down = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = zoom;
      }
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: pointers.size > 1 };
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (previous) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size > 1) {
        const [a, b] = [...pointers.values()];
        const current = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDistance) zoom = THREE.MathUtils.clamp(pinchZoom * current / pinchDistance, .55, 22);
        if (gesture) gesture.moved = true;
        return;
      }
      if (!previous || !gesture || gesture.id !== event.pointerId) return;
      if (Math.abs(event.clientX - gesture.x) + Math.abs(event.clientY - gesture.y) > 5) gesture.moved = true;
      angle += (event.clientX - previous.x) * .006;
    };
    const up = (event: PointerEvent) => {
      const moved = gesture?.moved ?? false;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchDistance = 0;
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
    const draw = (time: number) => {
      if (disposed || document.hidden) return;
      const selected = mathMode ? null : selectedRef.current;
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
          ? THREE.MathUtils.clamp(.18 * Math.min(width, height) / (baseRadius * zoom), 3, 60)
          : 1;
        transitionToX = selected ? width < 760 ? .53 : .62 : .5;
        transitionToY = selected ? width < 760 ? .39 : .49 : .52;
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
      const planetScale = 1.3;
      const orbitScale = mathMode ? 1.28 : 1;
      const scale = Math.min(width / (mathMode ? 31 : 22), height / (mathMode ? 29 : 23)) * .87;
      const cameraScale = scale * zoom * cameraZoom;
      const centerX = width * centerXRatio;
      const centerY = height * centerYRatio;
      const rotatedFocus = rotate(viewFocus.x, viewFocus.y);
      const transform = (point: THREE.Vector3) => {
        const p = rotate(point.x, point.y);
        return {
          x: centerX + (p.x - rotatedFocus.x) * cameraScale,
          y: centerY - (p.y - rotatedFocus.y) * cameraScale,
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
          const p = transform(orbitalPoint(spec, step / 120 * Math.PI * 2, 0).multiplyScalar(orbitScale));
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
      lastPositions = new Map([['sun', { ...sunPoint, radius: sunRadius }]]);
      planets.forEach((spec) => {
        const worldPosition = !mathMode && frozenPlanetId === spec.id && selected === spec.id
          ? frozenPlanetPosition
          : positionFor(spec, centuries).multiplyScalar(orbitScale);
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
        else drawSciencePlanet(context, point.x, point.y, radius, spec.id, sunPoint.x, sunPoint.y, planetTextures.get(spec.id)?.image as HTMLCanvasElement | undefined);
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
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      planetTextures.forEach((texture) => texture.dispose());
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
    const projectedPoint = new THREE.Vector3();
    const planetScale = 1.3;
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
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const selectables: THREE.Object3D[] = [];
    const meshes = new Map<string, THREE.Mesh>();
    const frozen = new Map<string, THREE.Vector3>();
    const slowProgress = new Map<string, number>();
    const epoch = J2000_EPOCH;
    let desiredDistance = overviewDistance;
    let zoomDistance = overviewDistance;
    const maxZoomDistance = () => mathMode ? 60 : Math.max(60, overviewDistance * 1.8);
    let dragging: { id: number; x: number; y: number; moved: boolean } | null = null;
    let gestureMoved = false;
    const activePointers = new Map<number, { x: number; y: number }>();
    let hoveredId: string | null = null;
    let pinchStart = 0;
    let pinchZoom = overviewDistance;
    let raf = 0;
    let previous = 0;
    let disposed = false;
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

    scene.add(new THREE.AmbientLight(0x9cb3d4, mathMode ? .55 : .48));
    scene.add(new THREE.PointLight(0xffd39a, 65, 65, 1.7));
    const sunRadius = .78 * planetScale;
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(sunRadius, 32, 24),
      new THREE.MeshStandardMaterial({
        map: mathMode ? undefined : makeSunSurfaceTexture(),
        color: mathMode ? 0xffc17b : 0xffffff,
        emissive: 0xff762b,
        emissiveIntensity: mathMode ? 2.3 : 1.8,
        roughness: .35,
      }),
    );
    sun.userData.bodyId = 'sun';
    scene.add(sun);
    meshes.set('sun', sun);
    selectables.push(sun);
    const sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(sunRadius * (mathMode ? 1.26 : 1.42), 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffa65d, transparent: true, opacity: mathMode ? .18 : .2, side: THREE.BackSide }),
    );
    scene.add(sunHalo);
    if (!mathMode) {
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(sunRadius * 1.95, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xff7c3a, transparent: true, opacity: .055, side: THREE.BackSide, depthWrite: false }),
      ));
    }

    planets.forEach((spec) => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) points.push(orbitalPoint(spec, i / 128 * Math.PI * 2, 0).multiplyScalar(orbitScale));
      const orbit = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: spec.id === 'earth' ? 0x4ea8df : 0x8295bd, transparent: true, opacity: spec.id === 'earth' ? .28 : .14 }),
      );
      scene.add(orbit);
      const planetRadius = spec.size * planetScale;
      const planet = new THREE.Mesh(
        new THREE.SphereGeometry(planetRadius, 28, 22),
        new THREE.MeshStandardMaterial({
          map: makeMathPlanetTexture(spec.id),
          color: 0xffffff,
          emissive: mathMode ? 0x000000 : spec.color,
          emissiveIntensity: mathMode ? .06 : .02,
          roughness: .82,
          transparent: true,
          opacity: 1,
        }),
      );
      planet.userData.bodyId = spec.id;
      if (spec.id === 'saturn') {
        if (mathMode) {
          [
            { inner: 1.18, outer: 1.38, color: 0xeee0ba, opacity: .52 },
            { inner: 1.41, outer: 1.72, color: 0xcbb787, opacity: .72 },
            { inner: 1.76, outer: 1.88, color: 0x8d7959, opacity: .42 },
            { inner: 1.94, outer: 2.18, color: 0xe6d5aa, opacity: .65 },
          ].forEach(({ inner, outer, color, opacity }) => {
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(inner, outer, 72),
              new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
            );
            ring.scale.set(planetRadius, planetRadius, 1);
            ring.rotation.x = Math.PI * .31;
            planet.add(ring);
          });
        } else {
          [
            { inner: 1.12, outer: 1.3, color: 0x9f8b68, opacity: .4 },
            { inner: 1.34, outer: 1.72, color: 0xd8c39a, opacity: .62 },
            { inner: 1.78, outer: 1.86, color: 0x7d6a4c, opacity: .22 },
            { inner: 1.92, outer: 2.18, color: 0xe7d6b1, opacity: .58 },
          ].forEach(({ inner, outer, color, opacity }) => {
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(inner, outer, 72),
              new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
            );
            ring.scale.set(planetRadius, planetRadius, 1);
            ring.rotation.x = Math.PI * .31;
            planet.add(ring);
          });
        }
      }
      if (spec.id === 'uranus') {
        // Uranus's spin axis is tipped almost sideways; its narrow rings share that axial tilt.
        planet.rotation.x = THREE.MathUtils.degToRad(98);
        const uranusBands = [
          { inner: 1.2, outer: 1.29, color: 0x7899a4, opacity: .2 },
          { inner: 1.36, outer: 1.4, color: 0x9ab8c0, opacity: .13 },
          { inner: 1.47, outer: 1.58, color: 0x657e8b, opacity: .18 },
          { inner: 1.68, outer: 1.73, color: 0xacc3c6, opacity: .1 },
        ];
        uranusBands.forEach(({ inner, outer, color, opacity }) => {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(inner, outer, 56),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
          );
          ring.scale.set(mathMode ? spec.size : planetRadius, mathMode ? spec.size : planetRadius, 1);
          planet.add(ring);
        });
      }
      scene.add(planet);
      meshes.set(spec.id, planet);
      selectables.push(planet);
      const hitArea = new THREE.Mesh(
        new THREE.SphereGeometry(planetRadius * (mathMode ? 1.65 : 1.8), 12, 10),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false }),
      );
      hitArea.userData.bodyId = spec.id;
      planet.add(hitArea);
      selectables.push(hitArea);
    });
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
        const mesh = meshes.get(body.id);
        if (!label || !mesh) return;
        const screen = projectedPoint.copy(mesh.position).project(camera);
        const x = (screen.x * .5 + .5) * host.clientWidth;
        const y = (-screen.y * .5 + .5) * host.clientHeight;
        if (screen.z > -1 && screen.z < 1) {
          const distance = camera.position.distanceTo(mesh.position);
          const radius = body.size * planetScale * host.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance);
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
    const onDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('.science-body-label')) return;
      if (activePointers.size === 0) gestureMoved = false;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size === 2) {
        gestureMoved = true;
        const [a, b] = [...activePointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = zoomDistance;
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
        if (pinchStart > 0) zoomDistance = THREE.MathUtils.clamp(pinchZoom * pinchStart / Math.max(gap, 1), 3.4, maxZoomDistance());
        return;
      }
      if (!dragging || dragging.id !== event.pointerId || !prior) return;
      const dx = event.clientX - prior.x;
      const dy = event.clientY - prior.y;
      if (Math.abs(event.clientX - dragging.x) + Math.abs(event.clientY - dragging.y) > 6) {
        dragging.moved = true;
        gestureMoved = true;
      }
      spherical.theta -= dx * .005;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + dy * .005, .18, Math.PI - .18);
    };
    const onUp = (event: PointerEvent) => {
      const wasDrag = gestureMoved || (dragging?.moved ?? false);
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) pinchStart = 0;
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
      zoomDistance = THREE.MathUtils.clamp(zoomDistance + event.deltaY * .015, 3.4, maxZoomDistance());
    };
    const onLeave = () => { hoveredId = null; };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('pointerleave', onLeave);

    const frame = (time: number) => {
      if (disposed || document.hidden) return;
      const delta = previous ? Math.min((time - previous) / 1000, .08) : 0;
      previous = time;
      const centuries = (Date.now() - epoch) / CENTURY_MS;
      planets.forEach((spec) => {
        const mesh = meshes.get(spec.id)!;
        if (!mathMode && selectedRef.current === spec.id) {
          if (!frozen.has(spec.id)) frozen.set(spec.id, mesh.position.clone());
          const progress = Math.min(1, (slowProgress.get(spec.id) ?? 0) + delta / .85);
          slowProgress.set(spec.id, progress);
          const eased = progress * progress * (3 - 2 * progress);
          mesh.position.copy(positionFor(spec, centuries).multiplyScalar(orbitScale)).lerp(frozen.get(spec.id)!, eased);
        } else {
          frozen.delete(spec.id);
          slowProgress.delete(spec.id);
          mesh.position.copy(positionFor(spec, centuries).multiplyScalar(orbitScale));
        }
        if (spec.id !== 'uranus') mesh.rotation.y += reduced ? 0 : spec.rotation * delta;
      });
      const selected = mathMode ? null : selectedRef.current;
      if (selected) {
        const selectedMesh = meshes.get(selected);
        if (selectedMesh) desiredTarget.copy(selectedMesh.position);
      } else desiredTarget.set(0, 0, 0);
      target.lerp(desiredTarget, reduced ? .16 : .075);
      const focusBody = bodies.find((body) => body.id === selected);
      const focusDistance = focusBody ? Math.max(1.2, focusBody.size * (mathMode ? planetScale : 1) * 4.8) : overviewDistance;
      desiredDistance = focusBody ? focusDistance : zoomDistance;
      spherical.radius = THREE.MathUtils.lerp(spherical.radius, desiredDistance, reduced ? .18 : .065);
      cameraOffset.setFromSpherical(spherical);
      camera.position.copy(target).add(cameraOffset);
      camera.lookAt(target);
      meshes.forEach((mesh, id) => {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const opacity = !mathMode && selected && selected !== id ? .17 : 1;
        material.opacity = THREE.MathUtils.lerp(material.opacity, opacity, .07);
        material.emissiveIntensity = id === 'sun'
          ? selectedRef.current === id ? 2.35 : hoveredId === id ? 2.05 : mathMode ? 2.1 : 1.8
          : mathMode && selectedRef.current === id ? .18 : !mathMode && selected === id ? .48 : hoveredId === id ? .32 : .06;
      });
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
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => { if ('map' in material && material.map) material.map.dispose(); material.dispose(); });
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
  const videoLanguage = videoLanguageOverride && body && videoLanguageOverride.planetId === body.id
    ? videoLanguageOverride.language
    : language;
  const videoUrl = body ? videos[body.id].science[videoLanguage] : '';
  const selectBody = (id: string) => {
    if (id !== selectedId) setVideoLanguageOverride(null);
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
             <button type="button" className="science-return" onClick={() => { setVideoLanguageOverride(null); setSelectedId(null); }} data-testid="button-science-return">
              {direction === 'rtl' ? <ArrowDownLeft size={15} /> : <ArrowDownRight size={15} />} {t.science.back}
            </button>
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
