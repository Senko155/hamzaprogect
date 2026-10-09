import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, Flag, Home, Pause, Play, Radio, RotateCcw, Rocket, Settings2, Zap } from 'lucide-react';
import MissionScene, { type MissionPhase } from './MissionScene';
import LogoFooter from '../LogoFooter';
import { useLanguage } from '../../i18n/LanguageContext';
import './simulation.css';

type Props = { muted: boolean; onToggleMute: () => void; onBackHome: () => void };
type Quality = 'low' | 'medium' | 'high';
function defaultQuality(): Quality {
  if (typeof window === 'undefined') return 'low';
  return window.matchMedia('(max-width: 760px)').matches
    || window.matchMedia('(pointer: coarse)').matches
    || (navigator.maxTouchPoints ?? 0) > 0
    || (navigator.hardwareConcurrency ?? 8) <= 8
    || (window.devicePixelRatio || 1) <= 1.25
    ? 'low'
    : 'medium';
}
const ascentMilestones = [
  { at: 0 },
  { at: 78 },
  { at: 165 },
  { at: 175 },
  { at: 195 },
  { at: 225 },
  { at: 480 },
];

function useMissionAudio(muted: boolean) {
  const contextRef=useRef<AudioContext|null>(null);
  const nodesRef=useRef<AudioNode[]>([]);
  const timerRef=useRef<number[]>([]);
  const sourcesRef=useRef<AudioScheduledSourceNode[]>([]);
  const stop=useCallback(()=>{
    timerRef.current.forEach(window.clearTimeout);timerRef.current=[];
    sourcesRef.current.forEach(source=>{try{source.stop();}catch{/* already stopped */}});
    sourcesRef.current=[];
    nodesRef.current.forEach(n=>{try{n.disconnect();}catch{/* already disconnected */}});nodesRef.current=[];
  },[]);
  const tone=useCallback((frequency:number,duration=.16,volume=.09)=>{
    if(muted)return;
    try{
      const context=contextRef.current??new AudioContext();contextRef.current=context;
      if(context.state==='suspended')void context.resume();
      const osc=context.createOscillator(),gain=context.createGain();
      osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(.0001,context.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume,context.currentTime+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+duration);
      osc.connect(gain);gain.connect(context.destination);osc.start();osc.stop(context.currentTime+duration+.03);
      nodesRef.current.push(osc,gain);sourcesRef.current.push(osc);
      timerRef.current.push(window.setTimeout(()=>{
        try{osc.disconnect();gain.disconnect();}catch{/* audio ended */}
        sourcesRef.current=sourcesRef.current.filter(source=>source!==osc);
        nodesRef.current=nodesRef.current.filter(node=>node!==osc&&node!==gain);
      },duration*1000+100));
    }catch{/* Audio is optional; game actions remain usable. */}
  },[muted]);
  const ignite=useCallback(()=>{
    if(muted)return;
    try{
      const context=contextRef.current??new AudioContext();contextRef.current=context;
      if(context.state==='suspended')void context.resume();
      const now=context.currentTime;
      const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate);
      const samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(.8-i/samples.length*.35);
      const noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
      const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(280,now);filter.frequency.exponentialRampToValueAtTime(90,now+6);
      const noiseGain=context.createGain();noiseGain.gain.setValueAtTime(.0001,now);noiseGain.gain.exponentialRampToValueAtTime(.12,now+.18);noiseGain.gain.setValueAtTime(.12,now+3);noiseGain.gain.exponentialRampToValueAtTime(.0001,now+6.8);
      const engine=context.createOscillator();engine.type='sawtooth';engine.frequency.setValueAtTime(58,now);engine.frequency.exponentialRampToValueAtTime(42,now+6);
      const engineGain=context.createGain();engineGain.gain.setValueAtTime(.0001,now);engineGain.gain.exponentialRampToValueAtTime(.035,now+.2);engineGain.gain.exponentialRampToValueAtTime(.0001,now+6.8);
      noise.connect(filter);filter.connect(noiseGain);noiseGain.connect(context.destination);engine.connect(engineGain);engineGain.connect(context.destination);
      noise.start(now);noise.stop(now+7);engine.start(now);engine.stop(now+7);
      nodesRef.current.push(noise,filter,noiseGain,engine,engineGain);sourcesRef.current.push(noise,engine);
      timerRef.current.push(window.setTimeout(()=>{
        [noise,filter,noiseGain,engine,engineGain].forEach(node=>{try{node.disconnect();}catch{/* audio ended */}});
        sourcesRef.current=sourcesRef.current.filter(source=>source!==noise&&source!==engine);
        const finishedNodes:AudioNode[]=[noise,filter,noiseGain,engine,engineGain];
        nodesRef.current=nodesRef.current.filter(node=>!finishedNodes.includes(node));
      },7200));
    }catch{/* Audio is optional; game actions remain usable. */}
  },[muted]);
  useEffect(()=>()=>{stop();if(contextRef.current)void contextRef.current.close();},[stop]);
  useEffect(()=>{if(muted)stop();},[muted,stop]);
  return useMemo(()=>({tone,ignite,stop}),[tone,ignite,stop]);
}

