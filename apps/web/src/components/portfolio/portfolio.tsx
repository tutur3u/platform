import { ArrowUpRight, Code2 } from '@tuturuuu/icons/lucide';
import Image from 'next/image';
import type messages from '../../../messages/en.json';
import {
  type CapabilityCopy,
  MeetScene,
  TaskScene,
} from '../capabilities/product-scenes';
import type { VisualCopy } from '../pitch/diagram-primitives';
import { pitchBrandStyle, pitchTone } from '../pitch/pitch-brand';
import { SceneGeometry } from '../pitch/scene-geometry';
import styles from './portfolio.module.css';
import { PortfolioAtlas } from './portfolio-atlas';
import { EcosystemDirectory, type PortfolioApp } from './portfolio-directory';
import researchStyles from './portfolio-research.module.css';
import {
  PortfolioHero,
  PortfolioJourney,
  PortfolioObservatory,
} from './portfolio-starward';
import { PortfolioSuite } from './portfolio-suite';

export type PortfolioCopy = typeof messages.portfolio;

export function Portfolio({
  copy,
  capabilities,
  apps,
  locale,
  visuals,
}: {
  copy: PortfolioCopy;
  capabilities: CapabilityCopy;
  apps: PortfolioApp[];
  locale: string;
  visuals: VisualCopy;
}) {
  const t = copy;
  return (
    <div className={styles.portfolio} style={pitchBrandStyle}>
      <header className={styles.header}>
        <a href={`/${locale}`} className={styles.brand}>
          <Image
            src="/media/branding/tuturuuu.svg"
            width={30}
            height={30}
            alt=""
          />
          Tuturuuu
        </a>
        <nav aria-label={t.eyebrow}>
          <a href="#ecosystem">{t.explore}</a>
          <a href={`/${locale}/pitch`}>{t.pitch}</a>
          <a href="mailto:contact@tuturuuu.com">
            {t.contact}
            <ArrowUpRight size={15} />
          </a>
        </nav>
      </header>
      <main>
        <PortfolioHero copy={t} />
        <div className={styles.ticker} aria-hidden="true">
          {t.ticker.map((word, i) => (
            <span style={pitchTone(i)} key={word}>
              <i />
              {word}
            </span>
          ))}
        </div>
        <PortfolioJourney copy={t} />
        <section id="work" className={styles.work}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>01 / {t.work}</p>
            <h2>{t.workIntro}</h2>
          </div>
          <article className={styles.caseStudy}>
            <div className={styles.caseCopy}>
              <span className={styles.caseNumber}>01</span>
              <p className={styles.eyebrow}>TASKS × CALENDAR</p>
              <h3>{t.taskTitle}</h3>
              <p>{t.taskBody}</p>
              <div className={styles.caseLinks}>
                <a href={`/${locale}/products/tasks`}>
                  {t.openProduct}
                  <ArrowUpRight size={16} />
                </a>
                <a href="https://docs.tuturuuu.com/platform/features/smart-scheduling/overview">
                  {t.readDocs}
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
            <div className={styles.taskStage}>
              <TaskScene copy={capabilities} />
            </div>
          </article>
          <article className={`${styles.caseStudy} ${styles.meetCase}`}>
            <div className={styles.meetStage}>
              <MeetScene copy={capabilities} />
            </div>
            <div className={styles.caseCopy}>
              <span className={styles.caseNumber}>02</span>
              <p className={styles.eyebrow}>MEET × MIRA</p>
              <h3>{t.meetTitle}</h3>
              <p>{t.meetBody}</p>
              <div className={styles.caseLinks}>
                <a href="https://meet.tuturuuu.com">
                  {t.openProduct}
                  <ArrowUpRight size={16} />
                </a>
                <a href="https://docs.tuturuuu.com/platform/features/meet-live-assistants">
                  {t.readDocs}
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
          </article>
        </section>
        <PortfolioSuite copy={t.suite} visuals={visuals} />
        <PortfolioAtlas copy={t} apps={apps} />
        <section id="ecosystem" className={styles.ecosystem}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>02 / {t.explore}</p>
            <h2>{t.ecosystem}</h2>
            <p>{t.ecosystemBody}</p>
          </div>
          <EcosystemDirectory apps={apps} copy={copy} />
        </section>
        <section className={styles.engineering}>
          <div className={styles.engineeringIntro}>
            <p className={styles.eyebrow}>03 / TUTURUUU {t.technology}</p>
            <h2>{t.engineering}</h2>
            <p>{t.engineeringBody}</p>
            <a href="https://github.com/tutur3u/platform">
              <Code2 size={18} />
              {t.source}
              <ArrowUpRight size={16} />
            </a>
            <div className={styles.stack} aria-hidden="true">
              <svg viewBox="0 0 600 380" fill="none" aria-hidden="true">
                <SceneGeometry copy={visuals} id="architecture" />
              </svg>
            </div>
          </div>
          <div className={styles.layers}>
            {t.layers.map((layer, i) => (
              <article style={pitchTone(i)} key={layer.title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{layer.title}</h3>
                  <p>{layer.detail}</p>
                </div>
                <ArrowUpRight size={20} />
              </article>
            ))}
          </div>
        </section>
        <section className={styles.research}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>04 / R&amp;D</p>
            <h2>{t.research}</h2>
            <p>{t.researchBody}</p>
          </div>
          <div className={researchStyles.researchAreas}>
            {t.researchAreas.map((area, i) => (
              <article key={area.title} style={pitchTone(i)}>
                <svg viewBox="0 0 600 380" fill="none" aria-hidden="true">
                  <SceneGeometry
                    copy={visuals}
                    id={['capacity', 'context', 'skills', 'research'][i]!}
                  />
                </svg>
                <span>0{i + 1}</span>
                <h3>{area.title}</h3>
                <p>{area.detail}</p>
              </article>
            ))}
          </div>
          <p className={researchStyles.researchNote}>{t.researchNote}</p>
          <div className={researchStyles.process}>
            <h3>{t.processTitle}</h3>
            <ol>
              {t.process.map((step, i) => (
                <li key={step} style={pitchTone(i)}>
                  <span>0{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <p>{t.deliverables}</p>
          </div>
        </section>
        <PortfolioObservatory copy={t} />
        <section className={styles.closing}>
          <div>
            <p className={styles.eyebrow}>TUTURUUU / {t.next}</p>
            <h2>{t.closing}</h2>
            <p>{t.closingBody}</p>
            <a className={styles.cta} href="mailto:contact@tuturuuu.com">
              {t.contact}
              <ArrowUpRight size={20} />
            </a>
          </div>
          <svg viewBox="0 0 600 380" fill="none" aria-hidden="true">
            <SceneGeometry copy={visuals} id="closing" />
          </svg>
        </section>
      </main>
      <footer className={styles.footer}>
        <a href={`/${locale}`}>Tuturuuu</a>
        <a href={`/${locale}/pitch`}>{t.pitch} ↗</a>
        <span>contact@tuturuuu.com</span>
      </footer>
    </div>
  );
}
