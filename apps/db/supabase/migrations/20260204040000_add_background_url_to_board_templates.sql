-- Add background_url column to board_templates table
-- Stores the URL of the optional background image for the template

ALTER TABLE "public"."board_templates"
ADD COLUMN "background_url" text;
