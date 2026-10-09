import type { Language } from '../i18n/LanguageContext';

export default function VideoLanguageToggle({
  language,
  onChange,
  label,
  arabicLabel,
  englishLabel,
}: {
  language: Language;
  onChange: (language: Language) => void;
  label: string;
  arabicLabel: string;
  englishLabel: string;
}) {
  return (
    <div className="video-language-row">
      <span className="video-language-label">{label}</span>
      <div className="video-language-toggle" role="group" aria-label={label} dir="ltr">
        <button type="button" onClick={() => onChange('ar')} aria-pressed={language === 'ar'}>{arabicLabel}</button>
        <button type="button" onClick={() => onChange('en')} aria-pressed={language === 'en'}>{englishLabel}</button>
      </div>
    </div>
  );
}
