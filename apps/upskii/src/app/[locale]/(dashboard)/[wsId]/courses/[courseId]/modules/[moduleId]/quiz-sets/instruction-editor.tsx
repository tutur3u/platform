"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@tuturuuu/ui/button"
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import type { JSONContent } from "@tiptap/react"

interface InstructionEditorProps {
  quizSetId: string
  instruction: JSONContent | null
  setInstruction: (instruction: JSONContent) => void
}

export default function InstructionEditor({ quizSetId, instruction, setInstruction }: InstructionEditorProps) {
  const t = useTranslations()
  const [saving, setSaving] = useState(false)

  const INSTRUCTION_EDITOR_KEY = `instruction-quiz-set-${quizSetId}`

  const handleSave = async () => {
    setSaving(true)
    if (instruction) {
      localStorage.setItem(INSTRUCTION_EDITOR_KEY, JSON.stringify(instruction))
    }
    setSaving(false)
  }

  return (
    <div className="w-full">
      <div className="rounded-lg overflow-hidden bg-dynamic-purple/10">
        <RichTextEditor content={instruction} onChange={setInstruction} />
      </div>

      <div className="mt-4">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-dynamic-purple/30 border border-dynamic-purple text-secondary-foreground hover:bg-dynamic-purple/50"
          size="sm"
        >
          {saving ? t("ws-quiz-sets.form-fields.instruction.saving") || "Saving..." : t("ws-quiz-sets.form-fields.instruction.save")}
        </Button>
      </div>
    </div>
  )
}
