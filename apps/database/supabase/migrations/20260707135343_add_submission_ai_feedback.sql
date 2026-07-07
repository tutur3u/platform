-- Migration to add ai_feedback column to course_module_quiz_submissions
ALTER TABLE course_module_quiz_submissions
ADD COLUMN IF NOT EXISTS ai_feedback text;
