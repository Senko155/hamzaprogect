import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ArrowRight, CirclePlay } from 'lucide-react';
import { useLocation } from 'wouter';
import LogoFooter from '../components/LogoFooter';
import { videoTitle as configuredTitle, videoUrl } from '../mathConfig.js';

type Equation = { tex: string; x: number; y: number; layer: 'is-deep' | 'is-mid' | 'is-near'; tint?: 'is-gold' | 'is-green'; delay: number; duration: number };
const equations: Equation[] = [
  { tex: String.raw`e^{i\pi}+1=0`, x: 6, y: 18, layer: 'is-near', delay: -4, duration: 33 },
  { tex: String.raw`E=mc^2`, x: 77, y: 13, layer: 'is-mid', tint: 'is-gold', delay: -17, duration: 38 },
  { tex: String.raw`r_s=\frac{2GM}{c^2}`, x: 6, y: 39, layer: 'is-mid', tint: 'is-green', delay: -10, duration: 35 },
  { tex: String.raw`F=G\frac{m_1m_2}{r^2}`, x: 77, y: 32, layer: 'is-near', delay: -23, duration: 43 },
  { tex: String.raw`\nabla\cdot\mathbf{E}=\frac{\rho}{\varepsilon_0}`, x: 3, y: 60, layer: 'is-deep', tint: 'is-gold', delay: -7, duration: 48 },
  { tex: String.raw`\nabla\times\mathbf{E}=-\frac{\partial\mathbf{B}}{\partial t}`, x: 28, y: 25, layer: 'is-mid', tint: 'is-green', delay: -21, duration: 42 },
  { tex: String.raw`\nabla\cdot\mathbf{B}=0`, x: 83, y: 61, layer: 'is-deep', tint: 'is-gold', delay: -14, duration: 39 },
  { tex: String.raw`\nabla\times\mathbf{B}=\mu_0\mathbf{J}+\mu_0\varepsilon_0\frac{\partial\mathbf{E}}{\partial t}`, x: 62, y: 83, layer: 'is-deep', delay: -31, duration: 46 },
  { tex: String.raw`i\hbar\frac{\partial}{\partial t}\Psi=\hat{H}\Psi`, x: 75, y: 52, layer: 'is-mid', tint: 'is-green', delay: -13, duration: 39 },
  { tex: String.raw`\rho\left(\frac{\partial\mathbf{u}}{\partial t}+\mathbf{u}\cdot\nabla\mathbf{u}\right)=-\nabla p+\mu\nabla^2\mathbf{u}`, x: 2, y: 81, layer: 'is-deep', delay: -19, duration: 45 },
  { tex: String.raw`\hat{f}(\xi)=\int_{-\infty}^{\infty}f(x)e^{-2\pi i x\xi}\,dx`, x: 37, y: 8, layer: 'is-deep', tint: 'is-green', delay: -27, duration: 42 },
  { tex: String.raw`\int_{-\infty}^{\infty}e^{-x^2}\,dx=\sqrt{\pi}`, x: 31, y: 91, layer: 'is-mid', tint: 'is-gold', delay: -11, duration: 36 },
  { tex: String.raw`\zeta(s)=\sum_{n=1}^{\infty}\frac{1}{n^s}`, x: 81, y: 72, layer: 'is-near', delay: -29, duration: 44 },
  { tex: String.raw`a^2+b^2=c^2`, x: 10, y: 91, layer: 'is-near', tint: 'is-green', delay: -8, duration: 40 },
  { tex: String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`, x: 79, y: 91, layer: 'is-mid', tint: 'is-gold', delay: -15, duration: 47 },
  { tex: String.raw`\pi=3.14159265358979323846264338327950288419716939937510`, x: 4, y: 6, layer: 'is-deep', delay: -22, duration: 50 },
  { tex: String.raw`e=2.71828182845904523536028747135266249775724709369995`, x: 52, y: 4, layer: 'is-deep', tint: 'is-gold', delay: -34, duration: 52 },
  { tex: String.raw`\varphi=\frac{1+\sqrt{5}}{2}\approx1.618`, x: 68, y: 22, layer: 'is-deep', tint: 'is-green', delay: -5, duration: 37 },
  { tex: String.raw`F_n=F_{n-1}+F_{n-2}`, x: 25, y: 73, layer: 'is-mid', tint: 'is-gold', delay: -18, duration: 41 },
  { tex: String.raw`0,1,1,2,3,5,8,13,21,34,\ldots`, x: 41, y: 95, layer: 'is-deep', tint: 'is-green', delay: -25, duration: 43 },
  { tex: String.raw`\Delta v=v_e\ln\left(\frac{m_0}{m_f}\right)`, x: 4, y: 29, layer: 'is-deep', tint: 'is-green', delay: -24, duration: 49 },
  { tex: String.raw`v=\sqrt{\frac{GM}{r}}`, x: 84, y: 43, layer: 'is-near', tint: 'is-gold', delay: -12, duration: 34 },
  { tex: String.raw`\oint_{\partial V}\mathbf{E}\cdot d\mathbf{A}=\frac{Q_{\rm enc}}{\varepsilon_0}`, x: 57, y: 66, layer: 'is-deep', delay: -32, duration: 45 },
];

function getVideoSource(raw: string): { kind: 'youtube' | 'mp4'; src: string } | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    const host = url.hostname.toLowerCase();
    const youtubeHost = host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'www.youtube-nocookie.com' || host === 'youtube-nocookie.com';
    if (youtubeHost && (url.protocol === 'https:' || url.origin === window.location.origin)) {
      const segment = url.hostname === 'youtu.be'
        ? url.pathname.split('/').filter(Boolean)[0]
        : url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
      if (!segment || !/^[\w-]{11}$/.test(segment)) return null;
      return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${segment}?rel=0&modestbranding=1` };
    }
    const localVideo = url.origin === window.location.origin && /^\/videos\/[a-zA-Z0-9._/-]+\.mp4$/i.test(url.pathname) && !url.pathname.includes('..');
    if (localVideo && (url.protocol === 'https:' || url.protocol === 'http:')) return { kind: 'mp4', src: url.href };
    return null;
  } catch {
    return null;
  }
}

function MathCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let ratio = 1;
    let raf = 0;
    let lastFrame = 0;
    let disposed = false;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      ratio = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (time: number) => {
      if (disposed || document.hidden) return;
      if (!reduced && time - lastFrame < 1000 / 28) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastFrame = time;
      ctx.clearRect(0, 0, width, height);
      const phase = reduced ? 0 : time * .00016;
      let x = .1; let y = 0; let z = 0;
      ctx.beginPath();
      for (let i = 0; i < 1450; i++) {
        const dx = 10 * (y - x);
        const dy = x * (28 - z) - y;
        const dz = x * y - (8 / 3) * z;
        x += dx * .005; y += dy * .005; z += dz * .005;
        const px = width * .16 + x * 2.15 + Math.sin(phase) * 8;
        const py = height * .51 + (z - 26) * 2.45;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(88, 208, 185, .17)';
      ctx.lineWidth = 1;
      ctx.stroke();
      const cx = width * .83; const cy = height * .23;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 5.2; a += .035) {
        const radius = 2.4 * Math.exp(.105 * a);
        const px = cx + Math.cos(a + phase * .3) * radius;
        const py = cy + Math.sin(a + phase * .3) * radius;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(203, 178, 111, .21)';
      ctx.stroke();
      for (let line = 0; line < 2; line++) {
        ctx.beginPath();
        for (let px = 0; px <= width; px += 5) {
          const py = height * (.77 + line * .045) + Math.sin(px * .012 + phase * 2 + line * 1.8) * (height * .014);
          if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = line === 0 ? 'rgba(107, 205, 218, .17)' : 'rgba(139, 211, 161, .13)';
        ctx.stroke();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
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
  return <canvas ref={canvasRef} className="math-visual-canvas" aria-hidden="true" data-testid="visual-math-forms" />;
}

export default function MathPage({ onBackHome }: { onBackHome?: () => void } = {}) {
  const [, setLocation] = useLocation();
  const title = configuredTitle || 'عنوان المقطع هنا';
  const returnHome = () => onBackHome ? onBackHome() : setLocation('/');
  const source = useMemo(() => getVideoSource(videoUrl), []);
  const renderedEquations = useMemo(() => equations.map((equation, index) => ({
    ...equation,
    html: katex.renderToString(equation.tex, { throwOnError: false, output: 'html' }),
    index,
  })), []);

  return (
    <main className="math-page" dir="rtl" data-testid="page-math" aria-label="مساحة الرياضيات">
      <MathCanvas />
      <div className="math-equation-field" aria-hidden="true" data-testid="math-equation-field">
        {renderedEquations.map(({ html, index, x, y, layer, tint, delay, duration }) => (
          <span
            key={index}
            className={`math-equation ${layer}${tint ? ` ${tint}` : ''}`}
            style={{ left: `${x}%`, top: `${y}%`, '--equation-delay': `${delay}s`, '--equation-duration': `${duration}s` } as CSSProperties}
            dangerouslySetInnerHTML={{ __html: html }}
            data-testid={`equation-${index + 1}`}
          />
        ))}
      </div>
      <div className="math-center-shade" aria-hidden="true" />
      <section className="math-center" aria-label="فيديو الرياضيات">
        <p className="math-kicker" data-testid="label-math-kicker">SPACE · NUMBER · MOTION</p>
        <h1 className="math-title" data-testid="text-math-video-title">{title}</h1>
        <div className="math-video-frame" data-testid="video-math-frame">
          {source?.kind === 'youtube' && (
            <iframe
              src={source.src}
              title={title || 'فيديو الرياضيات'}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              data-testid="video-math-youtube"
            />
          )}
          {source?.kind === 'mp4' && <video src={source.src} controls playsInline preload="metadata" aria-label={title || 'فيديو الرياضيات'} data-testid="video-math-local" />}
          {!source && (
            <div className="math-video-placeholder" data-testid="placeholder-math-video">
              <span className="math-play-mark"><CirclePlay size={25} strokeWidth={1.3} /></span>
              <strong>مكان الفيديو</strong>
              <small>VIDEO SIGNAL · AWAITING TRANSMISSION</small>
            </div>
          )}
        </div>
        {videoUrl.trim() && !source && <p className="math-error-note" role="status" data-testid="status-video-url">رابط الفيديو غير صالح. استخدم يوتيوب أو ملف MP4 داخل مجلد videos.</p>}
        <button className="math-back" type="button" onClick={returnHome} data-testid="button-math-back-home">
          <ArrowRight size={16} aria-hidden="true" />
          <span>رجوع</span>
        </button>
      </section>
      <div className="math-corner-note" aria-hidden="true">MATHEMATICS · FIELD NOTES 026</div>
      <LogoFooter />
    </main>
  );
}
