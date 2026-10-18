import { useState } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { APP_CATEGORIES, GATEWAY_APPS } from '../lib/apps-registry';
import portableEn from './messages/en.json';
import portableVi from './messages/vi.json';

export type CatalogueLocale = 'en' | 'vi';
export const catalogueMessages = { en, vi };

/** Public staging content only. Account controls remain on the original app. */
export function CatalogueEntry({ locale }: { locale: CatalogueLocale }) {
  const messages = catalogueMessages[locale];
  const t = messages.command_launcher;
  const portable = locale === 'vi' ? portableVi : portableEn;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const needle = query.trim().toLocaleLowerCase();
  const visible = GATEWAY_APPS.filter(
    (app) =>
      (category === 'all' || category === app.category) &&
      [
        app.title,
        t.app_names[app.slug],
        t.app_descriptions[app.slug],
        ...app.aliases,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle)
  );
  return (
    <main>
      <header>
        <p>{messages.appsGateway.eyebrow}</p>
        <h1>{messages.appsGateway.title.line1}</h1>
        <p>{messages.appsGateway.subtitle}</p>
        <a href="https://apps.tuturuuu.com/">{portable.fullApp}</a>
        <nav aria-label={portable.language}>
          <a href="/en">English</a> <a href="/vi">Tiếng Việt</a>
        </nav>
      </header>
      <section aria-label={messages.appsGateway.catalog.title}>
        <label htmlFor="app-search">{messages.appsGateway.catalog.title}</label>
        <input
          id="app-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label htmlFor="app-category">{portable.category}</label>
        <select
          id="app-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">{t.app_categories.all}</option>
          {APP_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {t.app_categories[value]}
            </option>
          ))}
        </select>
        <p role="status">
          {messages.appsGateway.appsCount.replace(
            '{count}',
            String(visible.length)
          )}
        </p>
        <ul>
          {visible.map((app) => (
            <li key={app.slug}>
              <a href={`/${app.slug}`}>
                <h2>{t.app_names[app.slug]}</h2>
                <p>{t.app_descriptions[app.slug]}</p>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
