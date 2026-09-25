import type { VisualCopy } from '../pitch/diagram-primitives';
import { pitchTone } from '../pitch/pitch-brand';
import { SceneGeometry } from '../pitch/scene-geometry';
import type { PortfolioCopy } from './portfolio';
import styles from './portfolio-suite.module.css';

export function PortfolioSuite({
  copy,
  visuals,
}: {
  copy: PortfolioCopy['suite'];
  visuals: VisualCopy;
}) {
  return (
    <section className={styles.suite}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <p className={styles.body}>{copy.body}</p>
        <div className={styles.domains}>
          {copy.domains.map((domain, i) => (
            <span key={domain} style={pitchTone(i)}>
              <i />
              {domain}
            </span>
          ))}
        </div>
        <p className={styles.body}>{copy.strategy}</p>
        <p className={styles.note}>{copy.note}</p>
      </header>
      <div className={styles.scenes}>
        {copy.items.map((item, i) => (
          <article
            className={styles.scene}
            key={item.id}
            data-topic={item.id}
            style={pitchTone(i)}
          >
            <div className={styles.visual}>
              <svg
                viewBox="0 0 600 380"
                fill="none"
                role="img"
                aria-label={item.title}
              >
                <SceneGeometry id={item.id} copy={visuals} />
              </svg>
              <span className={styles.index}>0{i + 1}</span>
            </div>
            <div className={styles.copy}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <small>{item.status}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
