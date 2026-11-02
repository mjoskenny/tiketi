import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftIcon, SearchIcon, SortIcon } from '../components/Icon'
import { supabase } from '../lib/supabase'
import type { Organizer } from '../lib/types'
import { ORGANIZER_COVER_PLACEHOLDER } from '../lib/profileMedia'
import OrganizerCard from '../components/OrganizerCard'

type Props = { navigate: (p: string, extra?: unknown) => void }
type OrganizerWithCover = Organizer & { cover_image: string | null; event_count: number }

export default function ExploreOrganizersPage({ navigate }: Props) {
  const [organizers, setOrganizers] = useState<OrganizerWithCover[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'active' | 'name'>('active')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const loadOrganizers = async () => {
      setLoading(true)
      setLoadError('')
      const [{ data: organizerData }, { data: eventData }] = await Promise.all([
        supabase.from('organizers').select('*').order('name', { ascending: true }),
        supabase.from('events').select('organizer_id, cover_image').eq('status', 'published').order('created_at', { ascending: false }),
      ])

      if (!organizerData || !eventData) {
        setLoadError('Unable to load organizers right now. Please try again.')
        setLoading(false)
        return
      }

      const organizerUserIds = [...new Set(organizerData.map(organizer => organizer.user_id))]
      const { data: publicProfiles } = organizerUserIds.length
        ? await supabase.from('public_profiles').select('id, full_name, username, profile_image, avatar_url, cover_image').in('id', organizerUserIds)
        : { data: [] }
      const profilesById = new Map((publicProfiles ?? []).map(profile => [profile.id, profile]))

      const covers = new Map<string, { coverImage: string | null; count: number }>()
      for (const event of eventData ?? []) {
        const current = covers.get(event.organizer_id)
        covers.set(event.organizer_id, {
          coverImage: current?.coverImage ?? event.cover_image,
          count: (current?.count ?? 0) + 1,
        })
      }

      const organizersByUser = new Map<string, OrganizerWithCover>()

      for (const organizer of organizerData) {
        if (!(organizer.verified || organizer.verification_status === 'verified')) continue

        const publicProfile = profilesById.get(organizer.user_id)
        const profile = { ...(organizer.profiles ?? {}), ...(publicProfile ?? {}) }
        const resolvedCover = profile.cover_image ?? (organizer as Organizer & { cover_image?: string | null }).cover_image ?? null
        const normalized = {
          ...organizer,
          cover_image: resolvedCover,
          logo_url: profile.profile_image || profile.avatar_url || organizer.logo_url || null,
          profiles: {
            ...profile,
            username: profile.username ?? null,
            profile_image: profile.profile_image || profile.avatar_url || organizer.logo_url || null,
            avatar_url: profile.profile_image || profile.avatar_url || organizer.logo_url || null,
            cover_image: resolvedCover,
          },
          event_count: covers.get(organizer.id)?.count ?? 0,
        } as OrganizerWithCover

        const existing = organizersByUser.get(organizer.user_id)
        if (!existing || (normalized.cover_image && !existing.cover_image) || (normalized.event_count > existing.event_count)) {
          organizersByUser.set(organizer.user_id, normalized)
        }
      }

      setOrganizers([...organizersByUser.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')))
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
    const matches = !query
      ? organizers
      : organizers.filter(organizer => (organizer.profiles?.full_name ?? organizer.name).toLowerCase().includes(query) || organizer.profiles?.username?.toLowerCase().includes(query) || organizer.description?.toLowerCase().includes(query) || organizer.city?.toLowerCase().includes(query))
    return [...matches].sort((left, right) => sortBy === 'active'
      ? right.event_count - left.event_count || left.name.localeCompare(right.name)
      : left.name.localeCompare(right.name))
  }, [organizers, search, sortBy])

  return (
    <main className="explore-organizers-page min-h-screen" style={{ color: 'var(--foreground)' }}>
      <section className="explore-organizers-hero">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-24 sm:px-6 md:pb-10">
          <button type="button" onClick={() => navigate('home')} className="explore-organizers-back mb-6 flex h-10 w-10 items-center justify-center rounded-full" aria-label="Back to events" title="Back to events"><ArrowLeftIcon size={18} /></button>
          <div>
            <h1 className="explore-organizers-title mb-3">Find your next favourite organizer.</h1>
            <p className="max-w-xl text-base" style={{ color: 'var(--muted-foreground)' }}>Follow the teams shaping the city&apos;s best nights, gatherings and ideas.</p>
          </div>
          <div className="explore-organizers-search relative mt-6 w-full max-w-xl">
            <SearchIcon size={16} className="attendee-control-icon pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search organizers" aria-label="Search organizers" className="attendee-search-input w-full rounded-full py-3.5 pl-11 pr-4 text-sm outline-none" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" aria-label="Organizer sorting options">
            <SortIcon size={15} style={{ color: 'var(--muted-foreground)' }} />
            <button type="button" onClick={() => setSortBy('active')} aria-pressed={sortBy === 'active'} data-active={sortBy === 'active'} className="explore-organizers-filter-button rounded-full px-3.5 py-2 text-xs font-semibold">Most active</button>
            <button type="button" onClick={() => setSortBy('name')} aria-pressed={sortBy === 'name'} data-active={sortBy === 'name'} className="explore-organizers-filter-button rounded-full px-3.5 py-2 text-xs font-semibold">A–Z</button>
          </div>
        </div>
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-64 animate-pulse rounded-2xl" style={{ background: 'var(--muted)' }} />)}</div>
        ) : filteredOrganizers.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredOrganizers.map(organizer => <OrganizerCard key={organizer.id} organizer={organizer} eventCount={organizer.event_count} coverImage={organizer.cover_image} directory onClick={() => navigate('organizer-profile', organizer)} />)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-5 py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{loadError || 'No organizers found.'}{loadError && <button onClick={() => window.location.reload()} className="ml-2 font-semibold" style={{ color: 'var(--primary)' }}>Retry</button>}</div>
        )}
      </section>
    </main>
  )
}
