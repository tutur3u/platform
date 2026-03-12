import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MiraModelSelectorTriggerButton } from '../mira-model-selector/mira-model-selector-trigger-button';

describe('MiraModelSelectorTriggerButton', () => {
  it('forwards button props needed by Radix asChild triggers', () => {
    const handleClick = vi.fn();

    render(
      <MiraModelSelectorTriggerButton
        aria-expanded={false}
        data-state="closed"
        defaultModelId="google/gemini-2.5-flash"
        model={{
          label: 'gemini-2.5-flash',
          provider: 'google',
          value: 'google/gemini-2.5-flash',
        }}
        modelDefaultBadgeLabel="default"
        onClick={handleClick}
      />
    );

    const trigger = screen.getByRole('button');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('data-state', 'closed');

    fireEvent.click(trigger);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
