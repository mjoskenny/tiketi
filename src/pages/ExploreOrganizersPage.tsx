import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, SearchIcon, CheckIcon, UsersIcon, SparkleIcon } from '../components/Icon'
import { supabase } from '../lib/supabase'
import type { Organizer } from '../lib/types'
import { ORGANIZER_COVER_PLACEHOLDER } from '../lib/profileMedia'

type Props = { navigate: (p: string, extra?: unknown) => void }
type OrganizerWithCover = Organizer & { cover_image: string | null; event_count: number }

export default function ExploreOrganizersPage({ navigate }: Props) {
  const [organizers, setOrganizers] = useState<OrganizerWithCover[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const loadOrganizers = async () => {
      setLoading(true)
      setLoadError('')
      const [{ data: organizerData }, { data: eventData }] = await Promise.all([
        supabase.from('organizers').select('*, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email)').order('name', { ascending: true }),
        supabase.from('events').select('organizer_id, cover_image').eq('status', 'published').order('created_at', { ascending: false }),
      ])

      if (!organizerData || !eventData) {
        setLoadError('Unable to load organizers right now. Please try again.')
        setLoading(false)
        return
      }

      const covers = new Map<string, { coverImage: string | null; count: number }>()
      for (const event of eventData ?? []) {
        const current = covers.get(event.organizer_id)
        covers.set(event.organizer_id, {
          coverImage: current?.coverImage ?? event.cover_image,
          count: (current?.count ?? 0) + 1,
        })
      }

      setOrganizers(organizerData.map(organizer => ({
        ...organizer,
        cover_image: organizer.profiles?.cover_image ?? ORGANIZER_COVER_PLACEHOLDER,
        logo_url: organizer.profiles?.profile_image ?? organizer.profiles?.avatar_url ?? organizer.logo_url ?? null,
        profiles: {
          ...(organizer.profiles ?? {}),
          username: organizer.profiles?.username ?? null,
          profile_image: organizer.profiles?.profile_image ?? organizer.profiles?.avatar_url ?? organizer.logo_url ?? null,
          avatar_url: organizer.profiles?.profile_image ?? organizer.profiles?.avatar_url ?? organizer.logo_url ?? null,
          cover_image: organizer.profiles?.cover_image ?? ORGANIZER_COVER_PLACEHOLDER,
        },
      event_count: covers.get(organizer.id)?.count ?? 0,
      })))
      setLoading(false)
    }

    void loadOrganizers()

    // Subscribe to real-time updates for organizer profiles
    const profilesChannel = supabase
      .channel('public-profiles-explore')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void loadOrganizers() })
      .subscribe()

    // Subscribe to real-time updates for events (to update event counts and covers)
    const eventsChannel = supabase
      .channel('public-events-explore')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: 'status=eq.published' }, () => { void loadOrganizers() })
      .subscribe()

    return () => {
      void supabase.removeChannel(profilesChannel)
      void supabase.removeChannel(eventsChannel)
    }
  }, [])

  const filteredOrganizers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return organizers
    return organizers.filter(organizer => (organizer.profiles?.full_name ?? organizer.name).toLowerCase().includes(query) || organizer.profiles?.username?.toLowerCase().includes(query) || organizer.description?.toLowerCase().includes(query) || organizer.city?.toLowerCase().includes(query))
  }, [organizers, search])

  return (
    <main className="explore-organizers-page min-h-screen" style={{ color: 'var(--foreground)' }}>
      <section className="explore-organizers-hero">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-28 sm:px-6 md:pb-16">
          <button onClick={() => navigate('home')} className="explore-organizers-back mb-8 flex items-center gap-2 text-sm font-medium"><ArrowLeftIcon size={16} />Back to events</button>
          <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="organizer-eyebrow mb-3"><SparkleIcon size={14} /> The people behind the plans</p>
            <h1 className="explore-organizers-title mb-3">Find your next <em>favourite</em> organizer.</h1>
            <p className="max-w-xl text-base" style={{ color: 'var(--muted-foreground)' }}>Follow the teams shaping the city&apos;s best nights, gatherings and ideas.</p>
          </div>
          <div className="explore-organizers-search relative w-full md:max-w-xs">
            <SearchIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search organizers" className="w-full rounded-xl py-3 pl-11 pr-4 text-sm outline-none" />
          </div>
        </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
        <div className="explore-organizers-section-head"><div><p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--primary-light)' }}>Community directory</p><h2>Made for following.</h2></div><span><UsersIcon size={15} /> {filteredOrganizers.length} creators</span></div>
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-64 animate-pulse rounded-2xl" style={{ background: 'var(--muted)' }} />)}</div>
        ) : filteredOrganizers.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredOrganizers.map(organizer => {
            const organizerName = organizer.profiles?.full_name?.trim() || organizer.name
            const initials = organizerName.slice(0, 1).toUpperCase()
            const username = organizer.profiles?.username?.trim().replace(/^@/, '') || null
            return (
              <button key={organizer.id} onClick={() => navigate('organizer-profile', organizer)} className="organizer-directory-card group overflow-hidden rounded-2xl border text-left transition-all">
                <div className="relative h-40 w-full" style={{ background: 'var(--muted)' }}>
                  {organizer.cover_image && <img src={organizer.cover_image} alt="" className="h-full w-full rounded-t-2xl object-cover opacity-75 transition-transform duration-300 group-hover:scale-105" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-0 left-5 translate-y-1/2">
                    {organizer.logo_url ? <img src={organizer.logo_url} alt={organizerName} className="h-16 w-16 rounded-full border-4 border-[var(--card)] object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[var(--card)] text-xl font-semibold" style={{ background: 'var(--primary)', color: '#17100a' }}>{initials}</span>}
                  </div>
                </div>
                <div className="flex items-start gap-3 px-5 pb-5 pt-11">
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 truncate text-lg font-semibold text-white">{organizerName}{(organizer.verified || organizer.verification_status === 'verified') && <span className="event-verified inline-flex items-center gap-1" title="Verified organizer"><CheckIcon size={10} /></span>}</span>{username && <span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>@{username}</span>}<span className="mt-2 block line-clamp-2 min-h-10 text-sm" style={{ color: 'var(--muted-foreground)' }}>{organizer.description || 'Event organizer'} </span><span className="mt-3 block text-xs" style={{ color: 'var(--primary-light)' }}>{organizer.event_count} published event{organizer.event_count === 1 ? '' : 's'}</span></span>
                  <span className="organizer-directory-arrow mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" aria-hidden="true"><ArrowRightIcon size={15} /></span>
                </div>
              </button>
            )
          })}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-5 py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{loadError || 'No organizers found.'}{loadError && <button onClick={() => window.location.reload()} className="ml-2 font-semibold" style={{ color: 'var(--primary)' }}>Retry</button>}</div>
        )}
      </section>
    </main>
  )
}
