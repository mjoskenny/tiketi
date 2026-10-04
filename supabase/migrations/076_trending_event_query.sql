-- Return only the highest-ranked upcoming published events for the home trending rail.
-- Sales and sell-through are aggregated in Postgres, so the client does not load
-- every published event just to calculate the small trending subset.
CREATE OR REPLACE FUNCTION public.get_trending_event_ids(p_limit INTEGER DEFAULT 6)
RETURNS TABLE (
  event_id UUID,
  tickets_sold BIGINT,
  sell_through NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    events.id AS event_id,
    COALESCE(SUM(ticket_tiers.sold), 0)::BIGINT AS tickets_sold,
    CASE
      WHEN COALESCE(SUM(ticket_tiers.quantity), 0) > 0
        THEN COALESCE(SUM(ticket_tiers.sold), 0)::NUMERIC / SUM(ticket_tiers.quantity)
      ELSE 0::NUMERIC
    END AS sell_through
  FROM public.events AS events
  LEFT JOIN public.ticket_tiers AS ticket_tiers ON ticket_tiers.event_id = events.id
  WHERE events.status = 'published'
    AND (events.date + events.time) > NOW()
  GROUP BY events.id
  ORDER BY
    COALESCE(SUM(ticket_tiers.sold), 0) DESC,
    CASE
      WHEN COALESCE(SUM(ticket_tiers.quantity), 0) > 0
        THEN COALESCE(SUM(ticket_tiers.sold), 0)::NUMERIC / SUM(ticket_tiers.quantity)
      ELSE 0::NUMERIC
    END DESC,
    events.date ASC,
    events.time ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 6), 1), 12);
$$;

REVOKE ALL ON FUNCTION public.get_trending_event_ids(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trending_event_ids(INTEGER) TO anon, authenticated;
