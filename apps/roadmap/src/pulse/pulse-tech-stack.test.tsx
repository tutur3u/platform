import type { AppTechStack } from '@tuturuuu/roadmap-core/tech-stack.ts';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PulseTechStack } from './pulse-tech-stack';

it('renders bilingual stack status, target routes and migration progress', () => {
  const app = {
    id: 'roadmap',
    status: 'cutOver',
    current: {
      framework: 'start',
      bundler: 'vitePlusVoid',
      hosting: 'nativeWorker',
      deployCli: 'wrangler',
      url: 'https://tuturuuu.com/roadmap',
    },
    targetUrl: 'https://tuturuuu.com/roadmap',
  } satisfies AppTechStack;
  const apps = [
    app,
    { ...app, id: 'held', status: 'held' },
    {
      id: 'mobile',
      status: 'outside',
      current: {
        framework: 'other',
        bundler: 'other',
        hosting: null,
        deployCli: null,
        url: null,
      },
    },
  ] satisfies AppTechStack[];
  const en = renderToStaticMarkup(<PulseTechStack lang="en" apps={apps} />);
  const vi = renderToStaticMarkup(<PulseTechStack lang="vi" apps={apps} />);
  expect(en).toContain('1 of 2 apps on TanStack Start + Cloudflare');
  expect(en).toContain('aria-valuenow="1"');
  expect(en).toContain('aria-valuemax="2"');
  expect(en).toContain('tuturuuu.com/roadmap');
  expect(en).toContain('Wrangler');
  expect(en).toContain('cf CLI');
  expect(en).toContain('Outside this migration');
  expect(vi).toContain('Công nghệ ứng dụng');
  expect(vi).toContain('Đã chuyển đổi');
  expect(vi).toContain('Đang tạm giữ');
});
