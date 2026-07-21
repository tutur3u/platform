import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { YoutubeRow } from './lesson-components';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('YoutubeRow', () => {
  it('does not render untrusted protocols as links', () => {
    render(<YoutubeRow onRemove={vi.fn()} url="javascript:alert(1)" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeDefined();
  });

  it('uses a canonical YouTube URL after validating the video id', () => {
    render(
      <YoutubeRow
        onRemove={vi.fn()}
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ&ignored=true"
      />
    );

    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
  });
});
