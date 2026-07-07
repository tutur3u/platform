import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvalidReturnUrlWarning } from './invalid-return-url-warning';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('InvalidReturnUrlWarning', () => {
  it('shows the target origin and confirms URL clearing', () => {
    const onClear = vi.fn();

    render(
      <InvalidReturnUrlWarning
        onClear={onClear}
        returnUrl="https%3A%2F%2Fyashodauitwaru.com%2Fverify-token%3FnextUrl%3D%252Fadmin"
      />
    );

    expect(screen.getByText('login.invalid_return_url_title')).toBeTruthy();
    expect(screen.getByText('https://yashodauitwaru.com')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'login.clear_invalid_return_url',
      })
    );

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
