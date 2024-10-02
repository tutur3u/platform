WITH first_non_null_creator AS (
    SELECT DISTINCT ON (chat_id)
           chat_id,
           FIRST_VALUE(creator_id) OVER (
               PARTITION BY chat_id
               ORDER BY CASE WHEN creator_id IS NOT NULL THEN 0 ELSE 1 END,
                        creator_id
               ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
           ) AS first_creator_id
    FROM ai_chat_messages
    WHERE creator_id IS NOT NULL
)
UPDATE ai_chat_messages acm
SET creator_id = fnc.first_creator_id
FROM first_non_null_creator fnc
WHERE acm.chat_id = fnc.chat_id
  AND (acm.creator_id IS NULL OR acm.creator_id != fnc.first_creator_id);

-- Add new UPDATE statement to set metadata for existing messages
UPDATE ai_chat_messages
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"source": "Tuturuuu"}'::jsonb
WHERE (metadata->>'source') IS NULL;

DROP FUNCTION IF EXISTS public.insert_ai_chat_message(message text, chat_id uuid);
CREATE OR REPLACE FUNCTION public.insert_ai_chat_message(
    message text, 
    chat_id uuid, 
    source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO ai_chat_messages (chat_id, content, creator_id, role, metadata)
    VALUES (
        chat_id, 
        message, 
        auth.uid(), 
        'USER', 
        jsonb_build_object('source', COALESCE(source, 'Unknown'))
    );
END;
$$;