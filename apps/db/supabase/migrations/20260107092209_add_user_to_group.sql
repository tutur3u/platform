-- Add creator_id and color to workspace_user_groups
ALTER TABLE public.workspace_user_groups
ADD COLUMN creator_id UUID REFERENCES public.users(id) DEFAULT auth.uid(),
ADD COLUMN color TEXT;

-- Function to handle workspace user group creator assignment
CREATE OR REPLACE FUNCTION public.handle_workspace_user_group_creator_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_virtual_user_id UUID;
BEGIN
  -- We need to find the virtual_user_id for the creator within the same workspace
  -- This is stored in workspace_user_linked_users table
  SELECT virtual_user_id INTO v_virtual_user_id
  FROM public.workspace_user_linked_users
  WHERE platform_user_id = NEW.creator_id
    AND ws_id = NEW.ws_id;

  -- If we found a virtual user ID, we insert them into the group_users table with the TEACHER role
  IF v_virtual_user_id IS NOT NULL THEN
    INSERT INTO public.workspace_user_groups_users (group_id, user_id, role)
    VALUES (NEW.id, v_virtual_user_id, 'TEACHER')
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute the function after insertion
CREATE TRIGGER on_workspace_user_group_created
AFTER INSERT ON public.workspace_user_groups
FOR EACH ROW
EXECUTE FUNCTION public.handle_workspace_user_group_creator_assignment();
