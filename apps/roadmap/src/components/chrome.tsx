import { Moon, RefreshCw, Sun } from '@tuturuuu/icons';
import { useEffect, useState } from 'react';
import { REPO_URL } from '../live/model';
import type { LiveState } from '../live/use-live-data';
import { formatDate, type Lang, type Messages, relative } from './shared';

export function ThemeToggle({ label }: { label: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggle = () => {
    const next = !dark;
    const root = document.documentElement;
    root.classList.toggle('dark', next);
    root.classList.toggle('light', !next);
    root.style.colorScheme = next ? 'dark' : 'light';
    try {
      window.localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // Storage can be unavailable; the toggle still applies to this view.
    }
    setDark(next);
  };
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}

export function FreshnessPill({
  t,
  lang,
  state,
  generatedAt,
  now,
  mounted,
  onRefresh,
}: {
  t: Messages;
  lang: Lang;
  state: LiveState;
  generatedAt: string;
  now: number;
  mounted: boolean;
  onRefresh: () => void;
}) {
  const label =
    state === 'live'
      ? t.fresh.live
      : state === 'refreshing'
        ? t.fresh.refreshing
        : state === 'failed'
          ? t.fresh.failed
          : t.fresh.snapshot;
  const when = mounted
    ? relative(generatedAt, now, lang)
    : `${formatDate(generatedAt, lang, true)} (UTC+7)`;
  return (
    <div className={`freshness ${state}`} role="status" aria-live="polite">
      <span className="pulse" aria-hidden />
      <strong>{label}</strong>
      <span className="freshness-time">
        {state === 'failed' ? t.fresh.showing : t.fresh.updated}{' '}
        <time
          dateTime={generatedAt}
          title={formatDate(generatedAt, lang, true)}
        >
          {when}
        </time>
      </span>
      <button
        type="button"
        className="icon-button small"
        onClick={onRefresh}
        disabled={state === 'refreshing'}
        aria-label={t.fresh.refresh}
        title={t.fresh.refresh}
      >
        <RefreshCw
          size={14}
          aria-hidden
          className={state === 'refreshing' ? 'spin' : ''}
        />
      </button>
    </div>
  );
}

export function Footer({
  t,
  data,
}: {
  t: Messages;
  data: { generatedAt: string };
}) {
  const sha = __ROADMAP_BUILD_SHA__;
  return (
    <div className="footer-inner">
      <p>{t.footer}</p>
      <p>
        <a href={REPO_URL}>GitHub</a>
        {/^[a-f0-9]{40}$/.test(sha) ? (
          <>
            {' · '}
            {t.build}{' '}
            <a href={`${REPO_URL}/commit/${sha}`}>
              <code>{sha.slice(0, 7)}</code>
            </a>
          </>
        ) : null}
        <span className="sr-only"> {data.generatedAt}</span>
      </p>
    </div>
  );
}
