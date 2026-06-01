import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';

vi.mock('@radix-ui/react-avatar', () => ({
  Root: ({ children, ...props }: React.ComponentProps<'span'>) => (
    <span {...props}>{children}</span>
  ),
  Image: ({
    alt,
    src,
    ...props
  }: React.ComponentProps<'span'> & { alt?: string; src?: string }) => (
    <span {...props} aria-label={alt} data-src={src} role="img" />
  ),
  Fallback: ({ children, ...props }: React.ComponentProps<'span'>) => (
    <span {...props}>{children}</span>
  ),
}));

const BROKEN_SUPABASE_AVATAR_URL =
  'https://yjbjpmwbfimjcdsjxfst.supabase.co/storage/v1/object/public/avatars/bbaf2747-4452-4b56-910d-0b313f49843e';

describe('AvatarImage', () => {
  it('omits broken Supabase bare-UUID avatar URLs so fallback can render', () => {
    render(
      <Avatar>
        <AvatarImage alt="Broken avatar" src={BROKEN_SUPABASE_AVATAR_URL} />
        <AvatarFallback>AV</AvatarFallback>
      </Avatar>
    );

    expect(screen.getByText('AV')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Broken avatar' })
    ).not.toHaveAttribute('data-src');
  });

  it('keeps valid avatar URLs', () => {
    render(
      <Avatar>
        <AvatarImage alt="Valid avatar" src="https://example.com/avatar.png" />
        <AvatarFallback>AV</AvatarFallback>
      </Avatar>
    );

    expect(screen.getByRole('img', { name: 'Valid avatar' })).toHaveAttribute(
      'data-src',
      'https://example.com/avatar.png'
    );
  });
});
