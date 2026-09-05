import { useState } from 'react';
import { useCopy } from './i18n';
import './landing.css';

export function LandingPreview() {
  const c = useCopy();
  const [refined, setRefined] = useState(false);
  return (
    <section
      className="preview-section"
      id="explore"
      aria-labelledby="preview-title"
    >
      <div className="preview-heading">
        <p className="eyebrow">{c.previewEyebrow}</p>
        <h2 id="preview-title">{c.previewTitle}</h2>
        <p>{c.previewIntro}</p>
      </div>
      <div className="prompt-experiment">
        <div className="experiment-input">
          <div className="experiment-label">
            <span>01</span>
            {c.systemPrompt}
          </div>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={!refined}
              onClick={() => setRefined(false)}
            >
              {c.firstDraft}
            </button>
            <button
              type="button"
              aria-pressed={refined}
              onClick={() => setRefined(true)}
            >
              {c.betterDraft}
            </button>
          </div>
          <blockquote>{refined ? c.refinedPrompt : c.roughPrompt}</blockquote>
          <p className="fine-print">{c.previewDisclaimer}</p>
        </div>
        <div className="experiment-result" aria-live="polite">
          <div className="experiment-label">
            <span>02</span>
            {c.agentBehavior}
          </div>
          <div className="trace-line">
            <span className="trace-dot" />
            <strong>Google Drive</strong>
            <span>{c.readBrief}</span>
          </div>
          <div className="trace-line">
            <span className="trace-dot" />
            <strong>Google Calendar</strong>
            <span>{refined ? c.checkConflict : c.skipConflict}</span>
          </div>
          <div className={`example-outcome ${refined ? 'refined' : ''}`}>
            <span>{refined ? c.approvalFirst : c.missingBoundary}</span>
            <p>{refined ? c.refinedResult : c.roughResult}</p>
          </div>
          <div className="skill-strip">
            <span>SKILL.md</span>
            <code>
              {refined ? 'coordinate-with-approval' : 'launch-helper'}
            </code>
          </div>
        </div>
      </div>
    </section>
  );
}

export function WorkshopDetails() {
  const c = useCopy();
  return (
    <section className="workshop-details">
      <div className="detail-lead">
        <p className="eyebrow">{c.facilitatorEyebrow}</p>
        <h2>{c.facilitatorTitle}</h2>
        <p>{c.facilitatorIntro}</p>
        <a href="#join" className="button primary">
          {c.startTogether} <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="detail-grid">
        {[
          [c.detailPrivate, c.detailPrivateText],
          [c.detailPractice, c.detailPracticeText],
          [c.detailShowcase, c.detailShowcaseText],
          [c.detailTakeaway, c.detailTakeawayText],
        ].map(([title, body], index) => (
          <article key={title}>
            <span className="detail-number">0{index + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
