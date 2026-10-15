import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type User, type Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, Organizer, TeamMembership, AgentInvitation, AgentAssignment } from '../lib/types'

type AuthState = {
  user: User | null
  session: Session | null
  profile: Profile | null
  organizer: Organizer | null
  teamMembership: TeamMembership | null
  agentInvitations: AgentInvitation[]
  agentAssignments: AgentAssignment[]
  loading: boolean        // initial auth check in progress
  profileLoading: boolean // profile fetch in progress
  isOrganizer: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  profile: null,
  organizer: null,
  teamMembership: null,
  agentInvitations: [],
  agentAssignments: [],
  loading: true,
  profileLoading: true,
  isOrganizer: false,
  refreshProfile: async () => {},
})

function isOrganizerUser(user: User | null, profile: Profile | null): boolean {
  if (profile?.role === 'organizer') return true
  if (user?.user_metadata?.role === 'organizer' && user.user_metadata?.intent === 'organizer') return true
  return false
}

function syntheticProfile(user: User, role: Profile['role']): Profile {
  return {
    id: user.id,
    email: user.email ?? '',
    full_name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
    profile_image: user.user_metadata?.profile_image ?? user.user_metadata?.avatar_url ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
    username: user.user_metadata?.username ?? null,
    cover_image: user.user_metadata?.cover_image ?? null,
    phone: null,
    preferences: {},
    role,
    created_at: new Date().toISOString(),
  }
}

function resolvedRole(user: User): Profile['role'] {
  const meta = user.user_metadata ?? {}
  const email = user.email?.toLowerCase() ?? ''

  if (email === 'mjoskenny@gmail.com') {
    return 'admin'
  }

  if (meta.role === 'admin') {
    return 'admin'
  }

  if (meta.role === 'organizer' || meta.intent === 'organizer') {
    return 'organizer'
  }

  return 'customer'
}

function fallbackOrganizer(user: User): Organizer {
  const name = user.user_metadata?.full_name?.trim() || user.email?.split('@')[0] || 'Organizer'
  return {
    id: user.id,
    user_id: user.id,
    name,
    description: null,
    logo_url: null,
    website: null,
    phone: null,
    city: 'Bujumbura',
    verified: false,
    subscription_tier: 'free',
    created_at: new Date().toISOString(),
  }
}

const organizerAccountLoads = new Map<string, Promise<Organizer | null>>()

function ensureOrganizerAccount(user: User): Promise<Organizer | null> {
  const inFlight = organizerAccountLoads.get(user.id)
  if (inFlight) return inFlight

  const load = loadOrCreateOrganizerAccount(user).finally(() => {
    if (organizerAccountLoads.get(user.id) === load) organizerAccountLoads.delete(user.id)
  })
  organizerAccountLoads.set(user.id, load)
  return load
}

