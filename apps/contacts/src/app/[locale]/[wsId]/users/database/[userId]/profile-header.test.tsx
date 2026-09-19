import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileHeader } from './profile-header';

vi.mock('./resolved-user-avatar', () => ({ ResolvedUserAvatar: () => null }));
vi.mock('@tuturuuu/users-ui/components/require-attention-name', () => ({
  RequireAttentionName: ({ name }: { name: string }) => <span>{name}</span>,
}));
const labels = {
  email: 'Email',
  guest: 'Guest',
  phone: 'Phone',
  referredBy: 'Referred by',
  unknownUser: 'Unknown',
};
const noteLabels = {
  note: 'Ghi chú',
  expand: 'Xem toàn bộ ghi chú',
  collapse: 'Thu gọn',
};
const user = {
  id: 'contact-1',
  full_name: 'Nguyễn Thanh Trà',
  note: 'Không học thứ 6\nLiên hệ trước',
};

function header(canViewNote: boolean, note = user.note) {
  return (
    <ProfileHeader
      wsId="workspace"
      user={{ ...user, note }}
      isGuest={false}
      metrics={[]}
      labels={labels}
      noteLabels={canViewNote ? noteLabels : undefined}
    />
  );
}

describe('contact profile header notes', () => {
  it('places the note beside the identity above the detail tabs', () => {
    render(header(true));
    expect(
      screen.getByRole('heading', { name: user.full_name })
    ).toBeInTheDocument();
    expect(screen.getByText('Ghi chú')).toBeInTheDocument();
    expect(screen.getByText(/Không học thứ 6/)).toHaveTextContent(
      'Liên hệ trước'
    );
  });
  it('does not render a note without private-info access', () => {
    render(header(false));
    expect(screen.queryByText('Ghi chú')).not.toBeInTheDocument();
    expect(screen.queryByText(/Không học thứ 6/)).not.toBeInTheDocument();
  });
  it('resets expanded state when switching to another note', () => {
    const { rerender } = render(header(true, 'First long note. '.repeat(30)));
    fireEvent.click(screen.getByRole('button', { name: noteLabels.expand }));
    expect(
      screen.getByRole('button', { name: noteLabels.collapse })
    ).toHaveAttribute('aria-expanded', 'true');
    rerender(header(true, 'Second long note. '.repeat(30)));
    expect(
      screen.getByRole('button', { name: noteLabels.expand })
    ).toHaveAttribute('aria-expanded', 'false');
  });
  it('allows short multiline notes to expand too', () => {
    render(header(true, 'One\nTwo\nThree\nFour'));
    expect(
      screen.getByRole('button', { name: noteLabels.expand })
    ).toBeInTheDocument();
  });
});
