import { TRACK_NAMES } from '../../content/track-names';
import type { CommitWindow } from '../../insights/commits';
import { formatDate, type Lang, type Messages } from '../shared';

export function CommitSummary({
  t,
  lang,
  commits,
  checkedAt,
}: {
  t: Messages;
  lang: Lang;
  commits: CommitWindow;
  checkedAt: string;
}) {
  const total = commits.days.reduce((sum, day) => sum + day[1], 0);
  const products = new Map<string, number>();
  for (const [, index, count] of commits.products) {
    const track = commits.tracks[index];
    products.set(track, (products.get(track) ?? 0) + count);
  }
  const counts = new Map(commits.days.map(([day, count]) => [day, count]));
  const dates = Array.from({ length: 7 }, (_, index) =>
    new Date(Date.parse(commits.to) - index * 86_400_000)
      .toISOString()
      .slice(0, 10)
  );
  return (
    <section className="pulse-card" aria-labelledby="main-commits-title">
      <h2 id="main-commits-title">
        {t.commitSummary.title} · {total}
      </h2>
      <p>{t.commitSummary.period}</p>
      <p>
        {t.hero.asOf}{' '}
        <time dateTime={checkedAt}>{formatDate(checkedAt, lang, true)}</time>
      </p>
      <details>
        <summary>{t.commitSummary.day}</summary>
        <dl>
          {dates.map((day) => (
            <div key={day}>
              <dt>
                <time dateTime={day}>{formatDate(day, lang)}</time>
              </dt>
              <dd>{counts.get(day) ?? 0}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details>
        <summary>{t.commitSummary.area}</summary>
        <dl>
          {[...products]
            .sort((a, b) => b[1] - a[1])
            .map(([track, count]) => (
              <div key={track}>
                <dt>
                  {track === 'other' ? t.pulse.other : TRACK_NAMES[track]}
                </dt>
                <dd>{count}</dd>
              </div>
            ))}
        </dl>
        <p>{t.commitSummary.method}</p>
      </details>
    </section>
  );
}
