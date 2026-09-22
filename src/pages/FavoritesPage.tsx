import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { HeartIcon } from '../components/Icon'
import EventCard from '../components/EventCard'
import { getFavoriteEventIds } from '../lib/favorites'
import type { Event } from '../lib/types'

type Props = { navigate: (p: string, extra?: unknown) => void }

export default function FavoritesPage({ navigate }: Props) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const ids = getFavoriteEventIds()
    if (!ids.length) { setEvents([]); setLoading(false); return }
    const { data } = await supabase
      .from('events')
      .select('*, tags, ticket_tiers(id, event_id, name, price, description, ticket_type, extra_info, expires_at, group_size, quantity, sold, created_at), organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles(id, full_name, username, profile_image, avatar_url, cover_image, email))')
      .in('id', ids)
    setEvents((data as Event[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const refresh = () => load()
    window.addEventListener('tiketi:favorites-changed', refresh)
    const profilesChannel = supabase.channel('public-profiles-favorites')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh)
      .subscribe()
    return () => {
      window.removeEventListener('tiketi:favorites-changed', refresh)
      void supabase.removeChannel(profilesChannel)
    }
  }, [])

  return (
    <main className="favorites-page">
      <section className="favorites-header"><p className="favorites-kicker">YOUR COLLECTION</p><div className="favorites-title-row"><div><h1>Favorites</h1><p>Events you want to remember.</p></div><div className="favorites-heart"><HeartIcon size={24} filled /></div></div></section>
      <section className="favorites-content">
        {loading ? <p className="favorites-empty">Loading your favorites...</p> : events.length === 0 ? <div className="favorites-empty"><HeartIcon size={34} /><h2>No favorites yet</h2><p>Save an event with the heart button and it will appear here.</p><button onClick={() => navigate('events')}>Explore events</button></div> : <div className="favorites-grid">{events.map(event => <EventCard key={event.id} event={event} compact onClick={() => navigate('event-detail', event)} />)}</div>}
      </section>
    </main>
  )
}
