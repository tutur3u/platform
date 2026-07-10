import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResolvedUserAvatar } from './resolved-user-avatar';

describe('ResolvedUserAvatar', () => {
  it('does not render without a source', () => {
    const { container } = render(
      <ResolvedUserAvatar alt="Avatar" src={null} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('hides itself after the image source fails to resolve', () => {
    render(
      <ResolvedUserAvatar
        alt="Avatar"
        src="https://example.com/missing-avatar.png"
      />
    );

    const avatar = screen.getByAltText('Avatar');
    expect(avatar).toBeInTheDocument();

    fireEvent.error(avatar);

    expect(screen.queryByAltText('Avatar')).not.toBeInTheDocument();
  });
});
