import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpLeft, ArrowUpRight, Calculator, Home, Orbit, Rocket, Volume2, VolumeX } from 'lucide-react';
import OrbitalStage from './OrbitalStage';
import LogoFooter from './LogoFooter';
import SciencePage from '../pages/SciencePage';
import MathPage from '../pages/MathPage';
import Simulation from './simulation/Simulation';
import { useLanguage } from '../i18n/LanguageContext';

type Section = 'simulation' | 'science' | 'math';
const sections: { id: Section; icon: typeof Orbit }[] = [
  { id: 'simulation', icon: Rocket },
  { id: 'science', icon: Orbit },
  { id: 'math', icon: Calculator },
];

function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

function useRumble() {
  const contextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const cleanup = () => {
    nodesRef.current.forEach((node) => { try { node.disconnect(); } catch { /* already disconnected */ } });
    nodesRef.current = [];
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };
  const play = (muted: boolean) => {
    if (muted) return;
    try {
      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      if (context.state === 'suspended') void context.resume();
      cleanup();
      const master = context.createGain();
      master.gain.setValueAtTime(.0001, context.currentTime);
      master.gain.exponentialRampToValueAtTime(.19, context.currentTime + .15);
      master.gain.exponentialRampToValueAtTime(.0001, context.currentTime + 2.1);
      master.connect(context.destination);
      const oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(72, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(28, context.currentTime + 1.8);
      oscillator.connect(master);
      oscillator.start();
      oscillator.stop(context.currentTime + 2.15);
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length);
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(.06, context.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + 1.6);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(master);
      noise.start();
      nodesRef.current = [master, oscillator, noise, filter, noiseGain];
      timerRef.current = window.setTimeout(cleanup, 2400);
    } catch {
      // Audio is an enhancement; the launch remains available if the browser blocks it.
    }
  };
  useEffect(() => () => {
    cleanup();
    if (contextRef.current) void contextRef.current.close();
  }, []);
  return play;
}