export default function Simulation({muted,onToggleMute,onBackHome}:Props) {
  const { language, direction, t } = useLanguage();
  const sim = t.simulation;
  const labels = sim.phaseLabels;
  const controls = sim.controls;
  const [phase,setPhase]=useState<MissionPhase>('ready');
  const [phaseSeconds,setPhaseSeconds]=useState(0);
  const [missionSeconds,setMissionSeconds]=useState(0);
  const [paused,setPaused]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [firstPerson,setFirstPerson]=useState(false);
  const [tilt,setTilt]=useState(0);
  const [throttle,setThrottle]=useState(.68);
  const [assisted,setAssisted]=useState(true);
  const [walked,setWalked]=useState(0);
  const [jumpStarted,setJumpStarted]=useState(0);
  const [flagForm,setFlagForm]=useState(false);
  const [name,setName]=useState('');
  const [plantedName,setPlantedName]=useState('');
  const [radio,setRadio]=useState('');
  const [quality,setQuality]=useState<Quality>(defaultQuality);
  const [showFps,setShowFps]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [startPanelLeaving,setStartPanelLeaving]=useState(false);
  const startTimerRef=useRef<number|undefined>(undefined);
  const audio=useMissionAudio(muted);
  const phaseRef=useRef(phase);phaseRef.current=phase;

  const begin=(next:MissionPhase)=>{
    setPhase(next);setPhaseSeconds(0);setPaused(false);
  };
  const restart=()=>{
    audio.stop();setPhase('ready');setPhaseSeconds(0);setMissionSeconds(0);setPaused(false);
    setFirstPerson(false);setTilt(0);setThrottle(.68);setAssisted(true);setWalked(0);setJumpStarted(0);
    setFlagForm(false);setName('');setPlantedName('');setRadio('');
    setStartPanelLeaving(false);
  };
  const startCountdown=()=>{
    if(phaseRef.current!=='ready'||startTimerRef.current!==undefined)return;
    setStartPanelLeaving(true);
    startTimerRef.current=window.setTimeout(()=>{
      startTimerRef.current=undefined;
      setStartPanelLeaving(false);
      begin('countdown');
    },220);
  };
  useEffect(()=>()=>{if(startTimerRef.current!==undefined)window.clearTimeout(startTimerRef.current);},[]);
  const orbitSkip=()=>{audio.tone(660,.24,.1);setRadio(sim.radio.orbitConfirmed);begin('orbit');};
  const triggerTli=()=>{audio.tone(330,.35,.12);audio.tone(660,.4,.07);setRadio(sim.radio.tliConfirmed);begin('journey');};

  useEffect(()=>{
    if(paused||phase==='ready'||phase==='finish')return;
    const timer=window.setInterval(()=>{
      setPhaseSeconds(s=>s+1);
      setMissionSeconds(s=>s+1);
    },1000);
    return ()=>window.clearInterval(timer);
  },[phase,paused]);

  useEffect(()=>{
    if(paused)return;
    if(phase==='countdown'&&phaseSeconds>=5){audio.tone(58,1.6,.08);setRadio(sim.radio.enginesIgnited);begin('ascent');}
    if(phase==='ascent'&&phaseSeconds>=510){setRadio(sim.radio.reachedOrbit);begin('orbit');}
    if(phase==='ascent'&&phaseSeconds===78)setRadio(sim.radio.maxQ);
    if(phase==='ascent'&&phaseSeconds===165)setRadio(sim.radio.firstStage);
    if(phase==='ascent'&&phaseSeconds===195)setRadio(sim.radio.secondStage);
    if(phase==='ascent'&&phaseSeconds===175)setRadio(sim.radio.escapeTower);
    if(phase==='ascent'&&phaseSeconds===225)setRadio(sim.radio.fairing);
    if(phase==='ascent'&&phaseSeconds===480)setRadio(sim.radio.orbitBurn);
    if(phase==='journey'&&phaseSeconds===145)setRadio(sim.radio.lunarBurn);
    if(phase==='journey'&&phaseSeconds>=155){setRadio(sim.radio.nearMoon);begin('landing');}
    if(phase==='landing'&&phaseSeconds>=58){setRadio(sim.radio.safeLanding);begin('surface');}
    if(phase==='orbit'&&phaseSeconds===2)audio.tone(880,.12,.055);
    if(phase==='journey'&&phaseSeconds===70)setRadio(sim.radio.midJourney);
  },[phase,phaseSeconds,paused,audio,sim]);

  useEffect(()=>{
    const onVisibility=()=>{if(document.hidden&&phaseRef.current!=='ready'&&phaseRef.current!=='finish')setPaused(true);};
    document.addEventListener('visibilitychange',onVisibility);
    return()=>document.removeEventListener('visibilitychange',onVisibility);
  },[]);

  useEffect(()=>{
    if(phase!=='countdown')return;
    const second=5-phaseSeconds;
    if(second>0){audio.tone(second===1?880:620,.22,.08);}
    if(phaseSeconds===3)audio.ignite();
  },[phase,phaseSeconds,audio]);

  useEffect(()=>{
    if(phase==='orbit')setRadio(sim.radio.exploreMoon);
  },[phase,sim]);

  useEffect(()=>{
    if(phase!=='surface')return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.target instanceof Element&&event.target.closest('button,input,textarea,select,a'))return;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','w','W','a','A','s','S','d','D'].includes(event.key)){
        event.preventDefault();
        if(event.key===' '){setJumpStarted(performance.now());audio.tone(210,.08,.025);}
        else if(['ArrowUp','w','W','ArrowRight','d','D'].includes(event.key))setWalked(v=>Math.min(100,v+2));
        else setWalked(v=>Math.max(0,v-2));
      }
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[phase,audio]);

  const phaseProgress=phase==='ascent'?Math.min(phaseSeconds/510,1):phase==='journey'?Math.min(phaseSeconds/155,1):phase==='landing'?Math.min(phaseSeconds/58,1):phase==='orbit'?Math.min(phaseSeconds/18,1):phase==='surface'?Math.min(walked/100,1):0;
  const altitude=phase==='ascent'?Math.round(Math.min(phaseSeconds/510,1)*185):phase==='orbit'?408:phase==='journey'?Math.round(408+phaseSeconds/155*350):phase==='landing'?Math.max(0,110-(phaseSeconds/58)*110):0;
  const speed=phase==='ascent'?Math.round(200+Math.min(phaseSeconds/510,1)*27600):phase==='orbit'?27600:phase==='journey'?Math.round(39000+Math.sin(phaseSeconds*.07)*800):phase==='landing'?Math.round(480- Math.min(phaseSeconds/58,1)*450):0;
  const fuelPercent=phase==='landing'?Math.max(8,Math.round(100-phaseSeconds*(1.1+throttle*.12))):100;
  const journeyProgress = Math.min(phaseSeconds / 155, 1);
  const distanceFromEarth = phase === 'journey'
    ? Math.round(384400 * journeyProgress)
    : ['landing', 'surface', 'finish'].includes(phase) ? 384400 : phase === 'orbit' ? 12000 : 0;
  const distanceToMoon = phase === 'journey'
    ? Math.round(384400 * (1 - journeyProgress))
    : ['landing', 'surface', 'finish'].includes(phase) ? 0 : 384400;
  const orbitReady = phase === 'orbit' && phaseSeconds >= 45;
  const journeyElapsedSeconds = phaseSeconds * 1672;
  const journeyDay = Math.floor(journeyElapsedSeconds / 86400) + 1;
  const journeyHour = Math.floor(journeyElapsedSeconds / 3600) % 24;
  const journeyMinute = Math.floor(journeyElapsedSeconds / 60) % 60;
  const missionTime=phase==='journey'
     ? `${sim.controls.dayWord} ${journeyDay} · ${String(journeyHour).padStart(2,'0')}${controls.units.hour} ${String(journeyMinute).padStart(2,'0')}${controls.units.minuteShort}`
    : phase==='orbit'
      ? `T+ ${String(Math.floor(phaseSeconds/60)).padStart(2,'0')}:${String(phaseSeconds%60).padStart(2,'0')}`
      : `T+ ${String(Math.floor(missionSeconds/60)).padStart(2,'0')}:${String(missionSeconds%60).padStart(2,'0')}`;
  const countdown=5-phaseSeconds;
  const changeThrottle=(value:number)=>setThrottle(Math.max(.15,Math.min(1,value)));
  const landNow=()=>{
    if(throttle<.28&&!assisted){setRadio(sim.radio.increaseThrust);audio.tone(190,.22,.06);return;}
    audio.tone(520,.3,.08);setRadio(sim.radio.safeTouchdown);begin('surface');
  };
  const plantFlag=(event:React.FormEvent)=>{
    event.preventDefault();const clean=name.trim().slice(0,20)||controls.emptyAstronaut;
    setPlantedName(clean);setFlagForm(false);audio.tone(740,.24,.07);begin('finish');
  };
  const goWalk=(step:number)=>{setWalked(v=>Math.min(100,Math.max(0,v+step)));audio.tone(210,.08,.025);};
  const jump=()=>{setJumpStarted(performance.now());audio.tone(250,.1,.035);};

  const stageTitle=phase==='orbit'?sim.stageTitleOrbit:labels[phase];
  const stageCopy:Record<MissionPhase,string>={
    ready:sim.copy.ready,
    countdown:sim.copy.countdown(Math.max(0,countdown)),
    ascent:sim.copy.ascent,
    orbit:sim.copy.orbit,
    journey:sim.copy.journey,
    landing:sim.copy.landing,
    surface:sim.copy.surface,
    finish:sim.copy.finish(plantedName||controls.emptyAstronaut),
  };
  return (
    <main className={`mission-screen${phase==='countdown'&&phaseSeconds>=2&&!paused?' is-countdown':''}${phase!=='ready'&&phase!=='finish'?' is-gameplay':''}${startPanelLeaving?' is-start-leaving':''}`} dir={direction} lang={language} data-phase={phase} data-testid="page-simulation">
      <MissionScene phase={phase} phaseSeconds={phaseSeconds} missionSeconds={missionSeconds} firstPerson={firstPerson} paused={paused} quality={quality} showFps={showFps} tilt={tilt} throttle={throttle} walking={walked} jumpStarted={jumpStarted} flagName={plantedName} language={language} flagInscription={controls.flagInscription} emptyAstronaut={controls.emptyAstronaut} sceneDescription={controls.sceneDescription} onLoaded={()=>setLoaded(true)} />
      {!loaded&&<div className="mission-loading" role="status" data-testid="status-simulation-loading"><span className="mission-loading-mark"/><span>{sim.loading}</span></div>}
      <div className="mission-topline">
        <div><div className="mission-kicker">{sim.kicker}</div><h1 className="mission-heading">{sim.title}</h1></div>
        <div className="mission-tools">
          {phase!=='ready'&&phase!=='finish'&&<button className="mission-button" type="button" onClick={()=>setPaused(p=>!p)} aria-pressed={paused} data-testid="button-simulation-pause">{paused?<Play size={16}/>:<Pause size={16}/>}<span>{paused?sim.resume:sim.pause}</span></button>}
          <button className="mission-button mission-settings-toggle" type="button" onClick={()=>setSettingsOpen(open=>!open)} aria-label={sim.settings} aria-expanded={settingsOpen} data-testid="button-simulation-settings"><Settings2 size={16}/><span>{sim.settings}</span></button>
        </div>
      </div>
      {settingsOpen&&<div className="mission-settings" role="group" aria-label={sim.settings}>
        <label htmlFor="simulation-quality">{sim.quality}</label>
        <select id="simulation-quality" className="mission-select" value={quality} onChange={event=>setQuality(event.target.value as Quality)} data-testid="select-simulation-quality">
          <option value="low">{sim.qualities.low}</option><option value="medium">{sim.qualities.medium}</option><option value="high">{sim.qualities.high}</option>
        </select>
        <label className="mission-fps-toggle"><input type="checkbox" checked={showFps} onChange={event=>setShowFps(event.target.checked)} data-testid="toggle-simulation-fps"/>{sim.showFps}</label>
      </div>}
      <div className="mission-body">
        <aside className="mission-side">
          <section className="mission-panel" aria-live="polite">
            <h2 className="mission-stage-name"><Rocket size={18}/>{stageTitle}</h2>
            <p className="mission-copy">{stageCopy[phase]}</p>
            <div className="mission-progress" aria-label={controls.phaseProgress}><i style={{width:`${Math.max(phase==='ready'?0:4,phaseProgress*100)}%`}}/></div>
            <div className="mission-stage-controls">
              {phase==='ascent'&&<button className="mission-button purple" type="button" onClick={orbitSkip} data-testid="button-skip-to-orbit"><Zap size={16}/>{controls.skipOrbit}</button>}
              {phase==='orbit'&&(orbitReady
                ? <button className="mission-button primary" type="button" onClick={triggerTli} data-testid="button-tli">{controls.tli}</button>
                : <p className="mission-orbit-hold" role="status" data-testid="text-orbit-hold">{controls.orbitHold(phaseSeconds)}</p>)}
              {phase==='landing'&&<>
                <div className="mission-stage-controls">
                  <button className="mission-button" type="button" onClick={()=>setTilt(v=>Math.max(-.55,v-.12))} aria-label={controls.tiltLeftAria} data-testid="button-tilt-left"><ArrowDown size={15}/>{controls.tiltLeft}</button>
                  <button className="mission-button" type="button" onClick={()=>setTilt(v=>Math.min(.55,v+.12))} aria-label={controls.tiltRightAria} data-testid="button-tilt-right">{controls.tiltRight}<ArrowUp size={15}/></button>
                </div>
                <label className="mission-copy" htmlFor="landing-throttle">{controls.thrust} · {Math.round(throttle*100)}%</label>
                <input id="landing-throttle" className="mission-input" type="range" min=".15" max="1" step=".01" value={throttle} onChange={e=>changeThrottle(Number(e.target.value))} aria-label={controls.thrust} data-testid="input-landing-throttle"/>
                <button className={`mission-button ${assisted?'primary':'purple'}`} type="button" onClick={()=>setAssisted(v=>!v)} aria-pressed={assisted} data-testid="button-assisted-landing">{assisted?controls.assistedOn:controls.assistedOff}</button>
                <button className="mission-button primary" type="button" onClick={landNow} data-testid="button-confirm-landing">{controls.confirmLanding}</button>
              </>}
              {phase==='surface'&&<div className="mission-stage-controls">
                {!flagForm?<button className="mission-button primary" type="button" onClick={()=>setFlagForm(true)} disabled={walked<95} aria-describedby="flag-site-status" data-testid="button-open-flag-form"><Flag size={16}/>{controls.raiseFlag}</button>:<form className="mission-form" onSubmit={plantFlag}>
                  <input className="mission-input" value={name} onChange={e=>setName(e.target.value.slice(0,20))} maxLength={20} minLength={1} required autoFocus placeholder={controls.astronautPlaceholder} aria-label={controls.astronautPlaceholder} data-testid="input-astronaut-name"/>
                  <button className="mission-button primary" type="submit" disabled={!name.trim()} data-testid="button-plant-flag">{controls.plantFlag}</button>
                </form>}
                <span id="flag-site-status" className="mission-stage-status">{flagForm?`${name.length}/20`:walked<95?controls.moveToFlag:controls.flagLocation(walked)}</span>
              </div>}
            </div>
            <div className="mission-readouts">
              <div className="mission-readout"><span className="mission-readout-label">{controls.elapsed}</span><span className="mission-readout-value" data-testid="text-mission-time">{Math.floor(missionSeconds/60)}:{String(missionSeconds%60).padStart(2,'0')}</span></div>
              <div className="mission-readout"><span className="mission-readout-label">{controls.clock}</span><span className="mission-readout-value" data-testid="text-mission-clock">{missionTime}</span></div>
              {phase!=='ready'&&phase!=='countdown'&&<div className="mission-readout"><span className="mission-readout-label">{controls.altitude}</span><span className="mission-readout-value" data-testid="text-altitude">{phase==='landing'?altitude.toFixed(1):altitude} {controls.units.km}</span></div>}
              {phase!=='ready'&&phase!=='countdown'&&<div className="mission-readout"><span className="mission-readout-label">{controls.velocity}</span><span className="mission-readout-value" data-testid="text-speed">{speed.toLocaleString(language==='ar'?'ar-SA':'en-US')} {controls.units.kmh}</span></div>}
              {phase==='landing'&&<div className="mission-readout"><span className="mission-readout-label">{controls.verticalSpeedFuel}</span><span className="mission-readout-value" data-testid="text-landing-speed">{Math.round((1-phaseProgress)*18)} {controls.units.ms} · {fuelPercent}%</span></div>}
              {phase==='journey'&&<>
                <div className="mission-readout"><span className="mission-readout-label">{controls.earthDistance}</span><span className="mission-readout-value" data-testid="text-distance-from-earth">{distanceFromEarth.toLocaleString(language==='ar'?'ar-SA':'en-US')} {controls.units.km}</span></div>
                <div className="mission-readout"><span className="mission-readout-label">{controls.moonRange}</span><span className="mission-readout-value" data-testid="text-distance-to-moon">{distanceToMoon.toLocaleString(language==='ar'?'ar-SA':'en-US')} {controls.units.km}</span></div>
              </>}
              {(phase==='journey'||phase==='surface'||phase==='finish')&&<div className="mission-readout"><span className="mission-readout-label">{controls.travelled}</span><span className="mission-readout-value" data-testid="text-distance">{distanceFromEarth.toLocaleString(language==='ar'?'ar-SA':'en-US')} {controls.units.km}</span></div>}
            </div>
          </section>
          {(phase==='ascent'||phase==='orbit')&&<section className="mission-panel">
            <div className="mission-kicker"><Activity size={13}/> {controls.dynamics}</div>
            <p className="mission-copy" style={{marginTop:8}}>{phase==='ascent'?sim.milestones[Math.max(0,ascentMilestones.findLastIndex(item=>item.at<=phaseSeconds))]??controls.takeoffReady:controls.telemetryNominal}</p>
            {phase==='ascent'&&<div className="mission-readout" style={{marginTop:12}}><span className="mission-readout-label">MAX-Q</span><span className="mission-readout-value" data-testid="text-max-q">{phaseSeconds>=78?controls.maxQ:controls.launchMaxQ}</span></div>}
            {phase==='ascent'&&<div className="mission-timeline" aria-label={controls.stages}>
              {ascentMilestones.map((milestone,index)=>{
                const current=phaseSeconds>=milestone.at&&(index===ascentMilestones.length-1||phaseSeconds<ascentMilestones[index+1].at);
                const done=phaseSeconds>=milestone.at;
                return <div className={`mission-timeline-item${done?' done':''}${current?' current':''}`} key={milestone.at} data-testid={`milestone-${milestone.at}`}>
                  <i aria-hidden="true"/><span dir={milestone.at===78?'ltr':direction}>{sim.milestones[index]}</span><b dir="ltr">T+ {String(Math.floor(milestone.at/60)).padStart(2,'0')}:{String(milestone.at%60).padStart(2,'0')}</b>
                </div>;
              })}
            </div>}
          </section>}
          {radio&&<section className="mission-panel" role="status" data-testid="text-mission-radio"><div className="mission-kicker"><Radio size={13}/> {controls.controlCenter}</div><p className="mission-copy" style={{marginTop:8}}>{radio}</p></section>}
        </aside>
        <section className="mission-view mission-glass" aria-label={sim.title}>
          {phase==='ready'&&<div className="mission-center-action">
            <button className="mission-button primary" type="button" onClick={startCountdown} disabled={startPanelLeaving} data-testid="button-start-countdown"><Rocket size={19}/>{controls.startCountdown}</button>
            <span>{controls.allSystemsReady}</span>
          </div>}
          {phase==='countdown'&&<div className="mission-center-countdown" aria-live="assertive" data-testid="text-countdown">
            <strong>{Math.max(0,countdown)}</strong>
          </div>}
           {firstPerson&&<div className={`mission-cockpit${phase==='countdown'||phase==='ascent'?' is-vibrating':''}`} aria-hidden="true"/>}
           {phase==='ascent'&&<div className="mission-atmosphere-pass" aria-hidden="true" style={{opacity:Math.max(0,1-Math.abs((phaseSeconds-232)/18))*.72}}/>}
             <div className="mission-view-meta"><span className="mission-chip">{labels[phase].toUpperCase()}</span><span className="mission-chip">{paused?controls.paused:controls.liveTelemetry}</span>{!firstPerson&&<span className="mission-chip camera-help" dir={direction}>{controls.dragCamera}</span>}</div>
          <div className="mission-hud">
             <div className="mission-hud-note"><small>{controls.controlCenter} · 2026</small>{phase==='orbit'?sim.radio.exploreMoon:radio||controls.flightStable}</div>
             <div className="mission-camera" role="group" aria-label={controls.camera}>
               <button type="button" onClick={()=>setFirstPerson(false)} aria-pressed={!firstPerson} data-testid="button-camera-third">{controls.thirdPerson}</button>
               <button type="button" onClick={()=>setFirstPerson(true)} aria-pressed={firstPerson} data-testid="button-camera-first">{controls.firstPerson}</button>
            </div>
          </div>
          {phase==='surface'&&<div className="mission-touch" aria-label={controls.moveAstronaut}>
            <button className="mission-button" type="button" onClick={()=>goWalk(16)} aria-label={controls.moveForward} data-testid="button-move-forward"><ArrowUp size={18}/></button>
            <button className="mission-button" type="button" onClick={jump} aria-label={controls.jump} data-testid="button-lunar-jump">{controls.jump}</button>
            <button className="mission-button" type="button" onClick={()=>goWalk(22)} aria-label={controls.moveTowardFlag} data-testid="button-move-flag"><Flag size={16}/></button>
          </div>}
          {phase==='finish'&&<div className="mission-success">
            <div className="mission-success-card mission-panel">
              <div className="mission-kicker" style={{justifyContent:'center'}}>{controls.missionComplete}</div>
              <h2 data-testid="heading-mission-success">{controls.success}</h2>
              <p>{sim.controls.successCopy(plantedName||controls.emptyAstronaut)}</p>
              <div className="mission-readouts">
                <div className="mission-readout"><span className="mission-readout-label">{controls.finishElapsed}</span><span className="mission-readout-value" data-testid="text-finish-elapsed">{Math.floor(missionSeconds/60)} {controls.units.minute}</span></div>
                 <div className="mission-readout"><span className="mission-readout-label">{controls.distance}</span><span className="mission-readout-value" data-testid="text-finish-distance">{distanceFromEarth.toLocaleString(language==='ar'?'ar-SA':'en-US')} {controls.units.km}</span></div>
                <div className="mission-readout" style={{gridColumn:'1/-1'}}><span className="mission-readout-label">{controls.astronaut}</span><span className="mission-readout-value" data-testid="text-finish-name">{plantedName}</span></div>
              </div>
              <div className="mission-success-actions">
                <button className="mission-button primary" type="button" onClick={restart} data-testid="button-replay"><RotateCcw size={16}/>{controls.replay}</button>
                <button className="mission-button" type="button" onClick={onBackHome} data-testid="button-finish-home"><Home size={16}/>{controls.home}</button>
              </div>
            </div>
          </div>}
        </section>
      </div>
      {phase==='finish'&&<LogoFooter />}
    </main>
  );
}
