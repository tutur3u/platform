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

const SUPABASE_PUBLIC_BARE_UUID_AVATAR_URL =
  'https://yjbjpmwbfimjcdsjxfst.supabase.co/storage/v1/object/public/avatars/bbaf2747-4452-4b56-910d-0b313f49843e';

describe('AvatarImage', () => {
  it('passes full Supabase avatar URLs through so the image can load', () => {
    render(
      <Avatar>
        <AvatarImage
          alt="Supabase avatar"
          src={SUPABASE_PUBLIC_BARE_UUID_AVATAR_URL}
        />
        <AvatarFallback>AV</AvatarFallback>
      </Avatar>
    );

    expect(screen.getByText('AV')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Supabase avatar' })
    ).toHaveAttribute('data-src', SUPABASE_PUBLIC_BARE_UUID_AVATAR_URL);
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
