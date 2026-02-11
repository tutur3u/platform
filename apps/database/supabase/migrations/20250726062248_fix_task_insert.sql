-- Fix task insert issue with tags column

-- First, drop the NOT NULL constraint to allow NULL values during insert
ALTER TABLE "public"."tasks" 
ALTER COLUMN "tags" DROP NOT NULL;

-- Update the default value to ensure it's properly applied
ALTER TABLE "public"."tasks" 
ALTER COLUMN "tags" SET DEFAULT ARRAY[]::text[];

-- Add a trigger to ensure tags is never NULL after insert/update
CREATE OR REPLACE FUNCTION ensure_tags_not_null()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If tags is NULL, set it to empty array
  IF NEW.tags IS NULL THEN
    NEW.tags = ARRAY[]::text[];
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to ensure tags is never NULL
CREATE TRIGGER trg_ensure_tags_not_null
  BEFORE INSERT OR UPDATE ON "public"."tasks"
  FOR EACH ROW
  EXECUTE FUNCTION ensure_tags_not_null();

-- Grant execute permission on the new function
GRANT EXECUTE ON FUNCTION ensure_tags_not_null() TO authenticated;
