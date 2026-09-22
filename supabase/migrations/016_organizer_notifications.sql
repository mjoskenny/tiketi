ALTER TABLE public.notifications
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES public.organizers(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications
FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.organizers
    WHERE public.organizers.id = public.notifications.organizer_id
      AND public.organizers.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "notifications_mark_own" ON public.notifications;
CREATE POLICY "notifications_mark_own" ON public.notifications
FOR UPDATE USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.organizers
    WHERE public.organizers.id = public.notifications.organizer_id
      AND public.organizers.user_id = auth.uid()
  )
) WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.organizers
    WHERE public.organizers.id = public.notifications.organizer_id
      AND public.organizers.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS notifications_organizer_id_idx
  ON public.notifications (organizer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_organizer_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id)
    VALUES (
      NULL,
      NEW.organizer_id,
      'payment',
      'New order received',
      'A new order was placed for your event.',
      NEW.event_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_order_on_change ON public.orders;
CREATE TRIGGER notify_organizer_order_on_change
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_order();
