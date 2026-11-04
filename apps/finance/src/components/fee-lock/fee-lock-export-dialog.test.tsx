// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ export: vi.fn(), toast: vi.fn() }));
vi.mock('@tuturuuu/internal-api/finance-fee-lock', () => ({
  exportFeeLocks: mocks.export,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { success: mocks.toast } }));

import { FeeLockExportDialog } from './fee-lock-export-dialog';

// Synthetic fixture ids only.
const WS = '00000000-0000-4000-8000-0000000fe010';
const GROUP = '00000000-0000-4000-8000-0000000fe501';
const labels = {
  export: 'Xuất Excel',
  export_title: 'Xuất bảng chốt học phí',
  export_locked_only: 'Chỉ học phí đã chốt',
  export_all: 'Gồm cả bản nháp',
  export_too_many: (count: number) => `too_many:${count}`,
  export_done: (count: number) => `done:${count}`,
  export_failed: 'failed',
  cancel: 'Hủy',
};

const mount = () =>
  render(
    <FeeLockExportDialog
      wsId={WS}
      month="2026-12"
      groupId={GROUP}
      labels={labels}
    />
  );
const open = () => {
  fireEvent.click(screen.getAllByRole('button', { name: 'Xuất Excel' })[0]!);
  expect(screen.getByText('12/2026')).toBeTruthy();
};
const submit = () =>
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Xuất Excel' }).at(-1)!
  );

describe('FeeLockExportDialog', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:fee-lock');
    URL.revokeObjectURL = vi.fn();
  });

  // biome-ignore format: dense assertions
  it('exports locked fees by default, then drafts too when chosen, and saves the file', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const blob = new Blob(['x']);
    mocks.export.mockResolvedValue({ ok: true, blob, fileName: 'chot-hoc-phi-2026-12-00000000.xlsx', rowCount: 3 });
    mount();
    open();
    submit();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('done:3'));
    expect(mocks.export).toHaveBeenCalledWith(WS, { month: '2026-12', groupId: GROUP, status: 'locked' });
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('chot-hoc-phi-2026-12-00000000.xlsx');

    open();
    fireEvent.click(screen.getByRole('radio', { name: 'Gồm cả bản nháp' }));
    submit();
    await waitFor(() => expect(mocks.export).toHaveBeenCalledTimes(2));
    expect(mocks.export).toHaveBeenLastCalledWith(WS, { month: '2026-12', groupId: GROUP, status: 'all' });
  });

  it('shows the too-many message and a failure without saving anything', async () => {
    mocks.export.mockResolvedValueOnce({ ok: false, tooMany: 2001 });
    mount();
    open();
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'too_many:2001'
    );
    mocks.export.mockRejectedValueOnce(new Error('500'));
    submit();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('failed')
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
