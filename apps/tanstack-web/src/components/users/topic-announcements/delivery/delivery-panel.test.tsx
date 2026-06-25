import type {
  TopicAnnouncementContact,
  TopicAnnouncementRecord,
} from '@tuturuuu/internal-api';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DeliveryPanel } from './delivery-panel';
import { DeliveryRecipients } from './delivery-recipients';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    const messages: Record<string, string> = {
      announcement_title: 'Title',
      delivery_compose_cta: 'Compose announcement',
      delivery_empty_desc: 'Sent announcements appear here.',
      delivery_empty_title: 'Nothing delivered yet',
      delivery_relationship_help: 'Delivery history help',
      not_sent: 'Not sent',
      recipients: 'Recipients',
      recipients_more: `+${params?.count ?? '0'} more`,
      sent_at: 'Sent at',
      status: 'Status',
      status_sent: 'Sent',
    };

    return messages[key] ?? key;
  },
}));

type InspectableProps = {
  action?: ReactNode;
  announcement?: TopicAnnouncementRecord;
  children?: ReactNode;
  className?: string;
  description?: string;
  href?: string;
  title?: string;
};

function getProps(element: ReactElement): InspectableProps {
  return element.props as InspectableProps;
}

function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (isValidElement(node)) {
    return textContent(getProps(node).children);
  }

  let text = '';
  Children.forEach(node, (child) => {
    text += textContent(child);
  });

  return text;
}

function findElements(
  node: ReactNode,
  predicate: (element: ReactElement) => boolean
): ReactElement[] {
  if (
    node === null ||
    node === undefined ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return [];
  }

  if (!isValidElement(node)) {
    const children: ReactElement[] = [];

    Children.forEach(node, (child) => {
      children.push(...findElements(child, predicate));
    });

    return children;
  }

  const matches = predicate(node) ? [node] : [];
  const children = getProps(node).children;

  Children.forEach(children, (child) => {
    matches.push(...findElements(child, predicate));
  });

  return matches;
}

function contact(email: string): TopicAnnouncementContact {
  return {
    archived: false,
    createdAt: '2026-06-25T00:00:00.000Z',
    email,
    id: `contact-${email}`,
    metadata: null,
    name: email,
    tags: [],
    verificationStatus: 'verified',
    workspaceUserId: null,
  };
}

function announcement(
  overrides: Partial<TopicAnnouncementRecord> = {}
): TopicAnnouncementRecord {
  return {
    attachments: [],
    batch_id: null,
    body: 'Body',
    class_label: null,
    contacts: [contact('recipient@example.com')],
    created_at: '2026-06-25T00:00:00.000Z',
    day_label: null,
    end_time: null,
    group: null,
    group_id: null,
    id: 'announcement-1',
    last_error: null,
    place: null,
    room: null,
    scheduled_send_at: null,
    sent_email_audit_id: null,
    sent_at: '2026-06-25T01:00:00.000Z',
    session_date: null,
    source_type: 'manual',
    start_time: null,
    status: 'sent',
    title: 'Delivered row',
    topic: 'Topic',
    ...overrides,
  };
}

describe('DeliveryPanel', () => {
  it('renders the empty state and compose CTA href when there are no sent announcements', () => {
    const tree = DeliveryPanel({
      announcements: [],
      locale: 'en',
      schedulingTimezone: null,
      wsId: 'acme',
    });
    const props = getProps(tree);
    const [ctaLink] = findElements(
      props.action,
      (element) =>
        getProps(element).href ===
        '/en/acme/users/topic-announcements/announcements'
    );

    expect(props.title).toBe('Nothing delivered yet');
    expect(props.description).toBe('Sent announcements appear here.');
    expect(ctaLink).toBeDefined();
    expect(textContent(ctaLink)).toBe('Compose announcement');
  });

  it('defensively filters out announcements that are not sent', () => {
    const sent = announcement({
      id: 'sent-announcement',
      status: 'sent',
      title: 'Delivered announcement',
    });
    const draft = announcement({
      id: 'draft-announcement',
      status: 'draft',
      title: 'Draft announcement',
    });
    const queued = announcement({
      id: 'queued-announcement',
      status: 'queued',
      title: 'Queued announcement',
    });
    const tree = DeliveryPanel({
      announcements: [sent, draft, queued],
      locale: 'en',
      schedulingTimezone: 'UTC',
      wsId: 'acme',
    });
    const recipients = findElements(
      tree,
      (element) => element.type === DeliveryRecipients
    );

    expect(textContent(tree)).toContain('Delivered announcement');
    expect(textContent(tree)).not.toContain('Draft announcement');
    expect(textContent(tree)).not.toContain('Queued announcement');
    expect(recipients).toHaveLength(1);
    expect(getProps(recipients[0]!).announcement?.id).toBe('sent-announcement');
  });
});

describe('DeliveryRecipients', () => {
  it('renders a fallback when there are no recipients', () => {
    const tree = DeliveryRecipients({
      announcement: announcement({ contacts: [] }),
    });

    expect(textContent(tree)).toBe('\u2014');
  });

  it('renders the first three email chips and a hidden-recipient count', () => {
    const tree = DeliveryRecipients({
      announcement: announcement({
        contacts: [
          contact('one@example.com'),
          contact('two@example.com'),
          contact('three@example.com'),
          contact('four@example.com'),
          contact('five@example.com'),
        ],
      }),
    });
    const chips = findElements(
      tree,
      (element) =>
        element.type === 'span' &&
        Boolean(getProps(element).className?.includes('rounded-md border'))
    );

    expect(chips.map((chip) => textContent(chip))).toEqual([
      'one@example.com',
      'two@example.com',
      'three@example.com',
    ]);
    expect(textContent(tree)).toContain('+2 more');
  });
});
