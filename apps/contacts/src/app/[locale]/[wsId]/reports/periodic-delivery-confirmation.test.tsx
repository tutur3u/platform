import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import {
  useWorkspaceActor,
  WorkspaceVisibilityProvider,
} from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import viMessages from '../../../../../messages/vi.json';
import { PeriodicDeliveryConfirmation } from './periodic-delivery-confirmation';

const markers = [
  'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.',
  'Email delivery outcome is unknown. Check provider logs before retrying.',
];
function show(error: string, locale = 'en') {
  const confirm = vi.fn();
  const cancel = vi.fn();
  const client = new QueryClient();
  const intent = {
    wsId: 'workspace-a',
    actor: null as ReturnType<typeof useWorkspaceActor>,
    action: 'retry' as const,
    report: {
      user_email: 'synthetic@example.com',
      last_delivery_error: error,
    } as PeriodicReport,
  };
  function ScopedConfirmation({
    wsId,
    canSend,
    isPending,
  }: {
    wsId: string;
    canSend: boolean;
    isPending: boolean;
  }) {
    const actor = useWorkspaceActor();
    if (!intent.actor) intent.actor = actor;
    return (
      <PeriodicDeliveryConfirmation
        intent={
          intent as Parameters<typeof PeriodicDeliveryConfirmation>[0]['intent']
        }
        wsId={wsId}
        canSend={canSend}
        isPending={isPending}
        onCancel={cancel}
        onConfirm={confirm}
      />
    );
  }
  function view(
    wsId = 'workspace-a',
    isPending = false,
    canSend = true,
    actorId = 'actor-a'
  ) {
    return (
      <QueryClientProvider client={client}>
        <WorkspaceVisibilityProvider actorId={actorId}>
          <NextIntlClientProvider
            locale={locale}
            messages={locale === 'en' ? en : viMessages}
          >
            <ScopedConfirmation
              wsId={wsId}
              canSend={canSend}
              isPending={isPending}
            />
          </NextIntlClientProvider>
        </WorkspaceVisibilityProvider>
      </QueryClientProvider>
    );
  }
  return { ...render(view()), confirm, cancel, view };
}
for (const locale of ['en', 'vi'])
  for (const marker of markers)
    it(`uncertain Retry warning ${locale} ${markers.indexOf(marker)}`, () => {
      show(marker, locale);
      expect(screen.getByRole('alertdialog')).toHaveTextContent(
        locale === 'en'
          ? 'may send a duplicate email'
          : 'có thể gửi email trùng lặp'
      );
      expect(screen.getByRole('alertdialog')).toHaveTextContent(
        locale === 'en'
          ? 'Check provider logs'
          : 'Kiểm tra nhật ký nhà cung cấp'
      );
      expect(screen.getByRole('alertdialog')).toHaveTextContent(
        'synthetic@example.com'
      );
    });
it('keeps ordinary rejection confirmation unchanged', () => {
  show('Email provider rejected the delivery.');
  expect(screen.getByRole('alertdialog')).not.toHaveTextContent(
    'may send a duplicate'
  );
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    'The retry will be recorded.'
  );
});
it('cancels without delivery', () => {
  const { confirm, cancel } = show(markers[1]!);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancel).toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});
it('suppresses duplicate confirmation before pending rerender', () => {
  const { confirm } = show(markers[1]!);
  const button = screen.getByRole('button', { name: 'Confirm' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledTimes(1);
});
it('suppresses pending confirmation', () => {
  const { confirm, view, rerender } = show(markers[1]!);
  rerender(view('workspace-a', true));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(confirm).not.toHaveBeenCalled();
});
for (const change of ['workspace', 'capability'])
  it(`invalidates retained ${change} ABA`, () => {
    const { confirm, view, rerender } = show(markers[1]!);
    rerender(
      view(
        change === 'workspace' ? 'workspace-b' : 'workspace-a',
        false,
        change !== 'capability'
      )
    );
    rerender(view());
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(confirm).not.toHaveBeenCalled();
  });
it('old actor handler cannot confirm after actor ABA', () => {
  const { confirm, view, rerender } = show(markers[1]!);
  const button = screen.getByRole('button', { name: 'Confirm' });
  rerender(view('workspace-a', false, true, 'actor-b'));
  rerender(view());
  fireEvent.click(button);
  expect(confirm).not.toHaveBeenCalled();
});

it('retained intent cannot be adopted by the current actor after provider remount', () => {
  const { confirm, view, rerender } = show(markers[1]!);
  rerender(view('workspace-a', false, true, 'actor-b'));
  rerender(view());
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(confirm).not.toHaveBeenCalled();
});

for (const marker of markers)
  it(`announces uncertainty through aria-describedby ${markers.indexOf(marker)}`, () => {
    show(marker);
    const dialog = screen.getByRole('alertdialog');
    const ids = dialog.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    expect(ids.length).toBeGreaterThan(0);
    const description = ids
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(description).toContain('may send a duplicate email');
    expect(description).toContain('Check provider logs');
    expect(description).toContain('synthetic@example.com');
  });
