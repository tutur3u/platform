import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileDeploymentFieldHelp } from './mobile-deployment-field-help';

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values?.field ? `${key}:${values.field}` : key,
}));

describe('MobileDeploymentFieldHelp', () => {
  it('renders a guidance trigger for a known field', () => {
    render(<MobileDeploymentFieldHelp field="APPLE_TEAM_ID" />);
    expect(
      screen.getByRole('button', { name: 'guidance.ariaLabel:APPLE_TEAM_ID' })
    ).toBeInTheDocument();
  });

  it('renders nothing for a field without guidance', () => {
    const { container } = render(
      <MobileDeploymentFieldHelp field="CUSTOM_ENV_VAR" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
