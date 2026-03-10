-- Add section-end branching support to form_logic_rules.
-- Supports: question-based (existing), section-end completion-only, section-end question-based.

ALTER TABLE "public"."form_logic_rules"
  ADD COLUMN IF NOT EXISTS "trigger_type" text NOT NULL DEFAULT 'question',
  ADD COLUMN IF NOT EXISTS "source_section_id" uuid REFERENCES "public"."form_sections"("id") ON DELETE CASCADE;

ALTER TABLE "public"."form_logic_rules"
  ALTER COLUMN "source_question_id" DROP NOT NULL;

ALTER TABLE "public"."form_logic_rules"
  DROP CONSTRAINT IF EXISTS "form_logic_rules_trigger_type_check";

ALTER TABLE "public"."form_logic_rules"
  ADD CONSTRAINT "form_logic_rules_trigger_type_check"
  CHECK ("trigger_type" IN ('question', 'section_end'));

-- Backfill source_section_id for existing question-based rules from the question's section.
UPDATE "public"."form_logic_rules" r
SET "source_section_id" = q.section_id
FROM "public"."form_questions" q
WHERE r.source_question_id = q.id
  AND r.trigger_type = 'question'
  AND r.source_section_id IS NULL;

CREATE INDEX IF NOT EXISTS "form_logic_rules_form_id_source_section_id_idx"
  ON "public"."form_logic_rules" ("form_id", "source_section_id", "priority")
  WHERE "source_section_id" IS NOT NULL;
