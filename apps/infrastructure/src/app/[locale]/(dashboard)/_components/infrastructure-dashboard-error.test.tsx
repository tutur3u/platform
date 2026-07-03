import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfrastructureDashboardError } from './infrastructure-dashboard-error';

describe('InfrastructureDashboardError', () => {
  it('shows diagnostic details exposed by the Next error boundary', () => {
    const error = new Error(
      'SUPABASE_SECRET_KEY is not configured'
    ) as Error & {
      digest?: string;
    };
    error.name = 'InfrastructureConfigError';
    error.digest = 'digest-abc123';
    error.stack =
      'InfrastructureConfigError: SUPABASE_SECRET_KEY is not configured\n' +
      '    at createDashboardAdminClient (data-fetching.ts:32:11)';

    render(
      <InfrastructureDashboardError
        description="The view crashed."
        error={error}
        title="This infrastructure view could not load"
      />
    );

    expect(
      screen.getByRole('heading', {
        name: 'This infrastructure view could not load',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('InfrastructureConfigError')).toBeInTheDocument();
    expect(
      screen.getByText('SUPABASE_SECRET_KEY is not configured')
    ).toBeInTheDocument();
    expect(screen.getByText('digest: digest-abc123')).toBeInTheDocument();
    expect(screen.getByText(/createDashboardAdminClient/)).toBeInTheDocument();
  });
});
