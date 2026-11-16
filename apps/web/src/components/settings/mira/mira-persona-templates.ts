import type {
  MiraSoul,
  MiraSoulUpdate,
} from '@tuturuuu/internal-api/mira-soul';

export const PERSONA_TEMPLATE_KEYS = [
  'default',
  'casual',
  'coach',
  'creative',
] as const;

export type PersonaTemplateKey = (typeof PERSONA_TEMPLATE_KEYS)[number];

export type PersonaStyle = {
  tone: string;
  vibe: string;
  chat_tone: string;
};

export const PERSONA_TEMPLATE_STYLES: Record<PersonaTemplateKey, PersonaStyle> =
  {
    default: { tone: 'balanced', vibe: 'warm', chat_tone: 'thorough' },
    casual: { tone: 'casual', vibe: 'energetic', chat_tone: 'concise' },
    coach: { tone: 'professional', vibe: 'calm', chat_tone: 'brief' },
    creative: { tone: 'playful', vibe: 'witty', chat_tone: 'detailed' },
  };

/** The soul's style with the same fallbacks the settings selects show. */
export function currentPersonaStyle(
  soul: Pick<MiraSoul, 'tone' | 'vibe' | 'chat_tone'> | undefined
): PersonaStyle {
  return {
    tone: soul?.tone ?? 'balanced',
    vibe: soul?.vibe ?? 'warm',
    chat_tone: soul?.chat_tone ?? 'thorough',
  };
}

export function matchingPersonaTemplate(
  style: PersonaStyle
): PersonaTemplateKey | null {
  return (
    PERSONA_TEMPLATE_KEYS.find((key) => {
      const template = PERSONA_TEMPLATE_STYLES[key];
      return (
        template.tone === style.tone &&
        template.vibe === style.vibe &&
        template.chat_tone === style.chat_tone
      );
    }) ?? null
  );
}

/**
 * The update a template applies. It never touches the assistant name, and it
 * replaces the personality text only when the user opts in.
 */
export function personaTemplateUpdate(
  key: PersonaTemplateKey,
  replacementText: string | null
): MiraSoulUpdate {
  return {
    ...PERSONA_TEMPLATE_STYLES[key],
    ...(replacementText !== null ? { personality: replacementText } : {}),
  };
}

/** Values to restore if the user undoes a template. */
export function personaUndoUpdate(
  soul: Pick<MiraSoul, 'tone' | 'vibe' | 'chat_tone' | 'personality'>,
  applied: MiraSoulUpdate
): MiraSoulUpdate {
  const style = currentPersonaStyle(soul);
  return {
    ...style,
    ...('personality' in applied
      ? { personality: soul.personality ?? '' }
      : {}),
  };
}
