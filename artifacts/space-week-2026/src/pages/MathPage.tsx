import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';
import LogoFooter from '../components/LogoFooter';
import { useLanguage, type Language } from '../i18n/LanguageContext';
import { videos } from '../videos.js';
import VideoLanguageToggle from '../components/VideoLanguageToggle';
import LocalizedVideo from '../components/LocalizedVideo';
import { ScienceScene } from './SciencePage';

const planetIds = Object.keys(videos) as (keyof typeof videos)[];

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
  const { language, direction, t } = useLanguage();
  const [selectedId, setSelectedId] = useState<(typeof planetIds)[number]>('sun');
  const [videoLanguageOverride, setVideoLanguageOverride] = useState<{ planetId: (typeof planetIds)[number]; language: Language } | null>(null);
  const videoLanguage = videoLanguageOverride?.planetId === selectedId ? videoLanguageOverride.language : language;
  const [videoOpen, setVideoOpen] = useState(false);
  const returnHome = () => onBackHome ? onBackHome() : setLocation('/');
  const selectedName = t.science.names[selectedId];
  const videoUrl = videos[selectedId].math[videoLanguage] || videos[selectedId].science[videoLanguage];
  const bodyFacts = t.science.factsByPlanet[selectedId];
  const renderedEquations = useMemo(() => equations.map((equation, index) => ({
    ...equation,
    html: katex.renderToString(equation.tex, { throwOnError: false, output: 'html' }),
    index,
  })), []);

  return (
    <main className="math-page" dir={direction} lang={language} data-testid="page-math" aria-label={t.math.label}>
      <MathCanvas />
      <ScienceScene
        selectedId={selectedId}
        mathMode
        onSelect={(id) => {
          setVideoOpen(true);
          setVideoLanguageOverride(null);
          setSelectedId(id as (typeof planetIds)[number]);
        }}
      />
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
      <section className="math-center" aria-label={t.math.label}>
        <article className="math-content-card">
          <h1 className="math-title" data-testid="text-math-video-title">{t.math.videoTitle(selectedName)}</h1>
          <VideoLanguageToggle
            language={videoLanguage}
            onChange={(nextLanguage) => setVideoLanguageOverride({ planetId: selectedId, language: nextLanguage })}
            label={t.video.language}
            arabicLabel={t.video.arabic}
            englishLabel={t.video.english}
          />
          <div className={`math-video-frame${videoOpen ? '' : ' is-idle'}`} data-testid="video-math-frame">
            {videoOpen ? <LocalizedVideo
                key={`${selectedId}-${videoLanguage}-${videoUrl}`}
                raw={videoUrl}
                title={t.math.videoTitle(selectedName)}
                emptyLabel={t.math.emptyVideo}
                placeholderClassName="math-video-placeholder"
                mediaClassName="math-video-media"
                testId="video-math-player"
              />
              : <button className="math-scene-prompt" type="button" onClick={() => setVideoOpen(true)} data-testid="button-math-open-selected-video">
                  {t.math.planetPicker}
                </button>}
          </div>
          <p className="math-video-facts" data-testid="math-video-facts">
            <span>{t.math.factDistance(bodyFacts.distance)}</span>
            <span>{t.math.factDay(bodyFacts.day)}</span>
            <span>{t.math.factMoons(bodyFacts.moons)}</span>
          </p>
          <div className="math-planet-picker" role="group" aria-label={t.math.planetPicker}>
            {planetIds.map((id) => (
              <button
                type="button"
                key={id}
                className={selectedId === id ? 'is-selected' : ''}
                aria-pressed={selectedId === id}
                aria-label={t.science.names[id]}
                onClick={() => { setVideoOpen(true); setVideoLanguageOverride(null); setSelectedId(id); }}
              >
                {t.science.names[id]}
              </button>
            ))}
          </div>
          <button className="math-back" type="button" onClick={() => { setVideoOpen(false); returnHome(); }} data-testid="button-math-back-home">
            {direction === 'rtl' ? <ArrowRight size={16} aria-hidden="true" /> : <ArrowLeft size={16} aria-hidden="true" />}
            <span>{t.math.back}</span>
          </button>
        </article>
      </section>
      <div className="math-corner-note" aria-hidden="true">{t.math.cornerNote}</div>
      <LogoFooter />
    </main>
  );
}
