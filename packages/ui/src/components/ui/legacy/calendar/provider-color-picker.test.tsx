// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { GoogleProviderColorOptions } from '@tuturuuu/types/primitives/google-calendar-color';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProviderColorPicker } from './provider-color-picker';

const mocks = vi.hoisted(() => ({ query: vi.fn(), get: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.query }));
vi.mock('@tuturuuu/internal-api', () => ({
  getGoogleCalendarColorOptions: mocks.get,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/label', () => ({
  Label: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('./event-form-components', () => ({
  EventColorPicker: () => <div>Legacy palette</div>,
}));
vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value?: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      aria-label="Provider palette"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));
const options: GoogleProviderColorOptions = {
  provider: 'google',
  providerColorWrites: true,
  connectionId: 'owned',
  calendarId: 'source',
  sourceColor: { background: '#123456', foreground: '#ffffff' },
  options: [
    {
      kind: 'inherit',
      id: null,
      name: null,
      background: '#123456',
      foreground: null,
    },
    {
      kind: 'event',
      id: '3',
      name: null,
      background: '#987654',
      foreground: null,
    },
    {
      kind: 'label',
      id: 'label-id',
      name: 'Synthetic label',
      background: '#abcdef',
      foreground: null,
    },
  ],
};
const props = (): ComponentProps<typeof ProviderColorPicker> => ({
  wsId: 'workspace',
  source: { id: 'source', provider: 'google', connectionId: 'owned' } as never,
  value: 'BLUE',
  onNativeChange: vi.fn(),
  onProviderChange: vi.fn(),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReturnValue({ data: options });
});
it('keeps the legacy picker when capability is disabled', () => {
  mocks.query.mockReturnValue({
    data: { ...options, providerColorWrites: false },
  });
  render(<ProviderColorPicker {...props()} />);
  expect(screen.getByText('Legacy palette')).toBeTruthy();
  expect(screen.queryByRole('combobox')).toBeNull();
});
it('keeps another connection palette from supplying choices', () => {
  mocks.query.mockReturnValue({
    data: { ...options, connectionId: 'foreign' },
  });
  render(<ProviderColorPicker {...props()} />);
  expect(screen.getByText('Legacy palette')).toBeTruthy();
});
it('sends exact provider namespace and ID for label and inherited choices', () => {
  const input = props();
  render(<ProviderColorPicker {...input} />);
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'label:label-id' },
  });
  expect(input.onProviderChange).toHaveBeenLastCalledWith({
    connectionId: 'owned',
    kind: 'label',
    id: 'label-id',
  });
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'inherit' },
  });
  expect(input.onProviderChange).toHaveBeenLastCalledWith({
    connectionId: 'owned',
    kind: 'inherit',
  });
  expect(input.onNativeChange).not.toHaveBeenCalled();
  mocks.query.mock.calls[0]?.[0].queryFn();
  expect(mocks.get).toHaveBeenCalledWith('workspace', 'owned');
});
it('initializes an imported label identity rather than the compatibility color', () => {
  render(
    <ProviderColorPicker
      {...props()}
      metadata={{
        google_color: {
          version: 1,
          event_label_id: 'label-id',
          inherited: false,
          resolved_rgb: '#abcdef',
        },
      }}
    />
  );
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(
    'label:label-id'
  );
});

it('keeps the legacy picker while query data is unavailable', () => {
  mocks.query.mockReturnValue({ data: undefined });
  render(<ProviderColorPicker {...props()} />);
  expect(screen.getByText('Legacy palette')).toBeTruthy();
  expect(screen.queryByRole('combobox')).toBeNull();
});
