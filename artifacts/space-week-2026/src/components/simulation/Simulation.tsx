import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, Flag, Home, Pause, Play, Radio, RotateCcw, Rocket, Settings2, Zap } from 'lucide-react';
import MissionScene, { type MissionPhase } from './MissionScene';
import LogoFooter from '../LogoFooter';
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
const phaseLabels: Record<MissionPhase, string> = {
  ready: 'منصة الإطلاق',
  countdown: 'العدّ التنازلي',
  ascent: 'الصعود إلى المدار',
  orbit: 'المدار الأرضي المنخفض',
  journey: 'العبور إلى القمر',
  landing: 'الهبوط القمري',
  surface: 'سطح القمر',
  finish: 'اكتمال المهمة',
};
const ascentMilestones = [
  { at: 0, label: 'اشتعال المحركات' },
  { at: 78, label: 'Max-Q · أقصى ضغط ديناميكي' },
  { at: 165, label: 'فصل المرحلة الأولى' },
  { at: 175, label: 'فصل برج الهروب' },
  { at: 195, label: 'إشعال المرحلة الثانية' },
  { at: 225, label: 'فصل الغطاء الانسيابي' },
  { at: 480, label: 'حرق إدخال المدار' },
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
  const orbitSkip=()=>{audio.tone(660,.24,.1);setRadio('تم تأكيد المدار. أنظمة المركبة مستقرة.');begin('orbit');};
  const triggerTli=()=>{audio.tone(330,.35,.12);audio.tone(660,.4,.07);setRadio('تم إشعال محرك المرحلة العليا. المسار إلى القمر مؤكد.');begin('journey');};

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
    if(phase==='countdown'&&phaseSeconds>=5){audio.tone(58,1.6,.08);setRadio('إشعال المحركات — انطلاق!');begin('ascent');}
    if(phase==='ascent'&&phaseSeconds>=510){setRadio('وصلنا إلى المدار الأرضي المنخفض.');begin('orbit');}
    if(phase==='ascent'&&phaseSeconds===78)setRadio('Max-Q — تجاوزنا أقصى ضغط ديناميكي. المسار مستقر.');
    if(phase==='ascent'&&phaseSeconds===165)setRadio('انفصال المرحلة الأولى. تتهيأ المرحلة الثانية للاشتعال.');
    if(phase==='ascent'&&phaseSeconds===195)setRadio('إشعال المرحلة الثانية. متابعة الصعود نحو المدار.');
    if(phase==='ascent'&&phaseSeconds===175)setRadio('انفصال برج الهروب. استمر الصعود بأمان.');
    if(phase==='ascent'&&phaseSeconds===225)setRadio('انفصال الغطاء الانسيابي.');
    if(phase==='ascent'&&phaseSeconds===480)setRadio('بدء حرق إدخال المدار الأرضي المنخفض.');
    if(phase==='journey'&&phaseSeconds===145)setRadio('بدء حرق إدخال المدار القمري. استعدوا للهبوط.');
    if(phase==='journey'&&phaseSeconds>=155){setRadio('اقتربنا من القمر. ابدأ التحضير للهبوط.');begin('landing');}
    if(phase==='landing'&&phaseSeconds>=58){setRadio('ملامسة سطح القمر. الهبوط آمن.');begin('surface');}
    if(phase==='orbit'&&phaseSeconds===2)audio.tone(880,.12,.055);
    if(phase==='journey'&&phaseSeconds===70)setRadio('رسالة منتصف الرحلة: الأرض تبتعد، والقمر يملأ النافذة.');
  },[phase,phaseSeconds,paused,audio]);

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
    if(phase==='orbit')setRadio('مهمتك الآن: استكشاف القمر 🌕');
  },[phase]);

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
    ? `DAY ${journeyDay} · ${String(journeyHour).padStart(2,'0')}h ${String(journeyMinute).padStart(2,'0')}m`
    : phase==='orbit'
      ? `T+ ${String(Math.floor(phaseSeconds/60)).padStart(2,'0')}:${String(phaseSeconds%60).padStart(2,'0')}`
      : `T+ ${String(Math.floor(missionSeconds/60)).padStart(2,'0')}:${String(missionSeconds%60).padStart(2,'0')}`;
  const countdown=5-phaseSeconds;
  const changeThrottle=(value:number)=>setThrottle(Math.max(.15,Math.min(1,value)));
  const landNow=()=>{
    if(throttle<.28&&!assisted){setRadio('زد قوة الدفع قبل الهبوط.');audio.tone(190,.22,.06);return;}
    audio.tone(520,.3,.08);setRadio('ملامسة سطح القمر — هبوط آمن.');begin('surface');
  };
  const plantFlag=(event:React.FormEvent)=>{
    event.preventDefault();const clean=name.trim().slice(0,20)||'رائد الفضاء';
    setPlantedName(clean);setFlagForm(false);audio.tone(740,.24,.07);begin('finish');
  };
  const goWalk=(step:number)=>{setWalked(v=>Math.min(100,Math.max(0,v+step)));audio.tone(210,.08,.025);};
  const jump=()=>{setJumpStarted(performance.now());audio.tone(250,.1,.035);};

  const stageTitle=phase==='orbit'?'مهمتك الآن: استكشاف القمر 🌕':phaseLabels[phase];
  const stageCopy:Record<MissionPhase,string>={
    ready:'المركبة جاهزة على منصة الإطلاق. أعدّ نفسك للرحلة من الأرض إلى سطح القمر.',
    countdown:`بدء تسلسل الإطلاق بعد ${Math.max(0,countdown)} ثوانٍ. راقب المحركات عند الصفر.`,
    ascent:'رحلة صعود حقيقية بزمن المهمة. يمكنك تخطي الصعود إلى المدار في أي لحظة.',
    orbit:'أنت في مدار أرضي منخفض. جهّز المركبة لحقن المسار نحو القمر.',
    journey:'عبور سريع عبر ثلاثة أيام من زمن المهمة. راقب الأرض وهي تصغر والقمر وهو يقترب.',
    landing:'وجّه المركبة ببطء نحو السطح. اضبط الميل والدفع أو فعّل الهبوط المساعد.',
    surface:'اخرج من المركبة واتجه إلى الموقع المحدد لرفع راية المهمة.',
    finish:`وصل ${plantedName||'رائد الفضاء'} إلى سطح القمر وأكمل المهمة بنجاح.`,
  };
  return (
    <main className={`mission-screen${phase==='countdown'&&phaseSeconds>=2&&!paused?' is-countdown':''}${phase!=='ready'&&phase!=='finish'?' is-gameplay':''}${startPanelLeaving?' is-start-leaving':''}`} dir="rtl" data-phase={phase} data-testid="page-simulation">
      <MissionScene phase={phase} phaseSeconds={phaseSeconds} missionSeconds={missionSeconds} firstPerson={firstPerson} paused={paused} quality={quality} showFps={showFps} tilt={tilt} throttle={throttle} walking={walked} jumpStarted={jumpStarted} flagName={plantedName} onLoaded={()=>setLoaded(true)} />
      {!loaded&&<div className="mission-loading" role="status" data-testid="status-simulation-loading"><span className="mission-loading-mark"/><span>تهيئة مركبة المهمة ثلاثية الأبعاد…</span></div>}
      <div className="mission-topline">
        <div><div className="mission-kicker">WORLD SPACE WEEK · LUNAR MISSION 2026</div><h1 className="mission-heading">رحلة أبولو إلى القمر</h1></div>
        <div className="mission-tools">
          {phase!=='ready'&&phase!=='finish'&&<button className="mission-button" type="button" onClick={()=>setPaused(p=>!p)} aria-pressed={paused} data-testid="button-simulation-pause">{paused?<Play size={16}/>:<Pause size={16}/>}<span>{paused?'استئناف':'إيقاف مؤقت'}</span></button>}
          <button className="mission-button mission-settings-toggle" type="button" onClick={()=>setSettingsOpen(open=>!open)} aria-label="إعدادات المحاكاة" aria-expanded={settingsOpen} data-testid="button-simulation-settings"><Settings2 size={16}/><span>الإعدادات</span></button>
        </div>
      </div>
      {settingsOpen&&<div className="mission-settings" role="group" aria-label="إعدادات المحاكاة">
        <label htmlFor="simulation-quality">جودة الرسوم</label>
        <select id="simulation-quality" className="mission-select" value={quality} onChange={event=>setQuality(event.target.value as Quality)} data-testid="select-simulation-quality">
          <option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option>
        </select>
        <label className="mission-fps-toggle"><input type="checkbox" checked={showFps} onChange={event=>setShowFps(event.target.checked)} data-testid="toggle-simulation-fps"/>إظهار عداد FPS</label>
      </div>}
      <div className="mission-body">
        <aside className="mission-side">
          <section className="mission-panel" aria-live="polite">
            <h2 className="mission-stage-name"><Rocket size={18}/>{stageTitle}</h2>
            <p className="mission-copy">{stageCopy[phase]}</p>
            <div className="mission-progress" aria-label="تقدم المرحلة"><i style={{width:`${Math.max(phase==='ready'?0:4,phaseProgress*100)}%`}}/></div>
            <div className="mission-stage-controls">
              {phase==='ascent'&&<button className="mission-button purple" type="button" onClick={orbitSkip} data-testid="button-skip-to-orbit"><Zap size={16}/>Skip to orbit · تخطّي إلى المدار</button>}
              {phase==='orbit'&&(orbitReady
                ? <button className="mission-button primary" type="button" onClick={triggerTli} data-testid="button-tli">Trans-Lunar Injection – انطلق نحو القمر</button>
                : <p className="mission-orbit-hold" role="status" data-testid="text-orbit-hold">إكمال دورتين ونصف حول الأرض · {phaseSeconds}/45 ثانية</p>)}
              {phase==='landing'&&<>
                <div className="mission-stage-controls">
                  <button className="mission-button" type="button" onClick={()=>setTilt(v=>Math.max(-.55,v-.12))} aria-label="إمالة المركبة يساراً" data-testid="button-tilt-left"><ArrowDown size={15}/>إمالة يسار</button>
                  <button className="mission-button" type="button" onClick={()=>setTilt(v=>Math.min(.55,v+.12))} aria-label="إمالة المركبة يميناً" data-testid="button-tilt-right">إمالة يمين<ArrowUp size={15}/></button>
                </div>
                <label className="mission-copy" htmlFor="landing-throttle">قوة الدفع · {Math.round(throttle*100)}%</label>
                <input id="landing-throttle" className="mission-input" type="range" min=".15" max="1" step=".01" value={throttle} onChange={e=>changeThrottle(Number(e.target.value))} aria-label="قوة دفع الهبوط" data-testid="input-landing-throttle"/>
                <button className={`mission-button ${assisted?'primary':'purple'}`} type="button" onClick={()=>setAssisted(v=>!v)} aria-pressed={assisted} data-testid="button-assisted-landing">{assisted?'الهبوط المساعد: يعمل':'تفعيل الهبوط المساعد'}</button>
                <button className="mission-button primary" type="button" onClick={landNow} data-testid="button-confirm-landing">تأكيد الهبوط</button>
              </>}
              {phase==='surface'&&<div className="mission-stage-controls">
                {!flagForm?<button className="mission-button primary" type="button" onClick={()=>setFlagForm(true)} disabled={walked<95} aria-describedby="flag-site-status" data-testid="button-open-flag-form"><Flag size={16}/>ارفع العلم</button>:<form className="mission-form" onSubmit={plantFlag}>
                  <input className="mission-input" value={name} onChange={e=>setName(e.target.value.slice(0,20))} maxLength={20} minLength={1} required autoFocus placeholder="اسم رائد الفضاء" aria-label="اسم رائد الفضاء" data-testid="input-astronaut-name"/>
                  <button className="mission-button primary" type="submit" disabled={!name.trim()} data-testid="button-plant-flag">اغرس العلم</button>
                </form>}
                <span id="flag-site-status" className="mission-stage-status">{flagForm?`${name.length}/20`:walked<95?'اتجه إلى الموقع المحدد لفتح العلم':`موقع العلم · ${walked}%`}</span>
              </div>}
            </div>
            <div className="mission-readouts">
              <div className="mission-readout"><span className="mission-readout-label">MISSION ELAPSED</span><span className="mission-readout-value" data-testid="text-mission-time">{Math.floor(missionSeconds/60)}:{String(missionSeconds%60).padStart(2,'0')}</span></div>
              <div className="mission-readout"><span className="mission-readout-label">MISSION CLOCK</span><span className="mission-readout-value" data-testid="text-mission-clock">{missionTime}</span></div>
              {phase!=='ready'&&phase!=='countdown'&&<div className="mission-readout"><span className="mission-readout-label">ALTITUDE</span><span className="mission-readout-value" data-testid="text-altitude">{phase==='landing'?altitude.toFixed(1):altitude} km</span></div>}
              {phase!=='ready'&&phase!=='countdown'&&<div className="mission-readout"><span className="mission-readout-label">VELOCITY</span><span className="mission-readout-value" data-testid="text-speed">{speed.toLocaleString('en-US')} km/h</span></div>}
              {phase==='landing'&&<div className="mission-readout"><span className="mission-readout-label">VERT SPEED / FUEL</span><span className="mission-readout-value" data-testid="text-landing-speed">{Math.round((1-phaseProgress)*18)} m/s · {fuelPercent}%</span></div>}
              {phase==='journey'&&<>
                <div className="mission-readout"><span className="mission-readout-label">EARTH DISTANCE</span><span className="mission-readout-value" data-testid="text-distance-from-earth">{distanceFromEarth.toLocaleString('en-US')} km</span></div>
                <div className="mission-readout"><span className="mission-readout-label">MOON RANGE</span><span className="mission-readout-value" data-testid="text-distance-to-moon">{distanceToMoon.toLocaleString('en-US')} km</span></div>
              </>}
              {(phase==='journey'||phase==='surface'||phase==='finish')&&<div className="mission-readout"><span className="mission-readout-label">DISTANCE TRAVELLED</span><span className="mission-readout-value" data-testid="text-distance">{distanceFromEarth.toLocaleString('en-US')} km</span></div>}
            </div>
          </section>
          {(phase==='ascent'||phase==='orbit')&&<section className="mission-panel">
            <div className="mission-kicker"><Activity size={13}/> FLIGHT DYNAMICS</div>
            <p className="mission-copy" style={{marginTop:8}}>{phase==='ascent'?(ascentMilestones.filter(item=>item.at<=phaseSeconds).at(-1)?.label??'استعداد للإقلاع'):'Telemetry link nominal · all systems green'}</p>
            {phase==='ascent'&&<div className="mission-readout" style={{marginTop:12}}><span className="mission-readout-label">MAX-Q</span><span className="mission-readout-value" data-testid="text-max-q">{phaseSeconds>=78?'PASSED':'T+ 01:18 · 33.4 kPa'}</span></div>}
            {phase==='ascent'&&<div className="mission-timeline" aria-label="مراحل الصعود">
              {ascentMilestones.map((milestone,index)=>{
                const current=phaseSeconds>=milestone.at&&(index===ascentMilestones.length-1||phaseSeconds<ascentMilestones[index+1].at);
                const done=phaseSeconds>=milestone.at;
                return <div className={`mission-timeline-item${done?' done':''}${current?' current':''}`} key={milestone.at} data-testid={`milestone-${milestone.at}`}>
                  <i aria-hidden="true"/><span dir={milestone.label.startsWith('Max-Q')?'ltr':'rtl'}>{milestone.label}</span><b dir="ltr">T+ {String(Math.floor(milestone.at/60)).padStart(2,'0')}:{String(milestone.at%60).padStart(2,'0')}</b>
                </div>;
              })}
            </div>}
          </section>}
          {radio&&<section className="mission-panel" role="status" data-testid="text-mission-radio"><div className="mission-kicker"><Radio size={13}/> MISSION CONTROL</div><p className="mission-copy" style={{marginTop:8}}>{radio}</p></section>}
        </aside>
        <section className="mission-view mission-glass" aria-label="مشهد الرحلة الفضائية">
          {phase==='ready'&&<div className="mission-center-action">
            <button className="mission-button primary" type="button" onClick={startCountdown} disabled={startPanelLeaving} data-testid="button-start-countdown"><Rocket size={19}/>اضغط لبدء العد التنازلي</button>
            <span>مركز التحكم · جميع الأنظمة جاهزة</span>
          </div>}
          {phase==='countdown'&&<div className="mission-center-countdown" aria-live="assertive" data-testid="text-countdown">
            <strong>{Math.max(0,countdown)}</strong>
          </div>}
           {firstPerson&&<div className={`mission-cockpit${phase==='countdown'||phase==='ascent'?' is-vibrating':''}`} aria-hidden="true"/>}
           {phase==='ascent'&&<div className="mission-atmosphere-pass" aria-hidden="true" style={{opacity:Math.max(0,1-Math.abs((phaseSeconds-232)/18))*.72}}/>}
            <div className="mission-view-meta"><span className="mission-chip">{phaseLabels[phase].toUpperCase()}</span><span className="mission-chip">{paused?'PAUSED':'LIVE TELEMETRY'}</span>{!firstPerson&&<span className="mission-chip camera-help" dir="rtl">اسحب للتدوير · قرّب إصبعين للتكبير</span>}</div>
          <div className="mission-hud">
            <div className="mission-hud-note"><small>MISSION CONTROL · 2026</small>{phase==='orbit'?'مهمتك الآن: استكشاف القمر 🌕':radio||'أنظمة الرحلة مستقرة — استمر في المهمة'}</div>
            <div className="mission-camera" role="group" aria-label="اختيار الكاميرا">
              <button type="button" onClick={()=>setFirstPerson(false)} aria-pressed={!firstPerson} data-testid="button-camera-third">Third person</button>
              <button type="button" onClick={()=>setFirstPerson(true)} aria-pressed={firstPerson} data-testid="button-camera-first">First person</button>
            </div>
          </div>
          {phase==='surface'&&<div className="mission-touch" aria-label="حركة رائد الفضاء">
            <button className="mission-button" type="button" onClick={()=>goWalk(16)} aria-label="تحرك للأمام" data-testid="button-move-forward"><ArrowUp size={18}/></button>
            <button className="mission-button" type="button" onClick={jump} aria-label="اقفز" data-testid="button-lunar-jump">قفز</button>
            <button className="mission-button" type="button" onClick={()=>goWalk(22)} aria-label="تحرك نحو العلم" data-testid="button-move-flag"><Flag size={16}/></button>
          </div>}
          {phase==='finish'&&<div className="mission-success">
            <div className="mission-success-card mission-panel">
              <div className="mission-kicker" style={{justifyContent:'center'}}>MISSION COMPLETE · 2026</div>
              <h2 data-testid="heading-mission-success">تمت المهمة بنجاح! 🎉</h2>
              <p>زرعت {plantedName||'رائد الفضاء'} راية المهمة على سطح القمر. أثرٌ صغير، وخطوة عظيمة.</p>
              <div className="mission-readouts">
                <div className="mission-readout"><span className="mission-readout-label">ELAPSED</span><span className="mission-readout-value" data-testid="text-finish-elapsed">{Math.floor(missionSeconds/60)} min</span></div>
                 <div className="mission-readout"><span className="mission-readout-label">DISTANCE</span><span className="mission-readout-value" data-testid="text-finish-distance">{distanceFromEarth.toLocaleString('en-US')} km</span></div>
                <div className="mission-readout" style={{gridColumn:'1/-1'}}><span className="mission-readout-label">ASTRONAUT</span><span className="mission-readout-value" data-testid="text-finish-name">{plantedName}</span></div>
              </div>
              <div className="mission-success-actions">
                <button className="mission-button primary" type="button" onClick={restart} data-testid="button-replay"><RotateCcw size={16}/>العب مرة أخرى</button>
                <button className="mission-button" type="button" onClick={onBackHome} data-testid="button-finish-home"><Home size={16}/>الرئيسية</button>
              </div>
            </div>
          </div>}
        </section>
      </div>
      {phase==='finish'&&<LogoFooter />}
    </main>
  );
}
