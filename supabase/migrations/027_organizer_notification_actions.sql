CREATE OR REPLACE FUNCTION public.notify_organizer_member_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE role_name TEXT;
BEGIN
  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    SELECT name INTO role_name FROM public.organizer_roles WHERE id = NEW.role_id;
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, recipient_scope)
    VALUES (NEW.user_id, NEW.organizer_id, 'team', 'Team role updated', CASE WHEN role_name IS NULL THEN 'Your organizer team role was removed.' ELSE 'Your organizer team role is now ' || role_name || '.' END, 'organizer');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_member_role_change ON public.organizer_members;
CREATE TRIGGER notify_organizer_member_role_change
AFTER UPDATE OF role_id ON public.organizer_members
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_member_role_change();

CREATE OR REPLACE FUNCTION public.notify_organizer_member_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_organizer_audience(NEW.organizer_id, 'members', 'team', 'Team invitation sent', 'A new team member invitation is waiting for acceptance.', NULL);
  ELSIF OLD.status = 'pending' AND NEW.status = 'active' THEN
    PERFORM public.notify_organizer_audience(NEW.organizer_id, 'members', 'team', 'Team invitation accepted', 'A team member accepted the organizer invitation.', NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_member_change ON public.organizer_members;
CREATE TRIGGER notify_organizer_member_change
AFTER INSERT OR UPDATE OF status ON public.organizer_members
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_member_change();

CREATE OR REPLACE FUNCTION public.notify_organizer_role_permission_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, recipient_scope)
    SELECT members.user_id, NEW.organizer_id, 'team', 'Team permissions updated', 'The permissions for your ' || NEW.name || ' role were updated.', 'organizer'
    FROM public.organizer_members AS members
    WHERE members.organizer_id = NEW.organizer_id AND members.role_id = NEW.id AND members.status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_role_permission_change ON public.organizer_roles;
CREATE TRIGGER notify_organizer_role_permission_change
AFTER UPDATE OF permissions ON public.organizer_roles
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_role_permission_change();

CREATE OR REPLACE FUNCTION public.notify_organizer_tier_inventory()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_organizer UUID; event_title TEXT; remaining INTEGER;
BEGIN
  remaining := GREATEST(0, NEW.quantity - NEW.sold);
  SELECT events.organizer_id, events.title INTO target_organizer, event_title FROM public.events WHERE events.id = NEW.event_id;
  IF TG_OP = 'INSERT' OR OLD.sold IS DISTINCT FROM NEW.sold OR OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    IF remaining = 0 THEN
      PERFORM public.notify_organizer_audience(target_organizer, 'orders', 'event', 'Ticket tier sold out', COALESCE(event_title, 'Your event') || ' - ' || NEW.name || ' is sold out.', NEW.event_id);
    ELSIF remaining <= 10 THEN
      PERFORM public.notify_organizer_audience(target_organizer, 'orders', 'event', 'Low ticket inventory', COALESCE(event_title, 'Your event') || ' - ' || NEW.name || ' has ' || remaining || ' tickets remaining.', NEW.event_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_tier_inventory_on_change ON public.ticket_tiers;
CREATE TRIGGER notify_organizer_tier_inventory_on_change
AFTER INSERT OR UPDATE OF sold, quantity ON public.ticket_tiers
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_tier_inventory();
