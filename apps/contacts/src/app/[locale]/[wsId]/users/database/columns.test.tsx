import { render, screen } from '@testing-library/react';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { describe, expect, it, vi } from 'vitest';
import { getUserColumns } from './columns';

vi.mock('./row-actions', () => ({ UserRowActions: () => null }));
vi.mock('@tuturuuu/ui/custom/tables/data-table-column-header', () => ({
  DataTableColumnHeader: () => null,
}));
vi.mock('@tuturuuu/users-ui/components/require-attention-name', () => ({
  RequireAttentionName: ({ name }: { name: string }) => <span>{name}</span>,
}));

function renderName(note?: string, hasPrivateInfo?: boolean) {
  const columns = getUserColumns({
    t: ((key: string) => key) as ColumnGeneratorOptions<WorkspaceUser>['t'],
    namespace: 'ws-users',
    extraData: { hasPublicInfo: true, hasPrivateInfo },
  });
  const column = columns.find(
    (column) => 'accessorKey' in column && column.accessorKey === 'full_name'
  );
  const Cell = column?.cell;
  if (typeof Cell !== 'function') throw new Error('Missing name cell');
  const original = {
    id: 'contact-1',
    full_name: 'Test Contact',
    display_name: 'Preferred name',
    linked_users: [],
    href: '/workspace/users/database/contact-1',
    note,
  };
  const context = {
    row: {
      original,
      getValue: (key: keyof typeof original) => original[key],
    },
  } as unknown as Parameters<typeof Cell>[0];
  return render(<Cell {...context} />);
}

describe('contact name notes', () => {
  it('shows the saved note with both names without depending on the note column', () => {
    renderName('Không học thứ 6\nLiên hệ trước', true);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('Test Contact');
    expect(link).toHaveTextContent('Preferred name');
    expect(link).toHaveTextContent('Không học thứ 6');
    expect(link).toHaveTextContent('Liên hệ trước');
    expect(link).toHaveAttribute('href', '/workspace/users/database/contact-1');
  });

  it.each([false, undefined])(
    'hides private notes when permission is %s',
    (permission) => {
      renderName('Private contact note', permission);
      expect(
        screen.queryByText('Private contact note')
      ).not.toBeInTheDocument();
      expect(screen.getByText('Test Contact')).toBeInTheDocument();
    }
  );

  it.each([undefined, '', '   \n  '])('omits empty notes (%s)', (note) => {
    const { container } = renderName(note, true);
    expect(container.querySelector('.whitespace-pre-wrap')).toBeNull();
    expect(screen.getByText('Test Contact')).toBeInTheDocument();
  });
});
