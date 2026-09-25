'use client';

import { Check, Mic, Sparkles, Video } from '@tuturuuu/icons/lucide';
import { useState } from 'react';
import styles from './product-scenes.module.css';

export interface CapabilityCopy {
  illustration: string;
  tasks: {
    title: string;
    inbox: string;
    planned: string;
    done: string;
    action: string;
    reset: string;
    items: string[];
    suggestion: string;
    scheduled: string;
    calendar: string;
    review: string;
  };
  meet: {
    title: string;
    room: string;
    team: string;
    colleague: string;
    question: string;
    answer: string;
    action: string;
    private: string;
    shared: string;
    privacy: string;
    optIn: string;
    followup: string;
  };
}

export function TaskScene({
  copy,
  compact = false,
}: {
  copy: CapabilityCopy;
  compact?: boolean;
}) {
  const [organized, setOrganized] = useState(false);
  const t = copy.tasks;
  return (
    <figure className={styles.product} data-compact={compact}>
      <div className={styles.chrome}>
        <span className={styles.dot} /> Tuturuuu Tasks <span>↗</span>
      </div>
      <div className={styles.taskBoard}>
        <div className={styles.boardHeading}>
          <h3>{t.title}</h3>
          <Sparkles size={24} />
        </div>
        <div className={styles.columns}>
          {[t.inbox, t.planned, t.done].map((label, column) => (
            <div className={styles.column} key={label}>
              <span className={styles.columnLabel}>
                {label}{' '}
                <small>
                  {organized
                    ? column === 1
                      ? 2
                      : column === 2
                        ? 1
                        : 0
                    : column === 0
                      ? 3
                      : 0}
                </small>
              </span>
              {t.items.map(
                (item, i) =>
                  (organized ? (i === 2 ? 2 : 1) : 0) === column && (
                    <div className={styles.task} key={item}>
                      <span className={styles.taskMark}>
                        {column === 2 ? <Check size={15} /> : `0${i + 1}`}
                      </span>
                      <strong>{item}</strong>
                      <div className={styles.taskMeta}>
                        <span>{['30 min', '1 h', '45 min'][i]}</span>
                        <span className={styles.avatar}>
                          {['A', 'B', 'C'][i]}
                        </span>
                      </div>
                    </div>
                  )
              )}
              <div className={styles.dropzone} aria-hidden="true">
                +
              </div>
            </div>
          ))}
        </div>
        <div className={styles.assistant}>
          <Sparkles size={18} />
          <p aria-live="polite">{organized ? t.scheduled : t.suggestion}</p>
        </div>
        <button
          type="button"
          className={styles.action}
          onClick={() => setOrganized(!organized)}
        >
          {organized ? t.reset : t.action}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      <figcaption>{copy.illustration}</figcaption>
    </figure>
  );
}

export function MeetScene({ copy }: { copy: CapabilityCopy }) {
  const [privateMode, setPrivateMode] = useState(false);
  const [answer, setAnswer] = useState(false);
  const t = copy.meet;
  return (
    <figure className={`${styles.product} ${styles.meeting}`}>
      <div className={styles.chrome}>
        <Video size={16} /> Tuturuuu Meet <span>{t.room}</span>
      </div>
      <div className={styles.meetingBody}>
        <div className={styles.participants}>
          <div className={styles.person}>
            <div className={styles.portrait}>A</div>
            <span>{t.team}</span>
          </div>
          <div className={styles.mira}>
            <div className={styles.wave} aria-hidden="true">
              {Array.from({ length: 13 }, (_, i) => (
                <i key={i} style={{ height: `${14 + ((i * 17) % 45)}px` }} />
              ))}
            </div>
            <span>
              Mira <small>{t.colleague}</small>
            </span>
          </div>
        </div>
        <div className={styles.mode}>
          <button
            type="button"
            aria-pressed={!privateMode}
            onClick={() => setPrivateMode(false)}
          >
            {t.shared}
          </button>
          <button
            type="button"
            aria-pressed={privateMode}
            onClick={() => setPrivateMode(true)}
          >
            {t.private}
          </button>
        </div>
        <div className={styles.conversation} aria-live="polite">
          {privateMode ? (
            <p className={styles.private}>{t.privacy}</p>
          ) : (
            <>
              <p className={styles.question}>{t.question}</p>
              {answer && (
                <p className={styles.answer}>
                  <Sparkles size={16} />
                  <span>{t.answer}</span>
                </p>
              )}
              <button
                type="button"
                className={styles.action}
                onClick={() => setAnswer(!answer)}
              >
                {answer ? copy.tasks.reset : t.action}
                <span aria-hidden="true">↗</span>
              </button>
              {answer && <small>{t.privacy}</small>}
            </>
          )}
        </div>
        <div className={styles.audio}>
          <Mic size={14} />
          {t.optIn}
          <span aria-hidden="true">•••</span>
        </div>
      </div>
      <figcaption>{copy.illustration}</figcaption>
    </figure>
  );
}
