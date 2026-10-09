import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { ArrowDownLeft, CirclePlay, RotateCcw, Sparkles } from 'lucide-react';
import { canCreateWebGLContext } from '@/lib/webgl';
import { CENTURY_MS, J2000_EPOCH, orbitalPoint, planets, positionFor } from '@/components/solar-system-model';
import LogoFooter from '@/components/LogoFooter';

type Body = { id: string; name: string; color: number; size: number };
const videos = (window as Window & { SCIENCE_WEEK_VIDEOS?: Record<string, string> }).SCIENCE_WEEK_VIDEOS ?? {};
const bodies: Body[] = [
  { id: 'sun', name: 'الشمس', color: 0xffb96b, size: .78 },
  ...planets.map(({ id, name, color, size }) => ({ id, name, color, size })),
];
const facts: Record<string, { distance: string; day: string; moons: string }> = {
  sun: { distance: '—', day: 'نحو 27 يومًا', moons: '0' },
  mercury: { distance: '57.9 مليون كم', day: '58.6 يومًا أرضيًا', moons: '0' },
  venus: { distance: '108.2 مليون كم', day: '243 يومًا أرضيًا', moons: '0' },
  earth: { distance: '149.6 مليون كم', day: '23 ساعة و56 دقيقة', moons: '1' },
  mars: { distance: '227.9 مليون كم', day: '24 ساعة و37 دقيقة', moons: '2' },
  jupiter: { distance: '778.6 مليون كم', day: '9 ساعات و56 دقيقة', moons: '101' },
  saturn: { distance: '1.43 مليار كم', day: '10 ساعات و33 دقيقة', moons: '293' },
  uranus: { distance: '2.87 مليار كم', day: '17 ساعة و14 دقيقة', moons: '29' },
  neptune: { distance: '4.50 مليار كم', day: '16 ساعة و6 دقائق', moons: '16' },
};

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
) {
  const placements = new Map<string, { x: number; y: number }>();
  const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
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
    for (const ring of [1, 1.55, 2.15, 2.85]) {
      for (let index = 0; index < 8; index++) {
        const angle = -Math.PI / 2 + index * Math.PI / 4;
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
        occupied.forEach((other) => {
          const overlapX = Math.max(0, (rect.width + other.width) / 2 + 5 - Math.abs(rect.x - other.x));
          const overlapY = Math.max(0, (rect.height + other.height) / 2 + 5 - Math.abs(rect.y - other.y));
          overlapPenalty += overlapX * overlapY;
        });
        const oldPenalty = old ? Math.hypot(x - old.x, y - old.y) * .22 : 0;
        const distancePenalty = Math.hypot(x - body.x, y - body.y) + oldPenalty;
        const score = distancePenalty + overlapPenalty * 1000;
        if (!best || score < best.score) best = { x, y, score };
      }
      if (best && best.score < 1200) break;
    }
    if (!best) return;
    const position = { x: best.x, y: best.y };
    previous.set(body.id, position);
    placements.set(body.id, position);
    occupied.push({ ...position, width: size.width, height: size.height });
  });
  return placements;
}

function videoSource(raw: string): { kind: 'youtube' | 'mp4'; src: string } | null {
  if (!raw.trim()) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.hostname.includes('youtube.com') || url.hostname === 'youtu.be' || url.hostname.endsWith('.youtube-nocookie.com')) {
      const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
      return id ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    return { kind: 'mp4', src: url.href };
  } catch {
    return { kind: 'mp4', src: raw };
  }
}

function ScienceCanvasFallback({ host, selectedId, onSelect }: { host: HTMLDivElement | null; selectedId: string | null; onSelect: (id: string) => void }) {
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
    const labels = new Map(bodies.map((body) => [body.id, host.querySelector<HTMLButtonElement>(`[data-body-label="${body.id}"]`)] as const));
    let labelSizes = measureLabels(labels);
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
      const selected = selectedRef.current;
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
      const scale = Math.min(width / 22, height / 23) * .87;
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
          const p = transform(orbitalPoint(spec, step / 120 * Math.PI * 2, 0));
          if (step === 0) context.moveTo(p.x, p.y);
          else context.lineTo(p.x, p.y);
        }
        context.closePath();
        context.stroke();
        context.globalAlpha = 1;
      });
      const sunPoint = transform(new THREE.Vector3());
      const sunRadius = Math.max(6, .78 * scale * .3) * zoom * cameraZoom;
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
        const worldPosition = frozenPlanetId === spec.id && selected === spec.id
          ? frozenPlanetPosition
          : positionFor(spec, centuries);
        const point = transform(worldPosition);
        const radius = Math.max(3.2, spec.size * scale * .3) * zoom * cameraZoom;
        context.globalAlpha = opacityFor(spec.id);
        if (spec.id === 'saturn') {
          context.save();
          context.translate(point.x, point.y);
          context.rotate(-.22 + angle);
          context.beginPath();
          context.ellipse(0, 0, radius * 1.9, radius * .62, 0, 0, Math.PI * 2);
          context.strokeStyle = '#e5d2a6';
          context.lineWidth = Math.max(1.5, radius * .24);
          context.stroke();
          context.restore();
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
        context.shadowBlur = 0;
        lastPositions.set(spec.id, { ...point, radius });
      });
      context.globalAlpha = 1;
      const projectedBodies: ProjectedLabel[] = bodies.flatMap((body) => {
        const point = lastPositions.get(body.id);
        return point ? [{ id: body.id, ...point }] : [];
      });
      const placements = placeProjectedLabels(projectedBodies, labels, labelSizes, previousLabelPositions, width, height, selected);
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
    };
  }, [host]);
  return <canvas ref={canvasRef} className="science-fallback-canvas" aria-hidden="true" />;
}

