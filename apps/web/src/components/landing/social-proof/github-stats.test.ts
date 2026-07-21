import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Metric = { label: string; value: string };

function messages(locale: 'en' | 'vi') {
  return JSON.parse(
    readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf8')
  ) as {
    landing: { socialProof: { stats: Record<string, Metric> } };
  };
}

describe('landing social proof metrics', () => {
  it('keeps the four published English metrics current', () => {
    expect(messages('en').landing.socialProof.stats).toEqual({
      commits: { label: 'Commits', value: '20K+' },
      contributors: { label: 'Contributors', value: '30+' },
      potential: { label: 'Potential', value: 'Limitless' },
      years: { label: 'Years of Innovation', value: '4+' },
    });
  });

  it('ships the equivalent Vietnamese metrics', () => {
    expect(messages('vi').landing.socialProof.stats).toEqual({
      commits: { label: 'Commit', value: '20K+' },
      contributors: { label: 'Người đóng góp', value: '30+' },
      potential: { label: 'Tiềm năng', value: 'Vô hạn' },
      years: { label: 'Năm đổi mới sáng tạo', value: '4+' },
    });
  });

  it('renders the potential metric in the landing stats component', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/components/landing/social-proof/github-stats.tsx'
      ),
      'utf8'
    );

    const usesExplicitMetric =
      source.includes("t('stats.potential.value')") &&
      source.includes("t('stats.potential.label')");
    const usesTranslatedStatKeys =
      source.includes('const statKeys') && source.includes("'potential'");

    expect(usesExplicitMetric || usesTranslatedStatKeys).toBe(true);
  });
});
