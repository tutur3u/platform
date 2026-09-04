CREATE OR REPLACE FUNCTION public.create_workspace_user_linked_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_workspace_user_id uuid;
  user_display_name text;
  user_email text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workspace_user_linked_users wul
    WHERE wul.platform_user_id = NEW.user_id
      AND wul.ws_id = NEW.ws_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT u.display_name, COALESCE(upd.email, '')
  INTO user_display_name, user_email
  FROM public.users u
  LEFT JOIN public.user_private_details upd ON upd.user_id = u.id
  WHERE u.id = NEW.user_id;

  IF user_display_name IS NULL THEN
    RETURN NEW;
  END IF;

  new_workspace_user_id := gen_random_uuid();

  INSERT INTO public.workspace_users (id, ws_id, display_name, email)
  VALUES (
    new_workspace_user_id,
    NEW.ws_id,
    user_display_name,
    user_email
  );

  INSERT INTO public.workspace_user_linked_users (
    platform_user_id,
    virtual_user_id,
    ws_id
  )
  VALUES (NEW.user_id, new_workspace_user_id, NEW.ws_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_first_workspace_as_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_private_details
    WHERE user_id = NEW.user_id
      AND default_workspace_id IS NOT NULL
  ) THEN
    UPDATE public.user_private_details
    SET default_workspace_id = NEW.ws_id
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;
