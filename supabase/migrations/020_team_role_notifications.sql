CREATE OR REPLACE FUNCTION public.notify_organizer_member_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE role_name TEXT;
BEGIN
  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    SELECT name INTO role_name
    FROM public.organizer_roles
    WHERE id = NEW.role_id;

    INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
    VALUES (
      NEW.user_id,
      NEW.organizer_id,
      'team',
      'Team role updated',
      CASE
        WHEN role_name IS NULL THEN 'Your organizer team role was removed.'
        ELSE 'Your organizer team role is now ' || role_name || '.'
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_member_role_change ON public.organizer_members;
CREATE TRIGGER notify_organizer_member_role_change
AFTER UPDATE OF role_id ON public.organizer_members
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_member_role_change();

CREATE OR REPLACE FUNCTION public.notify_organizer_role_permission_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
    SELECT members.user_id,
      NEW.organizer_id,
      'team',
      'Team permissions updated',
      'The permissions for your ' || NEW.name || ' role were updated.'
    FROM public.organizer_members AS members
    WHERE members.organizer_id = NEW.organizer_id
      AND members.role_id = NEW.id
      AND members.status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_role_permission_change ON public.organizer_roles;
CREATE TRIGGER notify_organizer_role_permission_change
AFTER UPDATE OF permissions ON public.organizer_roles
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_role_permission_change();
