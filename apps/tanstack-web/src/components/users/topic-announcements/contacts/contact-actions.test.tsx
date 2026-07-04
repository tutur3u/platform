import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ContactDeleteDialog } from './contact-delete-dialog';
import { ContactRow } from './contact-row';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    const messages: Record<string, string> = {
      cancel: 'Cancel',
      remove_contact: 'Remove',
      remove_contact_action: 'Remove contact',
      remove_contact_description: `This will archive "${params?.name ?? ''}".`,
      remove_contact_title: 'Remove contact?',
      send_verification: 'Send verification',
    };

    return messages[key] ?? key;
  },
}));

type InspectableProps = {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
};

const contact = {
  archived: false,
  createdAt: '2026-06-25T00:00:00.000Z',
  email: 'recipient@example.com',
  id: 'contact-1',
  metadata: null,
  name: 'Recipient One',
  tags: [],
  verificationStatus: 'needs_verification',
  workspaceUserId: null,
} satisfies TopicAnnouncementContact;

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

function findClickableByText(node: ReactNode, label: string) {
  return findElements(node, (element) => {
    const props = getProps(element);

    return (
      typeof props.onClick === 'function' &&
      textContent(props.children).includes(label)
    );
  });
}

function renderContactRow(
  overrides: Partial<Parameters<typeof ContactRow>[0]> = {}
) {
  return ContactRow({
    canSend: true,
    contact,
    isDeleting: false,
    isVerifying: false,
    onRemove: vi.fn(),
    onVerify: vi.fn(),
    workspaceUser: undefined,
    ...overrides,
  });
}

describe('topic announcement contact actions', () => {
  it('hides verification controls when the caller cannot send', () => {
    const tree = renderContactRow({ canSend: false });

    expect(textContent(tree)).not.toContain('Send verification');
    expect(findClickableByText(tree, 'Send verification')).toHaveLength(0);
  });

  it('shows verification controls and calls onVerify for contacts that need it', () => {
    const onVerify = vi.fn();
    const tree = renderContactRow({ onVerify });
    const [verifyButton] = findClickableByText(tree, 'Send verification');

    expect(verifyButton).toBeDefined();

    getProps(verifyButton!).onClick?.();

    expect(onVerify).toHaveBeenCalledWith('contact-1');
  });

  it('confirms contact deletion with the selected contact id', () => {
    const onDelete = vi.fn();
    const onOpenChange = vi.fn();
    const tree = ContactDeleteDialog({
      isDeleting: false,
      onDelete,
      onOpenChange,
      target: contact,
    });
    const [deleteButton] = findClickableByText(tree, 'Remove');

    expect(deleteButton).toBeDefined();
    expect(getProps(deleteButton!).disabled).toBe(false);

    getProps(deleteButton!).onClick?.();

    expect(onDelete).toHaveBeenCalledWith('contact-1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
