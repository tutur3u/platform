/** EduFest workshop page: the tools strip and the FAQ. */
import { ChevronDown } from '@tuturuuu/icons';
// A 96px downscale of the official mark (assets/upskii-official-logo.png):
// it renders at 16-40px, so the 998px original only cost page weight.
import upskiiLogo from '../../assets/upskii-logo-96.png?no-inline';
import { FAQ, TOOLS } from '../../content/workshops/edufest-2026';
import { type EduMessages, UPSKII_URL, UpskiiLink, UpskiiText } from './shared';

export function WsTools({ t, logo }: { t: EduMessages; logo: string }) {
  return (
    <section className="section ws-tools" aria-labelledby="ws-tools">
      <header className="section-head">
        <h2 id="ws-tools">{t.tools.title}</h2>
        <p>
          <UpskiiText text={t.tools.subtitle} />
        </p>
      </header>
      <div className="ws-brands">
        <div className="ws-brand">
          <img src={logo} alt="" width={40} height={40} />
          <div>
            <strong>Tuturuuu</strong>
            <p>{t.tools.tuturuuuBlurb}</p>
          </div>
        </div>
        <a
          className="ws-brand ws-brand-link"
          href={UPSKII_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src={upskiiLogo} alt="" width={40} height={40} loading="lazy" />
          <div>
            <strong>Upskii</strong>
            <p>{t.tools.upskiiBlurb}</p>
            <span className="ws-brand-cta">upskii.com ↗</span>
          </div>
        </a>
      </div>
      <ul className="ws-tool-list">
        {TOOLS.map((tool) => (
          <li key={tool} className="ws-tool">
            {tool === 'upskii' ? (
              <UpskiiLink>{t.tools.names.upskii}</UpskiiLink>
            ) : (
              t.tools.names[tool]
            )}
          </li>
        ))}
      </ul>
      <a className="text-button" href="/roadmap">
        {t.tools.roadmap}
      </a>
    </section>
  );
}

export function WsFaq({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-faq">
      <header className="section-head">
        <h2 id="ws-faq">{t.faq.title}</h2>
      </header>
      <div className="ws-faq">
        {FAQ.map((id) => (
          <details key={id} className="ws-faq-item">
            <summary>
              <span>{t.faq.items[id].q}</span>
              <ChevronDown size={18} aria-hidden className="ws-faq-icon" />
            </summary>
            <div className="ws-faq-answer">
              <p>{t.faq.items[id].a}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
