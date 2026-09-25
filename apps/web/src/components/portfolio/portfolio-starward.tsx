import { ArrowRight } from '@tuturuuu/icons/lucide';
import Image from 'next/image';
import { ProductMark } from '../capabilities/product-mark';
import { pitchTone } from '../pitch/pitch-brand';
import type { PortfolioCopy } from './portfolio';
import styles from './portfolio-starward.module.css';

export function PortfolioHero({ copy }: { copy: PortfolioCopy }) {
  return (
    <section className={styles.hero}>
      <Image
        src="/media/story/vietnam-starward.webp"
        alt={copy.journey.imageAlt}
        fill
        sizes="100vw"
        preload
        className={styles.heroImage}
      />
      <div className={styles.heroShade} />
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{copy.journey.eyebrow}</p>
        <h1>{copy.hero}</h1>
        <p>{copy.intro}</p>
        <a href="#work" className={styles.cta}>
          {copy.work}
          <ArrowRight size={18} />
        </a>
      </div>
      <div className={styles.heroFooter}>
        <div className={styles.productDock}>
          {['Tasks', 'Meet', 'Mira', 'Calendar', 'Rewise', 'Nova'].map(
            (name) => (
              <span key={name}>
                <ProductMark product={name} size={24} />
                {name}
              </span>
            )
          )}
        </div>
        <small>{copy.journey.artNote}</small>
      </div>
    </section>
  );
}

export function PortfolioJourney({ copy }: { copy: PortfolioCopy }) {
  return (
    <section className={styles.journey}>
      <header>
        <p className={styles.eyebrow}>{copy.journey.eyebrow}</p>
        <h2>{copy.journey.title}</h2>
        <p>{copy.journey.body}</p>
      </header>
      <div className={styles.stages}>
        {copy.journey.stages.map((stage, i) => (
          <article key={stage.title} style={pitchTone(i)}>
            <div className={styles.journeyArt} aria-hidden="true">
              <svg viewBox="0 0 320 180" fill="none" aria-hidden="true">
                {i === 0 ? (
                  <g stroke="currentColor">
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <path
                        key={n}
                        d={`M20 ${140 - n * 9} Q90 ${30 + n * 12} 160 ${95 - n * 4} T300 ${70 + n * 13}`}
                        opacity={1 - n * 0.12}
                      />
                    ))}
                    <circle cx="162" cy="72" r="7" fill="currentColor" />
                    <path d="M162 82 V155" strokeDasharray="3 5" />
                  </g>
                ) : i === 1 ? (
                  <g stroke="currentColor">
                    <circle cx="160" cy="88" r="68" />
                    <ellipse cx="160" cy="88" rx="30" ry="68" />
                    <ellipse cx="160" cy="88" rx="68" ry="25" />
                    <path d="M92 88 H228 M160 20 V156 M53 138 Q153 -30 276 84" />
                    <circle cx="218" cy="117" r="6" fill="currentColor" />
                    <circle cx="104" cy="49" r="4" fill="currentColor" />
                  </g>
                ) : (
                  <g stroke="currentColor">
                    <path d="M25 156 Q160 87 295 156 M52 166 Q160 110 267 166" />
                    <path d="M80 136 Q133 23 257 30" strokeDasharray="3 6" />
                    <path d="M245 14 V46 M229 30 H261" />
                    <circle cx="160" cy="62" r="4" fill="currentColor" />
                    <circle cx="84" cy="39" r="2" fill="currentColor" />
                    <circle cx="285" cy="79" r="2" fill="currentColor" />
                  </g>
                )}
              </svg>
            </div>
            <span className={styles.stageTag}>
              0{i + 1} / {stage.tag}
            </span>
            <h3>{stage.title}</h3>
            <p>{stage.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PortfolioObservatory({ copy }: { copy: PortfolioCopy }) {
  return (
    <section className={styles.observatory}>
      <div className={styles.observatoryCopy}>
        <p className={styles.eyebrow}>{copy.observatory.eyebrow}</p>
        <h2>{copy.observatory.title}</h2>
        <p>{copy.observatory.body}</p>
      </div>
      <figure>
        <Image
          src="/media/story/observatory.webp"
          alt={copy.observatory.alt}
          width={1672}
          height={941}
          sizes="100vw"
        />
        <figcaption>{copy.observatory.note}</figcaption>
      </figure>
    </section>
  );
}
