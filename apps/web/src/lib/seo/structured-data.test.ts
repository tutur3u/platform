import { describe, expect, it } from 'vitest';
import {
  createHomepageStructuredData,
  serializeStructuredData,
} from './structured-data';

describe('homepage structured data', () => {
  it('links translated pages to one organization and website', () => {
    const data = createHomepageStructuredData({
      locale: 'vi',
      title: 'Đội nhóm',
      description: 'Cộng tác',
    });
    const page = data['@graph'].find((item) => item['@type'] === 'WebPage');
    expect(page?.url).toMatch(/\/vi$/);
    expect(page?.inLanguage).toBe('vi-VN');
    expect(page?.name).toBe('Đội nhóm');
    expect(
      data['@graph'].find((item) => item['@type'] === 'WebApplication')
    ).not.toHaveProperty('aggregateRating');
  });
  it('escapes HTML script terminators while preserving JSON values', () => {
    const value = { description: '</script><script>alert(1)</script>' };
    const serialized = serializeStructuredData(value);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual(value);
  });
});
