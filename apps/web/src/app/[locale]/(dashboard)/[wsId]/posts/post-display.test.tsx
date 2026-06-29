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

  it('renders delivery diagnostics and stale queue warning for approved queued rows', () => {
    const queuedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    render(
      <PostDisplay
        wsId="ws-1"
        postEmail={{
          approval_approved_at: new Date().toISOString(),
          approval_status: 'APPROVED',
          group_id: 'group-1',
          group_name: 'Group 1',
          has_check: true,
          post_id: 'post-1',
          queue_attempt_count: 1,
          queue_created_at: queuedAt,
          queue_last_attempt_at: queuedAt,
          queue_status: 'queued',
          recipient: 'Recipient',
          stage: 'queued',
        }}
      />
    );

    expect(screen.getByText('delivery_diagnostics')).toBeInTheDocument();
    expect(screen.getByText('stale_queue_warning')).toBeInTheDocument();
    expect(screen.getByText('review_stage')).toBeInTheDocument();
    expect(screen.getAllByText('delivery_status').length).toBeGreaterThan(0);
  });
});
