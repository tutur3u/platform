'use client';

import type { JSONContent } from '@tiptap/react';
import { Button } from '@tuturuuu/ui/button';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface InstructionEditorProps {
  quizSetId: string;
  instruction: JSONContent | null;
  setInstruction: (instruction: JSONContent) => void;
}

export default function InstructionEditor({
  quizSetId,
  instruction,
  setInstruction,
}: InstructionEditorProps) {
  const t = useTranslations();
  const [saving, setSaving] = useState(false);

  const INSTRUCTION_EDITOR_KEY = `instruction-quiz-set-${quizSetId}`;

  const handleSave = async () => {
    setSaving(true);
    if (instruction) {
      localStorage.setItem(INSTRUCTION_EDITOR_KEY, JSON.stringify(instruction));
    }
    setSaving(false);
  };

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-lg bg-dynamic-purple/10">
        <RichTextEditor content={instruction} onChange={setInstruction} />
      </div>

      <div className="mt-4">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="border border-dynamic-purple bg-dynamic-purple/30 text-secondary-foreground hover:bg-dynamic-purple/50"
          size="sm"
        >
          {saving
            ? t('ws-quiz-sets.form-fields.instruction.saving') || 'Saving...'
            : t('ws-quiz-sets.form-fields.instruction.save')}
        </Button>
      </div>
    </div>
  );
}
