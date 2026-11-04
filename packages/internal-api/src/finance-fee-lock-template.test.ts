import { describe, expect, it, vi } from 'vitest';
import {
  getFeeNoticeTemplate,
  previewFeeNotice,
  saveFeeNoticeTemplate,
} from './finance-fee-lock';

const options = (fetch: typeof globalThis.fetch) => ({
  baseUrl: 'https://finance.example',
  fetch,
});
const respond = (body: unknown, status = 200) =>
  vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json(body, { status }));
const template = {
  body: '{{student_name}}',
  item_format: '{{name}}',
  item_separator: ', ',
  payment_line: '',
  notice_grouping: 'combined' as const,
  locale: 'vi' as const,
};

// biome-ignore format: dense client checks
describe('fee notice template client', () => {
  it('reads, saves and previews on the fee-lock template paths', async () => {
    const get = respond({ template: { ...template, version: 2 }, versions: [] });
    await getFeeNoticeTemplate('ws/one', options(get));
    expect(new URL(String(get.mock.calls[0]?.[0])).pathname).toBe('/api/v1/workspaces/ws%2Fone/finance/fee-locks/template');

    const put = respond({ ...template, version: 3, is_active: true });
    expect(await saveFeeNoticeTemplate('ws', { ...template, expected_version: 2 }, options(put))).toMatchObject({ ok: true, data: { version: 3 } });
    expect(put.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', cache: 'no-store' });
    expect(JSON.parse(String(put.mock.calls[0]?.[1]?.body))).toMatchObject({ expected_version: 2 });

    const post = respond({ source: 'sample', template_version: null, notices: [] });
    await previewFeeNotice('ws', { template }, options(post));
    expect(new URL(String(post.mock.calls[0]?.[0])).pathname).toBe('/api/v1/workspaces/ws/finance/fee-locks/template/preview');
  });

  it('resolves a version conflict to the current template and throws other errors', async () => {
    const stale = respond({ code: 'FEE_NOTICE_TEMPLATE_VERSION_CONFLICT', current: { ...template, version: 5 } }, 409);
    expect(await saveFeeNoticeTemplate('ws', template, options(stale))).toEqual({ ok: false, current: { ...template, version: 5 } });
    const invalid = respond({ code: 'FEE_NOTICE_TEMPLATE_INVALID' }, 400);
    await expect(saveFeeNoticeTemplate('ws', template, options(invalid))).rejects.toMatchObject({ status: 400 });
  });
});
