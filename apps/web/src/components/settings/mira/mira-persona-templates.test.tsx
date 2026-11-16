// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MiraPersonaTemplatePicker } from './mira-persona-template-picker';
import {
  matchingPersonaTemplate,
  personaTemplateUpdate,
  personaUndoUpdate,
} from './mira-persona-templates';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

const customSoul = {
  name: 'Nova',
  tone: 'formal',
  vibe: 'calm',
  chat_tone: 'brief',
  personality: 'My own long personality text',
};

describe('persona template helpers', () => {
  it('never changes the assistant name and keeps the text unless asked', () => {
    expect(personaTemplateUpdate('casual', null)).toEqual({
      tone: 'casual',
      vibe: 'energetic',
      chat_tone: 'concise',
    });
    expect(personaTemplateUpdate('casual', 'New text')).toMatchObject({
      personality: 'New text',
    });
    expect(personaTemplateUpdate('casual', 'New text')).not.toHaveProperty(
      'name'
    );
  });

  it('matches the current style to a template or reports custom', () => {
    expect(
      matchingPersonaTemplate({
        tone: 'balanced',
        vibe: 'warm',
        chat_tone: 'thorough',
      })
    ).toBe('default');
    expect(
      matchingPersonaTemplate({
        tone: customSoul.tone,
        vibe: customSoul.vibe,
        chat_tone: customSoul.chat_tone,
      })
    ).toBeNull();
  });

  it('undo restores style, and the text only when the template replaced it', () => {
    expect(personaUndoUpdate(customSoul, { tone: 'casual' })).toEqual({
      tone: 'formal',
      vibe: 'calm',
      chat_tone: 'brief',
    });
    expect(
      personaUndoUpdate(customSoul, { tone: 'casual', personality: 'x' })
    ).toMatchObject({ personality: 'My own long personality text' });
  });
});

describe('MiraPersonaTemplatePicker', () => {
  it('shows Custom when no template matches and previews before applying', () => {
    const onApply = vi.fn();
    render(
      <MiraPersonaTemplatePicker
        disabled={false}
        onApply={onApply}
        soul={customSoul}
      />
    );

    expect(screen.getByText('template_custom')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /template_coach/ }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('Formal → Professional')).toBeTruthy();
    expect(screen.getByText('template_keep_text')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'apply_template' }));
    expect(onApply).toHaveBeenCalledWith('coach', {
      tone: 'professional',
      vibe: 'calm',
      chat_tone: 'brief',
    });
  });

  it('replaces the personality text only after opting in', () => {
    const onApply = vi.fn();
    render(
      <MiraPersonaTemplatePicker
        disabled={false}
        onApply={onApply}
        soul={customSoul}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /template_creative/ }));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('template_creative_personality')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'apply_template' }));

    expect(onApply).toHaveBeenCalledWith(
      'creative',
      expect.objectContaining({ personality: 'template_creative_personality' })
    );
  });

  it('marks the matching template as current', () => {
    render(
      <MiraPersonaTemplatePicker
        disabled={false}
        onApply={vi.fn()}
        soul={{
          ...customSoul,
          tone: 'casual',
          vibe: 'energetic',
          chat_tone: 'concise',
        }}
      />
    );

    expect(screen.queryByText('template_custom')).toBeNull();
    expect(
      screen.getByRole('button', { name: /template_casual/ }).textContent
    ).toContain('template_current');
  });
});
