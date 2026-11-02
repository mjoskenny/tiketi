-- Harden the admin-managed organizer role catalog introduced in migration 085.
-- Preserve memberships while normalizing and deduplicating legacy role names.

-- Remove the earlier trigger while deduplicating; its DELETE path returned NEW,
-- which is NULL for DELETE and would silently cancel every role deletion.
DROP TRIGGER IF EXISTS protect_organizer_admin_role_mutation ON public.organizer_roles;

UPDATE public.organizer_roles
SET name = CASE
  WHEN lower(btrim(name)) = 'scanner' THEN 'Check-in Staff'
  WHEN lower(btrim(name)) = 'admin' THEN 'Admin'
  ELSE btrim(name)
END
WHERE name IS DISTINCT FROM btrim(name)
   OR lower(btrim(name)) IN ('scanner', 'admin');

UPDATE public.organizer_roles
SET name = 'Custom role ' || left(id::text, 8)
WHERE btrim(name) = '';

WITH ranked_roles AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY organizer_id, lower(name)
           ORDER BY (lower(name) = 'admin') DESC, created_at, id
         ) AS keep_id,
         row_number() OVER (
           PARTITION BY organizer_id, lower(name)
           ORDER BY (lower(name) = 'admin') DESC, created_at, id
         ) AS row_number
  FROM public.organizer_roles
), duplicates AS (
  SELECT id, keep_id FROM ranked_roles WHERE row_number > 1
)
UPDATE public.organizer_members AS members
SET role_id = duplicates.keep_id
FROM duplicates
WHERE members.role_id = duplicates.id;

WITH ranked_roles AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organizer_id, lower(name)
           ORDER BY (lower(name) = 'admin') DESC, created_at, id
         ) AS row_number
  FROM public.organizer_roles
)
DELETE FROM public.organizer_roles AS roles
USING ranked_roles
WHERE roles.id = ranked_roles.id
  AND ranked_roles.row_number > 1;

UPDATE public.organizer_roles
SET permissions = '{"all": true}'::jsonb
WHERE lower(name) = 'admin';

CREATE UNIQUE INDEX IF NOT EXISTS organizer_roles_organizer_name_unique_idx
  ON public.organizer_roles (organizer_id, lower(name));

-- Seed any missing presets for existing organizers. Existing non-Admin presets
-- retain administrator-customized permissions; Admin always keeps full access.
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
ON CONFLICT (organizer_id, (lower(name))) DO NOTHING;

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
  ON CONFLICT (organizer_id, (lower(name))) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_default_organizer_roles_on_create ON public.organizers;
CREATE TRIGGER seed_default_organizer_roles_on_create
AFTER INSERT ON public.organizers
FOR EACH ROW EXECUTE FUNCTION public.seed_default_organizer_roles();

CREATE OR REPLACE FUNCTION public.protect_organizer_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF lower(btrim(OLD.name)) = 'admin' THEN
      RAISE EXCEPTION 'The built-in Admin role cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF lower(btrim(NEW.name)) = 'admin'
       AND NEW.permissions -> 'all' IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION 'The built-in Admin role must retain full access';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id THEN
    RAISE EXCEPTION 'A role cannot be moved to another organization';
  END IF;

  IF lower(btrim(OLD.name)) = 'admin' THEN
    IF lower(btrim(NEW.name)) <> 'admin'
       OR NEW.permissions -> 'all' IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION 'The built-in Admin role must retain its name and full access';
    END IF;
  ELSIF lower(btrim(NEW.name)) = 'admin' THEN
    RAISE EXCEPTION 'The built-in Admin role cannot be recreated or renamed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_organizer_admin_role_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.organizer_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_organizer_admin_role();

-- Make role reads available to the owning organizer, active team members, and
-- platform admins, while restricting all role mutations to platform admins.
DO $$
DECLARE policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizer_roles'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.organizer_roles', policy_row.policyname);
  END LOOP;
END;
$$;

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

-- Only the organization owner may assign a role, including during INSERT.
-- Keep invite acceptance and authorized member-status changes available.
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

  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.organizers
      WHERE id = NEW.organizer_id AND user_id = auth.uid()
    ) INTO is_owner;

    IF NEW.role_id IS NOT NULL AND NOT is_owner THEN
      RAISE EXCEPTION 'Only the organizer owner can assign team roles';
    END IF;
    IF NEW.role_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.organizer_roles
      WHERE id = NEW.role_id AND organizer_id = NEW.organizer_id
    ) THEN
      RAISE EXCEPTION 'Choose a role from this organizer';
    END IF;
    RETURN NEW;
  END IF;

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

DROP TRIGGER IF EXISTS protect_organizer_membership_on_update ON public.organizer_members;
CREATE TRIGGER protect_organizer_membership_on_update
BEFORE INSERT OR UPDATE ON public.organizer_members
FOR EACH ROW EXECUTE FUNCTION public.protect_organizer_membership();
