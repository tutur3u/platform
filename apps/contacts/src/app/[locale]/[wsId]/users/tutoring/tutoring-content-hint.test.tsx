import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  RequireAttentionHelp,
  TutoringContentHint,
} from './tutoring-content-hint';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated_${key}`,
}));

describe('TutoringContentHint', () => {
  it('returns null when show is false', () => {
    const { container } = render(<TutoringContentHint show={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders hint text when show is true', () => {
    render(<TutoringContentHint show={true} />);
    expect(
      screen.getByText('translated_tutoring_content_hint')
    ).toBeInTheDocument();
  });
});

describe('RequireAttentionHelp', () => {
  it('renders attention description without tutoring hint when tutoring is false', () => {
    render(<RequireAttentionHelp tutoring={false} />);
    expect(
      screen.getByText('translated_requires_attention_description')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('translated_tutoring_content_hint')
    ).not.toBeInTheDocument();
  });

  it('renders both description and hint when tutoring is true', () => {
    render(<RequireAttentionHelp tutoring={true} />);
    expect(
      screen.getByText('translated_requires_attention_description')
    ).toBeInTheDocument();
    expect(
      screen.getByText('translated_tutoring_content_hint')
    ).toBeInTheDocument();
  });
});