function ScienceScene({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;

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
    const overviewDistance = window.innerWidth < 760 ? 56 : 28;
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
    renderer.domElement.setAttribute('aria-label', 'نموذج تفاعلي للشمس والكواكب؛ استخدم الأزرار المسماة لاستكشاف الأجرام');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.dataset.testid = 'science-solar-canvas';
    host.appendChild(renderer.domElement);
    const labelElements = new Map(bodies.map((body) => [body.id, host.querySelector<HTMLButtonElement>(`[data-body-label="${body.id}"]`)] as const));
    let labelSizes = measureLabels(labelElements);
    const previousLabelPositions = new Map<string, { x: number; y: number }>();

    scene.add(new THREE.AmbientLight(0x9cb3d4, 1.15));
    scene.add(new THREE.PointLight(0xffd39a, 65, 65, 1.7));
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(.78, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xffc17b, emissive: 0xff762b, emissiveIntensity: 1.8, roughness: .35 }),
    );
    sun.userData.bodyId = 'sun';
    scene.add(sun);
    meshes.set('sun', sun);
    selectables.push(sun);
    const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(.98, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffa65d, transparent: true, opacity: .18, side: THREE.BackSide }));
    scene.add(sunHalo);

    const saturnRingGeometry = new THREE.RingGeometry(1.18, 1.62, 48);
    planets.forEach((spec) => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) points.push(orbitalPoint(spec, i / 128 * Math.PI * 2, 0));
      const orbit = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: spec.id === 'earth' ? 0x4ea8df : 0x8295bd, transparent: true, opacity: spec.id === 'earth' ? .28 : .14 }),
      );
      scene.add(orbit);
      const planet = new THREE.Mesh(
        new THREE.SphereGeometry(spec.size, 22, 16),
        new THREE.MeshStandardMaterial({
          color: spec.color,
          emissive: spec.color,
          emissiveIntensity: .06,
          roughness: .82,
          transparent: true,
          opacity: 1,
        }),
      );
      planet.userData.bodyId = spec.id;
      if (spec.id === 'saturn') {
        const ring = new THREE.Mesh(saturnRingGeometry, new THREE.MeshBasicMaterial({ color: 0xd4c19a, transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }));
        ring.scale.set(spec.size, spec.size, 1);
        ring.rotation.x = Math.PI * .31;
        planet.add(ring);
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
          ring.scale.set(spec.size, spec.size, 1);
          planet.add(ring);
        });
      }
      scene.add(planet);
      meshes.set(spec.id, planet);
      selectables.push(planet);
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
          const radius = body.size * host.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance);
          projectedBodies.push({ id: body.id, x, y, radius });
        } else {
          label.style.opacity = '0';
          label.style.pointerEvents = 'none';
          label.tabIndex = -1;
        }
      });
      const placements = placeProjectedLabels(projectedBodies, labelElements, labelSizes, previousLabelPositions, host.clientWidth, host.clientHeight, selectedRef.current);
      placements.forEach((position, id) => {
        const label = labelElements.get(id);
        if (!label) return;
        label.style.left = `${position.x}px`;
        label.style.top = `${position.y}px`;
        label.style.transform = 'translate(-50%, -50%)';
        label.style.opacity = selectedRef.current && selectedRef.current !== id ? '.26' : '1';
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
        if (pinchStart > 0) zoomDistance = THREE.MathUtils.clamp(pinchZoom * pinchStart / Math.max(gap, 1), 3.4, 60);
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
      zoomDistance = THREE.MathUtils.clamp(zoomDistance + event.deltaY * .015, 3.4, 60);
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
        if (selectedRef.current === spec.id) {
          if (!frozen.has(spec.id)) frozen.set(spec.id, mesh.position.clone());
          const progress = Math.min(1, (slowProgress.get(spec.id) ?? 0) + delta / .85);
          slowProgress.set(spec.id, progress);
          const eased = progress * progress * (3 - 2 * progress);
          mesh.position.copy(positionFor(spec, centuries)).lerp(frozen.get(spec.id)!, eased);
        } else {
          frozen.delete(spec.id);
          slowProgress.delete(spec.id);
          mesh.position.copy(positionFor(spec, centuries));
        }
        if (spec.id !== 'uranus') mesh.rotation.y += reduced ? 0 : spec.rotation * delta;
      });
      const selected = selectedRef.current;
      if (selected) {
        const selectedMesh = meshes.get(selected);
        if (selectedMesh) desiredTarget.copy(selectedMesh.position);
      } else desiredTarget.set(0, 0, 0);
      target.lerp(desiredTarget, reduced ? .16 : .075);
      const focusBody = bodies.find((body) => body.id === selected);
      const focusDistance = focusBody ? Math.max(1.2, focusBody.size * 4.8) : 28;
      desiredDistance = focusBody ? focusDistance : zoomDistance;
      spherical.radius = THREE.MathUtils.lerp(spherical.radius, desiredDistance, reduced ? .18 : .065);
      cameraOffset.setFromSpherical(spherical);
      camera.position.copy(target).add(cameraOffset);
      camera.lookAt(target);
      meshes.forEach((mesh, id) => {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const opacity = selected && selected !== id ? .17 : 1;
        material.opacity = THREE.MathUtils.lerp(material.opacity, opacity, .07);
        material.emissiveIntensity = id === 'sun'
          ? selected === id ? 2.35 : hoveredId === id ? 2.05 : 1.8
          : selected === id ? .48 : hoveredId === id ? .32 : .06;
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
      saturnRingGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={`science-scene${webglFailed ? ' is-fallback' : ''}`} ref={hostRef} data-testid="science-solar-scene">
      {webglFailed && <ScienceCanvasFallback host={hostRef.current} selectedId={selectedId} onSelect={onSelect} />}
      <div className="science-body-labels" aria-label="اختر جرمًا سماويًا">
        {bodies.map((body) => (
          <button
            className={`science-body-label${selectedId === body.id ? ' is-selected' : ''}`}
            key={body.id}
            type="button"
            data-body-label={body.id}
            data-testid={`button-select-${body.id}`}
            aria-label={`استكشف ${body.name}`}
            aria-pressed={selectedId === body.id}
            onClick={() => onSelect(body.id)}
          >
            <i style={{ '--body-color': `#${body.color.toString(16).padStart(6, '0')}` } as CSSProperties} />
            {body.name}
          </button>
        ))}
      </div>
      {webglFailed && !selectedId && (
        <div className="science-fallback-selector" role="group" aria-label="اختر عالمًا" data-testid="science-fallback-selector">
          {bodies.map((body) => (
            <button key={body.id} type="button" onClick={() => onSelect(body.id)} data-testid={`button-fallback-select-${body.id}`} aria-label={`استكشف ${body.name}`}>
              <i style={{ '--body-color': `#${body.color.toString(16).padStart(6, '0')}` } as CSSProperties} />
              {body.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SciencePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const body = useMemo(() => bodies.find((item) => item.id === selectedId) ?? null, [selectedId]);
  const source = useMemo(() => body ? videoSource(videos[body.id] ?? '') : null, [body]);
  const bodyFacts = body ? facts[body.id] : null;
  return (
    <main className="science-page" dir="rtl" data-testid="page-science">
      <ScienceScene selectedId={selectedId} onSelect={setSelectedId} />
      <div className="science-hint" data-testid="science-hint"><span className="science-hint-pulse" />اضغط على أي كوكب لاستكشافه 👆</div>
      <div className="science-instruction" aria-hidden="true"><RotateCcw size={14} /> اسحب للدوران · قرّب بإصبعين</div>
      {!selectedId && (
        <div className="science-overview-note" data-testid="science-overview-copy">
          <span>رحلة بين العوالم</span>
          <strong>تسع حكايات<br />تدور حول الشمس</strong>
          <small>اختر جرمًا سماويًا لتقترب منه</small>
        </div>
      )}
      {selectedId && body && bodyFacts && (
        <section className="science-detail" aria-labelledby="science-body-title" data-testid="science-detail-panel">
          <div className="science-detail-topline"><span><Sparkles size={14} /> عوالم النظام الشمسي</span>
            <button type="button" className="science-return" onClick={() => setSelectedId(null)} data-testid="button-science-return">
              <ArrowDownLeft size={15} /> رجوع
            </button>
          </div>
          <h1 id="science-body-title" data-testid="science-body-title">{body.name}</h1>
          <div className="science-video" data-testid="science-video-region">
            {source?.kind === 'youtube'
              ? <iframe src={source.src} title={`فيديو عن ${body.name}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
              : source?.kind === 'mp4'
                ? <video src={source.src} controls playsInline preload="metadata" aria-label={`فيديو عن ${body.name}`} />
                : <div className="science-video-empty" data-testid="science-video-placeholder"><CirclePlay size={33} strokeWidth={1.4} /><span>مكان الفيديو</span><small>أضف رابط الفيديو من ملف الإعدادات</small></div>}
          </div>
          <div className="science-facts" aria-label={`حقائق عن ${body.name}`} data-testid="science-facts">
            <div><span>البعد عن الشمس</span><strong>{bodyFacts.distance}</strong></div>
            <div><span>طول اليوم</span><strong>{bodyFacts.day}</strong></div>
            <div><span>الأقمار المعروفة</span><strong>{bodyFacts.moons}</strong></div>
          </div>
        </section>
      )}
      <div className="science-scale" dir="ltr" data-testid="science-model-caption">SOLAR SYSTEM · LIVE MODEL</div>
      <LogoFooter />
    </main>
  );
}
