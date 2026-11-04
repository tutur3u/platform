// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  preview: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/finance-fee-lock', () => ({
  getFeeNoticeTemplate: mocks.get,
  saveFeeNoticeTemplate: mocks.save,
  previewFeeNotice: mocks.preview,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { success: mocks.toast } }));

import { FeeNoticeTemplateEditor } from './fee-notice-template-editor';

// Synthetic fixture ids only.
const WS = '00000000-0000-4000-8000-0000000fe010';
const fields = {
  body: '{{student_name}}: {{total}}đ',
  item_format: '{{name}}',
  item_separator: ', ',
  payment_line: '',
  notice_grouping: 'combined' as const,
  locale: 'vi' as const,
};
const version = (v: number, is_active: boolean, body = fields.body) => ({
  ...fields,
  body,
  version: v,
  is_active,
  created_by: null,
  created_at: 't',
});
// biome-ignore format: compact labels
const labels = {
  template_body: 'Nội dung', payment_line: 'Dòng thanh toán', item_format: 'Định dạng khoản thêm',
  item_separator: 'Ký tự ngăn cách', grouping: 'Học viên học nhiều lớp', grouping_combined: 'Gộp một thông báo',
  grouping_per_class: 'Mỗi lớp một thông báo', placeholders: 'Chèn trường',
  unknown_placeholder: (name: string) => `unknown:${name}`, preview: 'Xem trước', versions: 'Phiên bản',
  restore_version: 'Khôi phục', template_saved: 'saved', conflict_body: 'conflict', save: 'Lưu',
};
const mount = (canEdit = true) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FeeNoticeTemplateEditor wsId={WS} canEdit={canEdit} labels={labels} />
    </QueryClientProvider>
  );
const body = async () =>
  (await screen.findByLabelText('Nội dung')) as HTMLTextAreaElement;

describe('FeeNoticeTemplateEditor', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({
      template: { ...fields, version: 3 },
      versions: [version(3, true), version(2, false, 'Cũ: {{total}}đ')],
    });
  });

  it('inserts allowlisted placeholders and blocks unknown ones', async () => {
    mount();
    const textarea = await body();
    textarea.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole('button', { name: '{{centre_name}}' }));
    expect(textarea.value).toBe('{{centre_name}}{{student_name}}: {{total}}đ');
    fireEvent.change(textarea, { target: { value: 'Gọi {{phone}}' } });
    expect(screen.getByRole('alert').textContent).toBe('unknown:phone');
    expect(
      (screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('shows the preview as plain text, never as markup (Selene gate 1)', async () => {
    mocks.preview.mockResolvedValue({
      source: 'sample',
      template_version: null,
      notices: [
        {
          group_id: null,
          text: '<script>alert(1)</script> & <b>x</b>',
          length: 30,
          truncated: false,
        },
      ],
    });
    const { container } = mount();
    await body();
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
    const preview = await screen.findByTestId('fee-notice-preview');
    expect(preview.textContent).toBe('<script>alert(1)</script> & <b>x</b>');
    expect(container.querySelector('script, b')).toBeNull();
    expect(mocks.preview).toHaveBeenCalledWith(WS, {
      lockId: undefined,
      template: fields,
    });
  });

  it('saves against the loaded version, restores old versions and reports a conflict', async () => {
    mocks.save.mockResolvedValueOnce({ ok: true, data: version(4, true) });
    mount();
    await body();
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));
    expect((await body()).value).toBe('Cũ: {{total}}đ');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('saved'));
    expect(mocks.save).toHaveBeenCalledWith(WS, {
      ...fields,
      body: 'Cũ: {{total}}đ',
      expected_version: 3,
      restored_from: 2,
    });
    mocks.save.mockResolvedValueOnce({ ok: false, current: null });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect((await screen.findByRole('alert')).textContent).toBe('conflict');
  });

  it('is read-only without manage_finance', async () => {
    mount(false);
    expect((await body()).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Lưu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Khôi phục' })).toBeNull();
  });
});
