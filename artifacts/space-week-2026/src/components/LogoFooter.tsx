import { useLanguage } from '../i18n/LanguageContext';

export default function LogoFooter() {
  const { t } = useLanguage();
  return (
    <footer className="logo-footer" aria-label={t.brand.partnerLogos} data-testid="logo-footer">
      <img src="/logos/logo1.webp" alt="Ministry of Education" width="362" height="275" loading="lazy" decoding="async" />
      <img src="/logos/logo2.webp" alt="Rocket Revolution — World Space Week 2026" width="960" height="262" loading="lazy" decoding="async" />
    </footer>
  );
}
