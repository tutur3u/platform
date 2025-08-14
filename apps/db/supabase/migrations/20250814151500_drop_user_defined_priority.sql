-- Override user_defined_priority with mapped values from priority field
-- 1 = critical, 2 = high, 3 = normal, 4 = low, others/null = null

UPDATE "public"."tasks" 
SET "user_defined_priority" = CASE 
    WHEN "priority" = 1 THEN 'critical'::task_priority
    WHEN "priority" = 2 THEN 'high'::task_priority  
    WHEN "priority" = 3 THEN 'normal'::task_priority
    WHEN "priority" = 4 THEN 'low'::task_priority
    ELSE NULL
END;

-- Drop the original priority field
ALTER TABLE "public"."tasks" DROP COLUMN "priority";

-- Rename user_defined_priority to priority
ALTER TABLE "public"."tasks" RENAME COLUMN "user_defined_priority" TO "priority";
