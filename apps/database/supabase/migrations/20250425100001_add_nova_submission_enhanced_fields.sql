-- Add confidence and reasoning columns to nova_submission_test_cases
ALTER TABLE nova_submission_test_cases 
ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS reasoning TEXT DEFAULT '';

-- Add strengths and improvements columns to nova_submission_criteria
ALTER TABLE nova_submission_criteria
ADD COLUMN IF NOT EXISTS strengths TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS improvements TEXT[] DEFAULT '{}';

-- Add overall assessment and total score columns to nova_submissions
ALTER TABLE nova_submissions
ADD COLUMN IF NOT EXISTS overall_assessment TEXT DEFAULT '';