export default function SpaceExperience() {
  const [location, setLocation] = useLocation();
  const { language, direction, t, setLanguage } = useLanguage();
  const [initialLoading, setInitialLoading] = useState(true);
  const [muted, setMuted] = useState(() => {
    try { return window.localStorage.getItem('space-week-muted') === 'true'; } catch { return false; }
  });
  const [launching, setLaunching] = useState<Section | null>(null);
  const playRumble = useRumble();
  const utc = useUtcClock();
  const activeSection = location.match(/^\/(simulation|science|math)$/)?.[1] as Section | undefined;
  useEffect(() => {
    const timer = window.setTimeout(() => setInitialLoading(false), 720);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('space-week-muted', String(muted)); } catch { /* Storage is optional. */ }
  }, [muted]);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const launchTo = (path: string, section: Section) => {
    if (launching) return;
    if (reduceMotion) { setLocation(path); return; }
    setLaunching(section);
    playRumble(muted);
    window.setTimeout(() => setLocation(path), 1750);
    window.setTimeout(() => setLaunching(null), 2200);
  };
  const transitionHome = () => {
    if (!activeSection || launching) return;
    if (reduceMotion) { setLocation('/'); return; }
    setLaunching(activeSection);
    window.setTimeout(() => setLocation('/'), 360);
    window.setTimeout(() => setLaunching(null), 920);
  };
  const toggleMute = () => setMuted((value) => !value);
  return (
    <div className="cosmos-app" dir={direction} lang={language} data-testid="space-week-app">
      {location !== '/simulation' && location !== '/science' && location !== '/math' && <OrbitalStage />}
      <div className="space-vignette" aria-hidden="true" />
      {!activeSection ? (
        <>
          <header className="topbar" data-testid="header-home">
            <Link href="/" className="brand-mark" aria-label={t.brand.homeLabel} data-testid="link-brand-home">
              <span className="brand-emblem"><Orbit size={21} strokeWidth={1.5} /></span>
              <span className="brand-copy">{t.brand.title}<small>{t.brand.tagline}</small></span>
            </Link>
            <div className="top-actions">
              <span className="clock-readout" dir="ltr" data-testid="text-live-utc-time">{t.brand.livePositions}: {utc} UTC</span>
              <LanguageSwitcher language={language} onChange={setLanguage} label={t.language.label} arabicCode={t.language.arabicCode} englishCode={t.language.englishCode} />
              <button className="icon-control" type="button" onClick={toggleMute} aria-label={muted ? t.brand.unmute : t.brand.mute} aria-pressed={!muted} data-testid="button-toggle-mute">
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                <span>{muted ? t.brand.muted : t.brand.soundOn}</span>
              </button>
            </div>
          </header>
          <main className="home-content" data-testid="page-home">
            <section className="hero-copy" aria-labelledby="home-title">
              <div className="eyebrow" data-testid="label-event-kicker">{t.home.eventKicker}</div>
              <h1 className="hero-title" id="home-title" data-testid="heading-home">{t.home.title} <span className="hero-title-second-line">{t.home.titleSecond} <bdi>2026</bdi></span></h1>
              <p className="hero-subtitle" data-testid="text-home-subtitle">{t.home.dates}</p>
              <div className="section-grid" role="group" aria-label={t.home.sectionsLabel} data-testid="nav-sections">
                {sections.map(({ id, icon: Icon }, index) => {
                  const { label, description, discover } = t.home.sections[id];
                  return (
                  <button
                    className={`section-card${launching === id ? ' is-launching' : ''}`}
                    type="button"
                    key={id}
                    onClick={() => launchTo(`/${id}`, id)}
                    disabled={launching !== null}
                    aria-label={`${label}: ${description}`}
                    data-testid={`button-open-${id}`}
                  >
                    <span className="section-card-index" dir={language === 'ar' ? 'rtl' : 'ltr'}>{t.home.sectionIndex(`0${index + 1}`)}</span>
                    <span className="section-card-icon"><Icon size={25} strokeWidth={1.55} /></span>
                    <span className="section-card-title">{label}</span>
                    <span className="section-card-description">{description}</span>
                    <span className="section-card-link">{discover} {direction === 'rtl' ? <ArrowUpLeft size={15} /> : <ArrowUpRight size={15} />}</span>
                    <span className="rocket-flare" aria-hidden="true" />
                    <span className="rocket-smoke" aria-hidden="true" />
                    {Array.from({ length: 8 }, (_, particle) => (
                      <i className="launch-spark" data-particle={particle + 1} key={particle} aria-hidden="true" />
                    ))}
                  </button>
                  );
                })}
              </div>
              <div className="hero-footnote" data-testid="text-home-footnote"><span className="live-dot" />{t.home.footnote}</div>
            </section>
          </main>
          <div className="orbit-note" aria-label={t.home.orbitDescription} data-testid="label-orbit-scale">{t.home.orbitNote}</div>
          <LogoFooter />
        </>
      ) : (
        <>
          <header className="topbar section-topbar" data-testid="header-section">
            <Link href="/" className="brand-mark" onClick={(event) => { event.preventDefault(); transitionHome(); }} data-testid="link-section-brand-home">
              <span className="brand-emblem"><Orbit size={21} strokeWidth={1.5} /></span>
              <span className="brand-copy">{t.brand.title}<small>{t.brand.tagline}</small></span>
            </Link>
            <div className="top-actions">
              <span className="clock-readout" dir="ltr" data-testid="text-live-utc-time">{t.brand.livePositions}: {utc} UTC</span>
              <LanguageSwitcher language={language} onChange={setLanguage} label={t.language.label} arabicCode={t.language.arabicCode} englishCode={t.language.englishCode} />
              <button className="icon-control" type="button" onClick={transitionHome} aria-label={t.brand.home} data-testid="button-section-home">
                <Home size={16} /><span>{t.brand.home}</span>
              </button>
              <button className="icon-control" type="button" onClick={toggleMute} aria-label={muted ? t.brand.unmute : t.brand.mute} aria-pressed={!muted} data-testid="button-toggle-mute">
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                <span>{muted ? t.brand.muted : t.brand.soundOn}</span>
              </button>
            </div>
          </header>
          {activeSection === 'simulation'
            ? <Simulation muted={muted} onToggleMute={toggleMute} onBackHome={transitionHome} />
            : activeSection === 'science' ? <SciencePage /> : <MathPage onBackHome={transitionHome} />}
        </>
      )}
      <div className={`launch-overlay${launching ? ' active' : ''}`} aria-hidden="true" />
      <div className={`initial-loader${initialLoading ? '' : ' is-hidden'}`} aria-hidden={!initialLoading} data-testid="initial-loader">
        <Rocket className="initial-loader-rocket" size={24} strokeWidth={1.4} />
        <span>{t.loader}</span>
      </div>
    </div>
  );
}

function LanguageSwitcher({ language, onChange, label, arabicCode, englishCode }: { language: 'ar' | 'en'; onChange: (language: 'ar' | 'en') => void; label: string; arabicCode: string; englishCode: string }) {
  return (
    <div className="language-switcher" role="group" aria-label={label} dir="ltr" data-testid="language-switcher">
      <button type="button" onClick={() => onChange('ar')} aria-pressed={language === 'ar'}>{arabicCode}</button>
      <span aria-hidden="true">|</span>
      <button type="button" onClick={() => onChange('en')} aria-pressed={language === 'en'}>{englishCode}</button>
    </div>
  );
}
