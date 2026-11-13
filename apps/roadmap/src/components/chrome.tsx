import { Moon, Sun } from '@tuturuuu/icons';
import type { ComponentProps } from 'react';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import { useEffect, useState } from 'react';
import { REPO_URL } from '../live/model';
import { formatDate, type Lang, type Messages } from './shared';

/**
 * The shell's only image is the brand logo. Serve it from this Worker's own
 * hashed assets under /roadmap, not the apex /media path another app owns.
 */
export function MountedLogo({
  src: _remote,
  alt,
  ...props
}: ComponentProps<'img'>) {
  return <img {...props} src={logo} alt={alt ?? ''} />;
}

/** Same storage key and class contract as the shared theme provider. */
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

export function Footer({
  t,
  lang,
  data,
  liveCheckFailed,
}: {
  t: Messages;
  lang: Lang;
  data: { generatedAt: string };
  liveCheckFailed: boolean;
}) {
  const sha = __ROADMAP_BUILD_SHA__;
  return (
    <div className="footer-inner">
      <p>{t.footer}</p>
      <p>
        {liveCheckFailed ? `${t.liveCheckFailed} ` : null}
        {t.footerChecked}{' '}
        <time dateTime={data.generatedAt}>
          {formatDate(data.generatedAt, lang, true)}
        </time>
      </p>
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
      </p>
    </div>
  );
}
