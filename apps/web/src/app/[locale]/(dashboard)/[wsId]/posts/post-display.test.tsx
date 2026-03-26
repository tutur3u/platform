/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostDisplay } from './post-display';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: any; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('PostDisplay', () => {
  it('renders the undeliverable delivery issue reason when present', () => {
    render(
      <PostDisplay
        wsId="ws-1"
        postEmail={{
          delivery_issue_reason: 'missing_sender_platform_user',
          group_id: 'group-1',
          group_name: 'Group 1',
          has_check: true,
          post_id: 'post-1',
          recipient: 'Recipient',
          stage: 'undeliverable',
        }}
      />
    );

    expect(screen.getAllByText('undeliverable').length).toBeGreaterThan(0);
    expect(
      screen.getByText('delivery_issue_reason_missing_sender_platform_user')
    ).toBeInTheDocument();
  });
});
