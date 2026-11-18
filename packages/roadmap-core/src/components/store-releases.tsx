import android from '../../../../apps/mobile/store/metadata/android.json';
import ios from '../../../../apps/mobile/store/metadata/ios.json';
import macos from '../../../../apps/mobile/store/metadata/macos.json';
import windows from '../../../../apps/mobile/store/metadata/windows.json';
import type en from '../../messages/en.json';
import type { Lang } from './shared';

const screenshotUrls = import.meta.glob<string>(
  '../../../../apps/mobile/store/screenshots/{ios,macos,android,windows}/web/*.webp',
  { eager: true, import: 'default', query: '?no-inline' }
);

const stores = [
  ['iOS App Store', ios],
  ['Mac App Store', macos],
  ['Google Play', android],
  ['Microsoft Store', windows],
] as const;

const dateFields = [
  'targetSubmitDate',
  'submittedAt',
  'approvedAt',
  'targetLiveDate',
  'liveAt',
] as const;

export function StoreReleases({
  lang,
  t,
}: {
  lang: Lang;
  t: typeof en.storeReleases;
}) {
  const statuses = new Map(Object.entries(t.statuses));
  const dateFormat = new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  return (
    <section
      className="rm-store-releases"
      id="store-releases"
      aria-labelledby="store-releases-title"
    >
      <h2 id="store-releases-title">{t.heading}</h2>
      {stores.map(([name, { release, listing, gallery }]) => {
        const title = 'title' in listing ? listing.title : listing.name;
        const description =
          'fullDescription' in listing
            ? listing.fullDescription
            : listing.description;
        const status = statuses.get(release.status) ?? t.pending;

        return (
          <article className="rm-store-release" key={name}>
            <h3>{name}</h3>
            <p>
              {status} · {release.version} ({t.build} {release.build})
            </p>
            <dl>
              {dateFields.map((field) => {
                const date = release[field];
                return (
                  <div key={field}>
                    <dt>{t.dates[field]}</dt>
                    <dd>
                      {date ? (
                        <time dateTime={date}>
                          {dateFormat.format(new Date(date))}
                        </time>
                      ) : (
                        t.pending
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <details>
              <summary>
                {t.listing} · {title[lang]}
              </summary>
              <p className="rm-store-description">{description[lang]}</p>
            </details>
            <ul className="rm-store-gallery" aria-label={t.screenshots}>
              {gallery.map(({ file, width, height, alt }) => {
                const url = screenshotUrls[`../../../../${file}`];
                if (!url) return null;
                return (
                  <li key={file}>
                    <a href={url}>
                      <img
                        src={url}
                        alt={alt[lang]}
                        width={width}
                        height={height}
                        loading="lazy"
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </section>
  );
}
