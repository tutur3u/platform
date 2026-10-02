import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import english from '../../../../../../messages/en.json';
import vietnamese from '../../../../../../messages/vi.json';

const context = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('@/components/visualizations/horse-racing/visualization', () => ({
  HorseRacingVisualization: () => null,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace: string) => {
    expect(namespace).toBe('marketingSeo.visualizations_horse_racing');
    const copy = context.locale === 'vi' ? vietnamese : english;
    return (key: 'title' | 'bodyDescription') =>
      copy.marketingSeo.visualizations_horse_racing[key];
  }),
}));

import HorseRacingPage from './page';

it.each(['en', 'vi'])(
  'renders actual %s heading and algorithm description',
  async (locale) => {
    context.locale = locale;
    const copy = (locale === 'vi' ? vietnamese : english).marketingSeo
      .visualizations_horse_racing;
    const html = renderToStaticMarkup(await HorseRacingPage());
    expect(html).toContain(copy.title);
    expect(html).toContain(copy.bodyDescription);
    if (locale === 'vi')
      expect(html).not.toContain(
        english.marketingSeo.visualizations_horse_racing.bodyDescription
      );
  }
);
