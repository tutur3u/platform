-- Ensure workspace member deletes can clear task project leads even when the
-- caller does not retain direct task_projects write privileges inside the
-- trigger context.
CREATE OR REPLACE FUNCTION public.clear_task_projects_lead_on_member_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.task_projects
  SET lead_id = NULL
  WHERE ws_id = OLD.ws_id
    AND lead_id = OLD.user_id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.clear_task_projects_lead_on_member_delete() IS
  'Clears task_projects.lead_id when the corresponding workspace member is deleted. SECURITY DEFINER avoids caller permission failures during member removal.';
