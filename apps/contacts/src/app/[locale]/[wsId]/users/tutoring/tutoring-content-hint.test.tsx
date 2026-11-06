import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  RequireAttentionHelp,
  TutoringContentHint,
} from './tutoring-content-hint';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('tutoring content hint', () => {
  it.each([
    [true, true],
    [false, false],
  ])('show=%s renders hint=%s', (show, visible) => {
    render(<TutoringContentHint show={show} />);
    expect(!!screen.queryByText('tutoring_content_hint')).toBe(visible);
  });

  it.each([
    [true, true],
    [false, false],
  ])('attention help with tutoring=%s shows hint=%s', (tutoring, visible) => {
    render(<RequireAttentionHelp tutoring={tutoring} />);
    expect(screen.getByText('requires_attention_description')).toBeTruthy();
    expect(!!screen.queryByText('tutoring_content_hint')).toBe(visible);
  });
});
