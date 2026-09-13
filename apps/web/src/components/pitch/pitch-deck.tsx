'use client';

import {
  ArrowLeft,
  ArrowRight,
  Expand,
  Grid2X2,
  NotebookPen,
  Pause,
  Play,
  Printer,
  Sparkles,
} from '@tuturuuu/icons/lucide';
import { useLocale } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './pitch.module.css';
import { type PitchCopy, SLIDE_IDS, slideFromHash } from './pitch-model';
import { PitchVisual } from './pitch-visual';

export function PitchDeck({ copy }: { copy: PitchCopy }) {
  const locale = useLocale();
  const [index, setIndex] = useState(0);
  const [overview, setOverview] = useState(false);
  const [notes, setNotes] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const overviewButton = useRef<HTMLButtonElement>(null);
  const go = useCallback((next: number, focus = false) => {
    const bounded = Math.max(0, Math.min(SLIDE_IDS.length - 1, next));
    setIndex(bounded);
    window.history.replaceState(null, '', `#${SLIDE_IDS[bounded]}`);
    setOverview(false);
    if (focus) requestAnimationFrame(() => title.current?.focus());
  }, []);

  useEffect(() => {
    const sync = () => setIndex(slideFromHash(window.location.hash));
    const screen = () => setFullscreen(Boolean(document.fullscreenElement));
    sync();
    window.addEventListener('hashchange', sync);
    document.addEventListener('fullscreenchange', screen);
    return () => {
      window.removeEventListener('hashchange', sync);
      document.removeEventListener('fullscreenchange', screen);
    };
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === 'Escape') {
        setOverview(false);
        setNotes(false);
        setPlaying(false);
        overviewButton.current?.focus();
        return;
      }

      if (
        target.closest(
          'input, textarea, select, button, a, [contenteditable="true"]'
        )
      )
        return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const navigation: Record<string, number> = {
        ArrowRight: index + 1,
        ArrowDown: index + 1,
        ArrowLeft: index - 1,
        ArrowUp: index - 1,
        Home: 0,
        End: SLIDE_IDS.length - 1,
      };
      if (event.key in navigation) {
        event.preventDefault();
        setPlaying(false);
        go(navigation[event.key] ?? 0, true);
      } else if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [index, go]);

  useEffect(() => {
    if (!playing || overview) return;
    if (index === SLIDE_IDS.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => go(index + 1), 12000);
    const pauseWhenHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, [playing, overview, index, go]);

  async function toggleFullscreen() {
    setError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen)
        await root.current.requestFullscreen();
      else setError(copy.fullscreenError);
    } catch {
      setError(copy.fullscreenError);
    }
  }
  async function celebrate() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { default: confetti } = await import('canvas-confetti');
    const canvas = document.createElement('canvas');
    canvas.className = styles.confetti ?? '';
    root.current?.append(canvas);
    const burst = confetti.create(canvas, { resize: true });
    try {
      await burst({
        particleCount: 140,
        spread: 100,
        origin: { y: 0.65 },
        disableForReducedMotion: true,
      });
    } finally {
      burst.reset();
      canvas.remove();
    }
  }
  const id = SLIDE_IDS[index] ?? 'opening';
  return (
    <div className={styles.deck} ref={root}>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copy.slide} {index + 1} / {SLIDE_IDS.length}: {copy.slides[id].title}
      </span>
      <header className={styles.header}>
        <a href={`/${locale}`} className={styles.brand}>
          tuturuuu
        </a>
        <span className={styles.edition}>{copy.edition}</span>
        <div className={styles.tools}>
          <button
            ref={overviewButton}
            type="button"
            title={copy.overview}
            aria-label={copy.overview}
            aria-expanded={overview}
            aria-controls="pitch-overview"
            onClick={() => {
              setOverview(!overview);
              setPlaying(false);
            }}
          >
            <Grid2X2 size={18} />
          </button>
          <button
            type="button"
            title={copy.notes}
            aria-label={copy.notes}
            aria-expanded={notes}
            onClick={() => {
              setNotes(!notes);
              setPlaying(false);
            }}
          >
            <NotebookPen size={18} />
          </button>
          <button
            type="button"
            title={copy.print}
            aria-label={copy.print}
            onClick={() => {
              setPlaying(false);
              window.print();
            }}
          >
            <Printer size={18} />
          </button>
          <button
            type="button"
            title={fullscreen ? copy.exitFullscreen : copy.fullscreen}
            aria-label={fullscreen ? copy.exitFullscreen : copy.fullscreen}
            onClick={toggleFullscreen}
          >
            <Expand size={18} />
          </button>
        </div>
      </header>
      {error && <p role="status">{error}</p>}
      {overview && (
        <nav
          id="pitch-overview"
          className={styles.overview}
          aria-label={copy.overview}
        >
          {SLIDE_IDS.map((slideId, i) => (
            <button
              key={slideId}
              type="button"
              aria-current={i === index ? 'step' : undefined}
              onClick={() => go(i, true)}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              {copy.slides[slideId].kicker}
            </button>
          ))}
        </nav>
      )}
      <main className={styles.main}>
        {SLIDE_IDS.map((slideId, i) => {
          const slide = copy.slides[slideId];
          return (
            <section
              key={slideId}
              className={`${styles.slide} ${i === index ? styles.active : ''}`}
              aria-hidden={i !== index}
              aria-label={`${copy.slide} ${i + 1}: ${slide.kicker}`}
            >
              <div className={styles.story}>
                <p className={styles.eyebrow}>
                  <span>{String(i + 1).padStart(2, '0')}</span> {slide.kicker}
                </p>
                <h1 ref={i === index ? title : undefined} tabIndex={-1}>
                  {slide.title}
                </h1>
                <p className={styles.body}>{slide.body}</p>
                {['pricing', 'calculator', 'ai'].includes(slideId) && (
                  <span className={styles.badge}>{copy.proposal}</span>
                )}
                {['platform', 'workflow', 'roadmap', 'business'].includes(
                  slideId
                ) && (
                  <small className={styles.disclaimer}>{copy.noClaims}</small>
                )}
                {slideId === 'closing' && (
                  <div className={styles.links}>
                    <a href={`/${locale}`}>
                      {copy.explore} <ArrowRight size={18} />
                    </a>
                    <button type="button" onClick={celebrate}>
                      <Sparkles size={18} />
                      {copy.celebrate}
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.visual}>
                <PitchVisual id={slideId} copy={copy} />
              </div>
            </section>
          );
        })}
      </main>
      {notes && (
        <aside className={styles.notes}>
          <strong>{copy.notes}</strong>
          <p>{copy.slides[id].note}</p>
        </aside>
      )}
      <footer className={styles.footer}>
        <nav
          className={styles.progress}
          aria-label={`${copy.slide} ${index + 1} / ${SLIDE_IDS.length}`}
        >
          {SLIDE_IDS.map((slideId, i) => (
            <button
              type="button"
              key={slideId}
              aria-label={`${copy.slide} ${i + 1}: ${copy.slides[slideId].kicker}`}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => {
                setPlaying(false);
                go(i, true);
              }}
            />
          ))}
        </nav>
        <span className={styles.help}>{copy.help}</span>
        <div className={styles.controls}>
          <span>
            {String(index + 1).padStart(2, '0')} / {SLIDE_IDS.length}
          </span>
          <button
            type="button"
            aria-label={playing ? copy.pause : copy.play}
            title={playing ? copy.pause : copy.play}
            onClick={() => {
              if (index === SLIDE_IDS.length - 1) go(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            type="button"
            aria-label={copy.previous}
            disabled={index === 0}
            onClick={() => {
              setPlaying(false);
              go(index - 1, true);
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <button
            type="button"
            aria-label={copy.next}
            disabled={index === SLIDE_IDS.length - 1}
            onClick={() => {
              setPlaying(false);
              go(index + 1, true);
            }}
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </footer>
    </div>
  );
}
