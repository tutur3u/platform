CREATE OR REPLACE FUNCTION get_pending_event_participants(_event_id uuid) RETURNS integer AS $$
DECLARE participant_count integer;
BEGIN
SELECT COUNT(DISTINCT participant_id) INTO participant_count
FROM (
        SELECT p.participant_id
        FROM public.calendar_event_participants p
        WHERE p.event_id = _event_id
            AND (
                p.type <> 'user_group'
                AND p.going IS NULL
            )
        UNION ALL
        SELECT ugu.user_id
        FROM public.workspace_user_groups_users ugu
        WHERE ugu.group_id IN (
                SELECT wug.id
                FROM public.workspace_user_groups wug
                    JOIN public.calendar_event_participants p ON wug.id = p.participant_id
                WHERE p.event_id = _event_id
                    AND p.type = 'user_group'
                    AND p.going IS NULL
            )
            AND NOT EXISTS (
                SELECT 1
                FROM public.calendar_event_participants p
                WHERE p.event_id = _event_id
                    AND p.participant_id = ugu.user_id
                    AND p.type <> 'user_group'
            )
    ) AS subquery;
RETURN participant_count;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION audit.get_ws_id(table_name TEXT, record JSONB) RETURNS UUID LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE COST 100 AS $$ BEGIN IF table_name = 'workspaces' THEN RETURN (record->>'id')::UUID;
END IF;
IF table_name = 'wallet_transactions' THEN RETURN (
    SELECT ws_id
    FROM public.workspace_wallets
    WHERE id = (record->>'wallet_id')::UUID
);
END IF;
IF table_name = 'calendar_event_platform_participants'
OR table_name = 'calendar_event_virtual_participants'
OR table_name = 'calendar_event_participant_groups' THEN RETURN (
    SELECT ws_id
    FROM public.workspace_calendar_events
    WHERE id = (record->>'event_id')::UUID
);
END IF;
RETURN (record->>'ws_id')::UUID;
END;
$$;