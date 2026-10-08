import { useLocation } from 'wouter';
import { ArrowRight, type LucideIcon } from 'lucide-react';

type Props = {
  section: 'science' | 'math';
  number: string;
  title: string;
  lead: string;
  hint: string;
  icon: LucideIcon;
};

export default function SectionPlaceholder({ section, number, title, lead, hint, icon: Icon }: Props) {
  const [, setLocation] = useLocation();

  return (
    <main className="route-screen" dir="rtl" data-testid={`page-${section}`}>
      <section className="route-panel" aria-labelledby={`title-${section}`} data-testid={`panel-${section}`}>
        <div className="route-index" data-testid={`label-${section}-index`}>{number}</div>
        <div style={{ color: '#75e4ff', marginTop: 24 }} aria-hidden="true"><Icon size={34} strokeWidth={1.35} /></div>
        <h1 id={`title-${section}`} data-testid={`heading-${section}`}>{title}</h1>
        <p data-testid={`text-${section}-intro`}>{lead}</p>
        <div className="route-rule" />
        <div className="route-hint" data-testid={`status-${section}-coming-soon`}>{hint}</div>
        <button className="launch-button" type="button" style={{ marginTop: 29 }} onClick={() => setLocation('/')} data-testid="button-back-home">
          <ArrowRight size={17} />
          <span>العودة إلى البداية</span>
        </button>
      </section>
    </main>
  );
}
