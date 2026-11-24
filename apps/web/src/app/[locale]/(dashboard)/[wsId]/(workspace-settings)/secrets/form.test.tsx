// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import type { ComponentProps, ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import SecretForm from './form';

// The page renders SecretForm on the server. React Flight can deliver that
// element to FeatureSummary as a lazy node while its client module loads.
type SummaryForm = ComponentProps<typeof FeatureSummary>['form'];

function asFlightLazyNode(element: ReactElement): SummaryForm {
  return {
    $$typeof: Symbol.for('react.lazy'),
    _payload: element,
    _init: (payload: ReactElement) => payload,
  } as unknown as SummaryForm;
}

function renderCreateSecret(form: SummaryForm) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FeatureSummary
        pluralTitle="ws-secrets.plural"
        singularTitle="ws-secrets.singular"
        createTitle="ws-secrets.create"
        createDescription="ws-secrets.create_description"
        form={form}
      />
    </QueryClientProvider>
  );
}

async function openCreateSecretDialog() {
  fireEvent.click(screen.getByRole('button', { name: /ws-secrets.create/ }));
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(
    screen.getByText('ws-secrets.name', { selector: 'label' })
  ).toBeVisible();
  expect(
    screen.getByText('ws-secrets.value', { selector: 'label' })
  ).toBeVisible();
}

describe('Create secret dialog', () => {
  it('opens with the name and value fields', async () => {
    renderCreateSecret(<SecretForm wsId="workspace-1" existingSecrets={[]} />);
    await openCreateSecretDialog();
  });

  it('opens when the server-rendered form arrives as a lazy node', async () => {
    renderCreateSecret(
      asFlightLazyNode(<SecretForm wsId="workspace-1" existingSecrets={[]} />)
    );
    await openCreateSecretDialog();
  });
});
