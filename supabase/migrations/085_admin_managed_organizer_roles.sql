-- Default role definitions are provisioned by the database and managed only by
-- platform administrators. Organizers can assign these definitions to members.
CREATE OR REPLACE FUNCTION public.seed_default_organizer_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organizer_roles (organizer_id, name, permissions)
  VALUES
    (NEW.id, 'Admin', '{"all": true}'::jsonb),
    (NEW.id, 'Event Manager', '{"events": true, "orders": true, "customers": true, "transactions": true, "calendar": true, "analytics": true, "checkin": true}'::jsonb),
    (NEW.id, 'Agent', '{"sell": true}'::jsonb),
    (NEW.id, 'Check-in Staff', '{"checkin": true}'::jsonb),
    (NEW.id, 'Finance Viewer', '{"transactions": true, "orders": true, "analytics": true}'::jsonb)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Normalize legacy names before inserting any missing presets.
UPDATE public.organizer_roles
SET name = 'Check-in Staff'
WHERE lower(name) = 'scanner'
  AND NOT EXISTS (
    SELECT 1 FROM public.organizer_roles other_role
    WHERE other_role.organizer_id = organizer_roles.organizer_id
      AND lower(other_role.name) = 'check-in staff'
  );

-- Add the curated presets to every existing organizer.
INSERT INTO public.organizer_roles (organizer_id, name, permissions)
SELECT organizers.id, presets.name, presets.permissions
FROM public.organizers
CROSS JOIN (VALUES
  ('Admin', '{"all": true}'::jsonb),
  ('Event Manager', '{"events": true, "orders": true, "customers": true, "transactions": true, "calendar": true, "analytics": true, "checkin": true}'::jsonb),
  ('Agent', '{"sell": true}'::jsonb),
  ('Check-in Staff', '{"checkin": true}'::jsonb),
  ('Finance Viewer', '{"transactions": true, "orders": true, "analytics": true}'::jsonb)
) AS presets(name, permissions)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organizer_roles existing
  WHERE existing.organizer_id = organizers.id
    AND lower(existing.name) = lower(presets.name)
);

UPDATE public.organizer_roles
SET permissions = '{"all": true}'::jsonb
WHERE lower(name) = 'admin';

CREATE OR REPLACE FUNCTION public.protect_organizer_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(OLD.name) = 'admin' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'The built-in Admin role cannot be deleted';
    END IF;
    IF lower(NEW.name) <> 'admin' OR COALESCE((NEW.permissions ->> 'all')::BOOLEAN, FALSE) IS NOT TRUE THEN
      RAISE EXCEPTION 'The built-in Admin role must retain its name and full access';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_organizer_admin_role_mutation ON public.organizer_roles;
CREATE TRIGGER protect_organizer_admin_role_mutation
BEFORE UPDATE OR DELETE ON public.organizer_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_organizer_admin_role();

DROP TRIGGER IF EXISTS seed_default_organizer_roles_on_create ON public.organizers;
CREATE TRIGGER seed_default_organizer_roles_on_create
AFTER INSERT ON public.organizers
FOR EACH ROW EXECUTE FUNCTION public.seed_default_organizer_roles();

-- Remove owner/team mutation policies and replace them with platform-admin-only
-- role management. Existing owners and active members retain read access.
DROP POLICY IF EXISTS "roles_organizer" ON public.organizer_roles;
DROP POLICY IF EXISTS "roles_team_read" ON public.organizer_roles;
DROP POLICY IF EXISTS "roles_team_manage" ON public.organizer_roles;
DROP POLICY IF EXISTS "organizer_roles_admin_manage" ON public.organizer_roles;
CREATE POLICY "organizer_roles_team_read" ON public.organizer_roles
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = organizer_roles.organizer_id
        AND organizers.user_id = auth.uid()
    )
    OR public.is_organizer_member(organizer_roles.organizer_id)
  );
CREATE POLICY "organizer_roles_admin_manage" ON public.organizer_roles
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Team leads may manage member status, but only the owner may set a member's
-- role. Also reject role IDs belonging to a different organizer.
CREATE OR REPLACE FUNCTION public.protect_organizer_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_owner BOOLEAN;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.organizers
    WHERE id = OLD.organizer_id AND user_id = auth.uid()
  ) INTO is_owner;

  IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Membership owner and organizer cannot change';
  END IF;

  IF NOT is_owner AND OLD.status = 'pending' AND NEW.status = 'active'
     AND auth.uid() = OLD.user_id
     AND NEW.role_id IS NOT DISTINCT FROM OLD.role_id THEN
    RETURN NEW;
  END IF;

  IF NOT is_owner AND NOT public.has_organizer_permission(OLD.organizer_id, 'members') THEN
    RAISE EXCEPTION 'You do not have permission to modify this membership';
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id AND NOT is_owner THEN
    RAISE EXCEPTION 'Only the organizer owner can assign team roles';
  END IF;

  IF NEW.role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organizer_roles
    WHERE id = NEW.role_id AND organizer_id = OLD.organizer_id
  ) THEN
    RAISE EXCEPTION 'Choose a role from this organizer';
  END IF;

  RETURN NEW;
END;
$$;
