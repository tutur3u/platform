-- Rename existing columns to temporary names
ALTER TABLE "public"."nova_submission_outputs" RENAME COLUMN "id" TO "id1";
ALTER TABLE "public"."nova_submission_outputs" RENAME COLUMN "submission_id" TO "submission_id1";

-- Add new UUID columns
ALTER TABLE "public"."nova_submission_outputs" ADD COLUMN "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE "public"."nova_submission_outputs" ADD COLUMN "submission_id" uuid NOT NULL;

-- Drop old columns
ALTER TABLE "public"."nova_submission_outputs" DROP COLUMN "id1";
ALTER TABLE "public"."nova_submission_outputs" DROP COLUMN "submission_id1";

-- Add primary key constraint
ALTER TABLE "public"."nova_submission_outputs" ADD CONSTRAINT "nova_submission_outputs_pkey" PRIMARY KEY ("id");

-- Add foreign key constraint
ALTER TABLE "public"."nova_submission_outputs" ADD CONSTRAINT "nova_submission_outputs_submission_id_fkey" 
  FOREIGN KEY (submission_id) REFERENCES nova_submissions(id) ON UPDATE CASCADE ON DELETE CASCADE;




