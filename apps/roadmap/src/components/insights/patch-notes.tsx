import { useState } from 'react';
import { localDay } from '../../live/feed';
import type { Changelog } from '../../changelog/schema';
import { TRACK_NAMES } from '../../content/track-names';
import { REPO_URL } from '../../live/model';
import type { Lang, Messages } from '../shared';
import { fill, shortDay } from './format';

/**
 * Patch notes from the changelog pipeline, newest release first, grouped by
 * product, in the page's language. Every string renders as plain text; PR
 * links are built here from numbers. No changelog (missing or invalid):
 * nothing renders.
 */
export function PatchNotes({
  t,
  lang,
  changelog,
}: {
  t: Messages;
  lang: Lang;
  changelog: Changelog | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  if (!changelog?.releases.length) return null;
  const releases = [...changelog.releases].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const source =
    changelog.mode === 'llm'
      ? fill(t.notes.llm, { model: changelog.model ?? '' })
      : t.notes.fallback;
  return (
    <section
      className="section patch-notes"
      id="patch-notes"
      aria-labelledby="patch-notes-title"
    >
      <header className="section-head">
        <h2 id="patch-notes-title">{t.notes.title}</h2>
        <p>{t.notes.subtitle}</p>
      </header>
      <p className="notes-source">{source}</p>
      <ol className="release-list">
        {releases.map((release) => (
          <li key={release.id} className="release">
            <details
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setExpanded((current) => {
                  const next = new Set(current);
                  if (open) next.add(release.id);
                  else next.delete(release.id);
                  return next;
                });
              }}
            >
              <summary>
                <time dateTime={release.date}>
                  {shortDay(localDay(release.date), lang)}
                </time>
                <span className="release-title">{release.title[lang]}</span>
              </summary>
              {expanded.has(release.id) && (
                <>
                  <p className="release-summary">{release.summary[lang]}</p>
                  {release.products.map((product) => (
                    <div key={product.product} className="release-product">
                      <h3>{TRACK_NAMES[product.product] ?? product.product}</h3>
                      <ul>
                        {product.items.map((item) => (
                          <li key={`${item.text.en}-${item.prs.join('-')}`}>
                            {item.text[lang]}
                            {item.prs.map((number) => (
                              <a
                                key={number}
                                className="pr-link"
                                href={`${REPO_URL}/pull/${number}`}
                                aria-label={fill(t.notes.pr, { n: number })}
                              >
                                #{number}
                              </a>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
