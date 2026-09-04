import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Popover } from '@tuturuuu/ui/popover';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotificationPopoverTriggerButton } from './notification-popover-trigger';

function TriggerHarness({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <Popover>
      <NotificationPopoverTriggerButton
        notificationsText="Notifications"
        unreadCount={unreadCount}
      />
    </Popover>
  );
}

describe('NotificationPopoverTriggerButton', () => {
  it('disables the server-rendered trigger until event handlers are attached', () => {
    const markup = renderToString(<TriggerHarness unreadCount={1} />);

    expect(markup).toContain('disabled=""');
  });

  it('enables the trigger after hydration and opens the popover on the first click', async () => {
    render(<TriggerHarness unreadCount={1} />);

    const trigger = screen.getByRole('button', { name: 'Notifications' });
    await waitFor(() => expect(trigger).toBeEnabled());
    fireEvent.click(trigger);

    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    );
  });
});
