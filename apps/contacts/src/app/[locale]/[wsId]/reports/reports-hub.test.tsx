import { fireEvent, render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';
import ReportsHub from './reports-hub';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../posts/client', () => ({
  default: () => <div>daily recipients</div>,
}));
vi.mock('./periodic-reports-panel', () => ({
  default: ({ cadence }: { cadence: string }) => <div>periodic {cadence}</div>,
}));
vi.mock('./automations-panel', () => ({
  default: () => <div>automation settings</div>,
}));
const props = {
  canManageAutomation: true,
  canViewDaily: true,
  canViewPeriodic: true,
  locale: 'en',
  wsId: 'workspace',
  postSearchParams: {},
  periodicPermissions: {
    canApproveReports: false,
    canCheckUserAttendance: false,
    canCreateReports: false,
    canDeleteReports: false,
    canSendReports: false,
    canUpdateReports: false,
  },
};
function mount(searchParams = '', overrides = {}) {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      <ReportsHub {...props} {...overrides} />
    </NuqsTestingAdapter>
  );
}
describe('central Reports worklist', () => {
  it('uses one worklist with cadence controls and separate automations', () => {
    mount();
    expect(screen.getByText('daily recipients')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'daily' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'all_periodic' }));
    expect(screen.getByText('periodic all')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'automations' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText('automation settings')).toBeInTheDocument();
  });
  it('honors old periodic URLs and cadence', () => {
    mount('?view=periodic&reportCadence=quarterly', {
      initialView: 'periodic',
    });
    expect(screen.getByText('periodic quarterly')).toBeInTheDocument();
  });
  it('does not show a forbidden daily surface from a retained URL', () => {
    mount('?view=daily', { canViewDaily: false });
    expect(
      screen.queryByRole('button', { name: 'daily' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('periodic monthly')).toBeInTheDocument();
  });
});