async function loadOrCreateOrganizerAccount(user: User): Promise<Organizer | null> {
  const profileImage = user.user_metadata?.profile_image ?? user.user_metadata?.avatar_url ?? null

  const { data: existingOrganizers, error: organizerLookupError } = await supabase
    .from('organizers')
    .select('*, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  // Older accounts can have duplicate organizer rows. maybeSingle() fails for
  // those accounts, which used to make every reload create another empty row.
  // Reuse the organizer that owns the most saved events, then choose the oldest
  // row deterministically when there is no event history to distinguish them.
  if (!organizerLookupError && existingOrganizers?.length) {
    if (existingOrganizers.length === 1) return existingOrganizers[0]

    const { data: savedEvents, error: eventLookupError } = await supabase
      .from('events')
      .select('organizer_id')
      .in('organizer_id', existingOrganizers.map(existing => existing.id))
    const eventCountByOrganizer = new Map<string, number>()
    if (!eventLookupError) {
      for (const event of savedEvents ?? []) {
        eventCountByOrganizer.set(event.organizer_id, (eventCountByOrganizer.get(event.organizer_id) ?? 0) + 1)
      }
    }

    existingOrganizers.sort((left, right) =>
      (eventCountByOrganizer.get(right.id) ?? 0) - (eventCountByOrganizer.get(left.id) ?? 0)
      || new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      || left.id.localeCompare(right.id),
    )
    return existingOrganizers[0]
  }

  // Never create a new organizer if the lookup failed; that can orphan saved
  // events by assigning future sessions to a different organizer ID.
  if (organizerLookupError) {
    console.error('Unable to load the existing organizer account', organizerLookupError)
    return fallbackOrganizer(user)
  }

  const name = user.user_metadata?.full_name?.trim() || user.email?.split('@')[0] || 'Organizer'
  const { data: created } = await supabase
    .from('organizers')
    .insert({ user_id: user.id, name, logo_url: profileImage })
    .select('*, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email)').single()

  if (!created) return fallbackOrganizer(user)

  await Promise.allSettled([
    supabase.from('organizer_roles').insert([
      { organizer_id: created.id, name: 'Admin', permissions: { all: true } },
      { organizer_id: created.id, name: 'Scanner', permissions: { checkin: true } },
      { organizer_id: created.id, name: 'Agent', permissions: { sell: true } },
    ]),
    supabase.from('subscriptions').insert({ organizer_id: created.id, tier: 'free', status: 'active', price: 0 }),
  ])

  return created
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [organizer, setOrganizer] = useState<Organizer | null>(null)
  const [teamMembership, setTeamMembership] = useState<TeamMembership | null>(null)
  const [agentInvitations, setAgentInvitations] = useState<AgentInvitation[]>([])
  const [agentAssignments, setAgentAssignments] = useState<AgentAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)

  const isOrganizer = teamMembership
    ? teamMembership.status === 'active'
    : isOrganizerUser(user, profile)

  const doLoadProfile = async (cachedUser: User) => {
    setProfileLoading(true)
    try {
      // Always fetch from server to get the latest metadata (not the cached JWT)
      const { data: { user: freshUser }, error: userErr } = await supabase.auth.getUser()
      const verified = (!userErr && freshUser) ? freshUser : cachedUser

      // Update user state with fresh server data
      setUser(verified)

      const role = resolvedRole(verified)

      const { data: membership } = await supabase
        .from('organizer_members')
        .select('*, organizer_roles(*), organizers(*, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email))')
        .eq('user_id', verified.id)
        .in('status', ['pending', 'active'])
        .maybeSingle()
      const teamOrganizer = membership?.organizer
        ?? (membership?.organizer_id
          ? (await supabase
            .from('organizers')
            .select('*, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email)')
            .eq('id', membership.organizer_id)
            .maybeSingle()).data
          : null)
      const resolvedMembership = membership
        ? { ...membership, organizer: teamOrganizer ?? undefined } as TeamMembership
        : null
      setTeamMembership(resolvedMembership)

      const [{ data: invitations }, { data: assignments }] = await Promise.all([
        supabase.from('agent_invitations').select('*, organizers(*)').eq('user_id', verified.id).eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('agent_assignments').select('*, events(*, ticket_tiers(*)), organizers(*)').eq('user_id', verified.id).eq('status', 'active').order('created_at', { ascending: false }),
      ])
      setAgentInvitations((invitations ?? []) as AgentInvitation[])
      setAgentAssignments((assignments ?? []) as AgentAssignment[])

      // Try to fetch DB profile
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', verified.id)
        .single()

      if (prof) {
        const finalRole: Profile['role'] = prof.role ?? role
        setProfile({ ...prof, role: finalRole })
        if (finalRole === 'organizer' && !membership) {
          setOrganizer(await ensureOrganizerAccount(verified))
        } else if (teamOrganizer) {
          setOrganizer(teamOrganizer)
        }
      } else {
        setProfile(syntheticProfile(verified, role))
        if (role === 'organizer' && !resolvedMembership) setOrganizer(await ensureOrganizerAccount(verified))
        else if (teamOrganizer) setOrganizer(teamOrganizer)
      }
    } catch {
      // Network or DB failure — still show user as logged in using cached user metadata
      const role = resolvedRole(cachedUser)
      setProfile(syntheticProfile(cachedUser, role))
    } finally {
      setProfileLoading(false)
    }
  }

  const refreshProfile = async () => {
    if (user) await doLoadProfile(user)
  }

  useEffect(() => {
    // Hard cap: if nothing resolves in 10s, unblock the UI
    const hardTimeout = setTimeout(() => {
      setLoading(false)
      setProfileLoading(false)
    }, 10000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)

      if (s?.user) {
        setUser(s.user)
        setLoading(false) // unblock the spinner — we know auth state

        // Set up new user record if first time, then load profile
        try {
          await Promise.race([
            handleNewUser(s.user),
            new Promise<void>(res => setTimeout(res, 4000)),
          ])
        } catch { /* non-fatal */ }

        await doLoadProfile(s.user)
      } else {
        setUser(null)
        setProfile(null)
        setOrganizer(null)
        setTeamMembership(null)
          setAgentInvitations([])
          setAgentAssignments([])
        setLoading(false)
        setProfileLoading(false)
      }

      clearTimeout(hardTimeout)
    })

    return () => { subscription.unsubscribe(); clearTimeout(hardTimeout) }
  }, [])

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`profile:${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, payload => {
        setProfile(current => ({
          ...(current ?? syntheticProfile(user, resolvedRole(user))),
          ...payload.new,
          role: payload.new.role ?? current?.role ?? resolvedRole(user),
        }))
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || !teamMembership?.organizer_id) return

    const channel = supabase
      .channel(`team-permissions:${user.id}:${teamMembership.organizer_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'organizer_members',
        filter: `user_id=eq.${user.id}`,
      }, () => { void doLoadProfile(user) })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'organizer_roles',
        filter: `organizer_id=eq.${teamMembership.organizer_id}`,
      }, () => { void doLoadProfile(user) })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, teamMembership?.organizer_id])

  return (
    <AuthContext.Provider value={{ user, session, profile, organizer, teamMembership, agentInvitations, agentAssignments, loading, profileLoading, isOrganizer, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

async function handleNewUser(user: User) {
  try {
    const { data: existing } = await supabase
      .from('profiles').select('id, role').eq('id', user.id).single()

    const role = resolvedRole(user)

    if (existing) return

    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? user.email?.split('@')[0],
      avatar_url: user.user_metadata?.profile_image ?? user.user_metadata?.avatar_url ?? null,
      role,
    }, { onConflict: 'id' })

    if (role === 'organizer') await ensureOrganizerAccount(user)
  } catch { /* DB tables may not exist yet */ }
}

export const useAuth = () => useContext(AuthContext)
