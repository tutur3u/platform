import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormPreview } from './preview-foundation-controls';

const sample = (key: string) =>
  (
    ({
      formDescription: 'Shown with React Hook Form context.',
      validated: 'Validated',
      workspaceName: 'Workspace name',
      workspacePlaceholder: 'Tuturuuu',
    }) satisfies Record<string, string>
  )[key] ?? key;

describe('FormPreview', () => {
  it('renders the shared form primitives inside a form context', () => {
    expect(() => render(<FormPreview s={sample} />)).not.toThrow();

    expect(screen.getByLabelText('Workspace name')).toHaveValue('Tuturuuu');
    expect(
      screen.getByText('Shown with React Hook Form context.')
    ).toBeInTheDocument();
  });
});
