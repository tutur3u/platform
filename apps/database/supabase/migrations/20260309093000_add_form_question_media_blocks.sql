ALTER TABLE public.form_questions
ADD COLUMN IF NOT EXISTS image jsonb;

ALTER TABLE public.form_questions
DROP CONSTRAINT IF EXISTS form_questions_type_check;

ALTER TABLE public.form_questions
ADD CONSTRAINT form_questions_type_check CHECK (
  type IN (
    'short_text',
    'long_text',
    'single_choice',
    'multiple_choice',
    'dropdown',
    'linear_scale',
    'rating',
    'date',
    'time',
    'section_break',
    'rich_text',
    'image',
    'youtube',
    'divider'
  )
);
