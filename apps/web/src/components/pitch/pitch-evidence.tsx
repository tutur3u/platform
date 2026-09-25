import { pitchTone } from './pitch-brand';
import styles from './pitch-evidence.module.css';
import type { PitchCopy, SlideId } from './pitch-model';

export const PITCH_SOURCE_URLS = [
  'https://hai.stanford.edu/ai-index/2026-ai-index-report/economy',
  'https://www.microsoft.com/en-us/worklab/work-trend-index/agents-human-agency-and-the-opportunity-for-every-organization',
  'https://www.weforum.org/publications/the-future-of-jobs-report-2025/in-full/3-skills-outlook/',
  'https://www.oecd.org/en/publications/generative-ai-and-the-sme-workforce_2d08b99d-en.html',
  'https://www.anthropic.com/research/trustworthy-agents',
  'https://github.com/tutur3u/platform',
] as const;
const slideSources: Partial<Record<SlideId, number[]>> = {
  moment: [0, 1, 2],
  workforce: [3],
  skills: [2],
  trust: [4],
  openness: [5],
  ownership: [5],
  research: [5],
};

export function PitchSourceLinks({
  id,
  copy,
}: {
  id: SlideId;
  copy: PitchCopy;
}) {
  const sources = slideSources[id];
  if (!sources) return null;
  return (
    <p className={styles.sources}>
      <span>{copy.sourceLabel}</span>
      {sources.map((i) => (
        <a
          key={i}
          href={PITCH_SOURCE_URLS[i]}
          target="_blank"
          rel="noopener noreferrer"
          title={copy.references[i]?.detail}
        >
          [{i + 1}] {copy.references[i]?.label}
        </a>
      ))}
    </p>
  );
}

export function EvidenceScene({
  id,
  copy,
}: {
  id: 'moment' | 'references';
  copy: PitchCopy;
}) {
  if (id === 'references') {
    return (
      <ol className={styles.references}>
        {copy.references.map((source, i) => (
          <li key={source.label} style={pitchTone(i)}>
            <a
              href={PITCH_SOURCE_URLS[i]}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>0{i + 1}</span>
              {source.label} ↗
            </a>
            <p>{source.detail}</p>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className={styles.statistics}>
      {copy.slides.moment.panels.map((stat, i) => (
        <figure key={stat.label} style={pitchTone(i)}>
          <div className={styles.plot} aria-hidden="true">
            {i === 0 && (
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  opacity=".1"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="var(--tone)"
                  strokeWidth="10"
                  pathLength="100"
                  strokeDasharray="88 100"
                  transform="rotate(-90 50 50)"
                />
              </svg>
            )}
            {i === 1 && (
              <div className={styles.agentDots}>
                {Array.from({ length: 15 }, (_, j) => (
                  <i key={j} />
                ))}
              </div>
            )}
            {i === 2 && (
              <div className={styles.skillsGrid}>
                {Array.from({ length: 100 }, (_, j) => (
                  <i key={j} data-highlight={j < 39} />
                ))}
              </div>
            )}
          </div>
          <strong>{stat.label}</strong>
          <figcaption>
            {stat.detail}{' '}
            <a
              href={PITCH_SOURCE_URLS[i]}
              target="_blank"
              rel="noopener noreferrer"
            >
              [{i + 1}]
            </a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
