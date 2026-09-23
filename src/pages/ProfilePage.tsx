import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { signOut, supabase } from '../lib/supabase'
import { projectId } from '../../utils/supabase/info'
import { UserIcon, SettingsIcon, TicketIcon, BellIcon, HeartIcon, LogOutIcon, ShieldIcon, EditIcon } from '../components/Icon'

type Props = { navigate: (p: string) => void }

function profileStoragePath(url: string | null | undefined) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.origin !== `https://${projectId}.supabase.co`) return null
    const marker = '/storage/v1/object/public/profile-media/'
    const markerIndex = parsed.pathname.indexOf(marker)
    return markerIndex >= 0 ? decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length)) : null
  } catch {
    return null
  }
}

export default function ProfilePage({ navigate }: Props) {
  const { user, profile, organizer, teamMembership, refreshProfile } = useAuth()
  const [tab, setTab] = useState<'account' | 'preferences' | 'security'>('account')
  const [accountForm, setAccountForm] = useState({ full_name: '', username: '', email: '', phone: '', organizer_bio: '' })
  const [preferences, setPreferences] = useState<Record<string, boolean>>({ email_notifications: true, event_reminders: true, promotions: false, nearby_events: true })
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' })
  const [mediaModalOpen, setMediaModalOpen] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<{ avatar: File | null; cover: File | null }>({ avatar: null, cover: null })
  const [mediaPreviews, setMediaPreviews] = useState<{ avatar: string; cover: string }>({ avatar: '', cover: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [followerCount, setFollowerCount] = useState(0)
  const [profileStats, setProfileStats] = useState({ eventsAttended: 0, ticketsOwned: 0 })
  const [followedOrganizers, setFollowedOrganizers] = useState<Array<{ id: string; name: string; logo_url: string | null; profiles?: { full_name: string | null; username: string | null; avatar_url: string | null } | null }>>([])
  const [followingError, setFollowingError] = useState('')
  const [followingRetryToken, setFollowingRetryToken] = useState(0)

  useEffect(() => {
    if (!user) return
    const loadFollowedOrganizers = async () => {
      setFollowingError('')
      const { data: follows, error: followsError } = await supabase.from('organizer_followers').select('id, organizer_id').eq('user_id', user.id)
      if (followsError) { setFollowingError(followsError.message); return }
      const organizerIds = (follows ?? []).map(follow => follow.organizer_id)
      if (!organizerIds.length) { setFollowedOrganizers([]); return }

      const { data: organizers, error: organizersError } = await supabase
        .from('organizers')
        .select('id, user_id, name, logo_url, profiles!organizers_user_id_fkey(full_name, username, avatar_url)')
        .in('id', organizerIds)
      if (organizersError) { setFollowingError(organizersError.message); return }
      const selfOrganizerIds = (organizers ?? []).filter(organizer => organizer.user_id === user.id).map(organizer => organizer.id)
      if (selfOrganizerIds.length) {
        await supabase.from('organizer_followers').delete().eq('user_id', user.id).in('organizer_id', selfOrganizerIds)
      }
      setFollowedOrganizers((organizers ?? []).filter(organizer => organizer.user_id !== user.id) as typeof followedOrganizers)
    }
    void loadFollowedOrganizers()
    const channel = supabase.channel(`profile-following:${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_followers', filter: `user_id=eq.${user.id}` }, () => { void loadFollowedOrganizers() }).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [user?.id, followingRetryToken])

  useEffect(() => {
    if (!user) {
      setProfileStats({ eventsAttended: 0, ticketsOwned: 0 })
      return
    }
    let mounted = true
    const loadProfileStats = async () => {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', user.id)
      if (ordersError || !mounted) return
      const orderIds = (orders ?? []).map(order => order.id)
      if (!orderIds.length) {
        setProfileStats({ eventsAttended: 0, ticketsOwned: 0 })
        return
      }
      const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('id, event_id, status')
        .in('order_id', orderIds)
      if (ticketsError || !mounted) return
      const ownedTickets = (tickets ?? []).filter(ticket => ticket.status !== 'cancelled')
      const attendedEvents = new Set(ownedTickets.filter(ticket => ticket.status === 'used').map(ticket => ticket.event_id))
      setProfileStats({ eventsAttended: attendedEvents.size, ticketsOwned: ownedTickets.length })
    }
    void loadProfileStats()
    return () => { mounted = false }
  }, [user?.id])

  useEffect(() => {
    if (!organizer?.id || !user) {
      setFollowerCount(0)
      return
    }
    const loadFollowerCount = async () => {
      const { count } = await supabase
        .from('organizer_followers')
        .select('id', { count: 'exact', head: true })
        .eq('organizer_id', organizer.id)
        .neq('user_id', user.id)
      setFollowerCount(count ?? 0)
    }
    void loadFollowerCount()
    const channel = supabase.channel(`profile-follower-count:${organizer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_followers', filter: `organizer_id=eq.${organizer.id}` }, () => { void loadFollowerCount() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [organizer?.id, user?.id])

  useEffect(() => {
    if (!user) return
    setAccountForm({
      full_name: profile?.full_name ?? user.user_metadata?.full_name ?? '',
      username: profile?.username ?? user.user_metadata?.username ?? '',
      email: profile?.email ?? user.email ?? '',
      phone: profile?.phone ?? '',
      organizer_bio: organizer?.description ?? '',
    })
    setPreferences({ email_notifications: true, event_reminders: true, promotions: false, nearby_events: true, ...(profile?.preferences ?? {}) })
  }, [profile, user, organizer?.description])

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 pt-16"
        style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <p className="font-bold text-xl">Sign in to view your profile</p>
        <button onClick={() => navigate('auth-customer')} className="px-6 py-3 rounded-xl font-bold text-sm"
          style={{ background: 'var(--primary)', color: '#fff' }}>
          Sign In
        </button>
      </div>
    )
  }

  const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const username = profile?.username || user.user_metadata?.username || null
  const email = profile?.email || user.email || ''
  const avatarUrl = profile?.profile_image || profile?.avatar_url || user.user_metadata?.profile_image || user.user_metadata?.avatar_url || null
  const coverImage = profile?.cover_image || user.user_metadata?.cover_image || null
  const role = profile?.role ?? (user.user_metadata?.role === 'organizer' ? 'organizer' : 'customer')
  const isTeamMember = teamMembership?.status === 'active'
  const roleBadge = isTeamMember ? teamMembership.organizer_roles?.name ?? 'Team member' : role === 'organizer' ? 'Organizer' : 'Attendee'
  const initials = displayName[0]?.toUpperCase() ?? '?'

  const setAccountField = (field: keyof typeof accountForm, value: string) => setAccountForm(current => ({ ...current, [field]: value }))

  const handleAccountSave = async () => {
    const normalizedUsername = accountForm.username.trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '-')
    if (normalizedUsername && !/^[a-z0-9][a-z0-9._-]{1,29}$/.test(normalizedUsername)) { setError('Username must be 2-30 characters and use letters, numbers, dots, underscores, or hyphens.'); return }
    const requestedEmail = accountForm.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) { setError('Enter a valid email address.'); return }
    setSaving(true); setMessage(''); setError('')
    if (normalizedUsername) {
      const { data: existingUsername, error: usernameError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', normalizedUsername)
        .neq('id', user.id)
        .limit(1)
        .maybeSingle()
      if (usernameError) { setError(usernameError.message); setSaving(false); return }
      if (existingUsername) { setError('That username is already in use. Choose another one.'); setSaving(false); return }
    }
    const emailChanged = requestedEmail !== (user.email ?? '').toLowerCase()
    if (emailChanged) {
      const { error: authError } = await supabase.auth.updateUser({ email: requestedEmail })
      if (authError) { setError(authError.message); setSaving(false); return }
    }

    const nextProfile = {
      id: user.id,
      full_name: accountForm.full_name.trim() || user.user_metadata?.full_name || null,
      username: normalizedUsername || null,
      email: emailChanged ? (profile?.email || user.email || null) : requestedEmail,
      phone: accountForm.phone.trim() || null,
      avatar_url: profile?.profile_image || profile?.avatar_url || null,
      cover_image: profile?.cover_image || null,
    }

    const { error: profileError } = await supabase.from('profiles').upsert(nextProfile, { onConflict: 'id' })
    if (profileError) setError(profileError.message)
    else {
      let organizerUpdateError = ''
      const organizerRole = profile?.role === 'organizer' || user.user_metadata?.role === 'organizer' || user.user_metadata?.intent === 'organizer'
      if (organizerRole && nextProfile.avatar_url) {
        const { data: organizerRow } = await supabase.from('organizers').select('*, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email)').eq('user_id', user.id).maybeSingle()
        const organizerName = nextProfile.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Organizer'
        if (organizerRow) {
          const { error: organizerError } = await supabase.from('organizers').update({ name: organizerName, logo_url: nextProfile.avatar_url, description: accountForm.organizer_bio.trim() || null }).eq('id', organizerRow.id)
          if (organizerError) organizerUpdateError = organizerError.message
        } else {
          const { error: organizerError } = await supabase.from('organizers').insert({ user_id: user.id, name: organizerName, logo_url: nextProfile.avatar_url, description: accountForm.organizer_bio.trim() || null, website: null, phone: null, city: 'Bujumbura', verified: false, subscription_tier: 'free' })
          if (organizerError) organizerUpdateError = organizerError.message
        }
      } else if (organizer?.id) {
        const { error: organizerError } = await supabase.from('organizers').update({ description: accountForm.organizer_bio.trim() || null }).eq('id', organizer.id)
        if (organizerError) organizerUpdateError = organizerError.message
      }

      await refreshProfile()
      if (organizerUpdateError) setError(`Basic profile saved, but organizer details could not be updated: ${organizerUpdateError}`)
      else setMessage(emailChanged ? 'Profile saved. Check both confirmation emails to finish changing your email.' : 'Profile saved.')
    }
    setSaving(false)
  }

  const togglePreference = async (key: string) => {
    const previousValue = preferences[key] === true
    const next = { ...preferences, [key]: !previousValue }
    setPreferences(current => ({ ...current, [key]: !previousValue })); setMessage(''); setError('')
    const { error: preferenceError } = await supabase.from('profiles').update({ preferences: next }).eq('id', user.id)
    if (preferenceError) {
      setPreferences(current => current[key] === next[key] ? { ...current, [key]: previousValue } : current)
      setError(preferenceError.message)
    }
    else {
      await refreshProfile()
      setMessage('Preference saved.')
    }
  }

  const handlePasswordUpdate = async () => {
    setMessage(''); setError('')
    if (passwordForm.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (passwordForm.password !== passwordForm.confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    const { error: passwordError } = await supabase.auth.updateUser({ password: passwordForm.password })
    if (passwordError) setError(passwordError.message)
    else { setPasswordForm({ password: '', confirm: '' }); setMessage('Password updated.') }
    setSaving(false)
  }

  const handleMediaFile = (kind: 'avatar' | 'cover', file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Profile media must be an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Profile images must be smaller than 5 MB.'); return }
    setError('')
    setMediaFiles(current => ({ ...current, [kind]: file }))
    setMediaPreviews(current => ({ ...current, [kind]: URL.createObjectURL(file) }))
  }

  const handleDeleteImage = async (kind: 'avatar' | 'cover') => {
    setSaving(true); setMessage(''); setError('')
    const previousUrl = kind === 'avatar' ? (profile?.profile_image || profile?.avatar_url) : profile?.cover_image
    const nextProfileData = {
      id: user.id,
      email: accountForm.email.trim() || user.email || profile?.email || null,
      full_name: accountForm.full_name.trim() || profile?.full_name || user.user_metadata?.full_name || null,
      username: accountForm.username.trim().toLowerCase().replace(/\s+/g, '-') || profile?.username || user.user_metadata?.username || null,
      phone: accountForm.phone.trim() || profile?.phone || null,
      avatar_url: kind === 'avatar' ? null : (profile?.profile_image || profile?.avatar_url || user.user_metadata?.profile_image || user.user_metadata?.avatar_url || null),
      cover_image: kind === 'cover' ? null : (profile?.cover_image || user.user_metadata?.cover_image || null),
      preferences: profile?.preferences ?? {},
    }
    const { error: profileError } = await supabase.from('profiles').upsert(nextProfileData, { onConflict: 'id' })
    if (profileError) setError(profileError.message)
    else {
      const previousPath = profileStoragePath(previousUrl)
      if (previousPath) await supabase.storage.from('profile-media').remove([previousPath])
      await refreshProfile()
      setMediaFiles({ avatar: null, cover: null })
      setMediaPreviews({ avatar: '', cover: '' })
      setMessage(`${kind === 'avatar' ? 'Profile photo' : 'Cover image'} deleted.`)
    }
    setSaving(false)
  }

  const handleMediaSave = async () => {
    if (!mediaFiles.avatar && !mediaFiles.cover) { setError('Choose a profile photo or cover image first.'); return }
    setSaving(true); setMessage(''); setError('')
    const uploaded: { profile_image?: string; cover_image?: string } = {}
    const uploadedPaths: string[] = []
    const previousUrls = { avatar: profile?.profile_image || profile?.avatar_url, cover: profile?.cover_image }
    for (const [kind, file] of Object.entries(mediaFiles) as Array<['avatar' | 'cover', File | null]>) {
      if (!file) continue
      const path = `${user.id}/${kind}-${crypto.randomUUID()}-${file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-')}`
      const { error: uploadError } = await supabase.storage.from('profile-media').upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false })
      if (uploadError) {
        if (uploadedPaths.length) await supabase.storage.from('profile-media').remove(uploadedPaths)
        setError(uploadError.message); setSaving(false); return
      }
      uploadedPaths.push(path)
      const publicUrl = supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl
      if (kind === 'avatar') uploaded.profile_image = publicUrl
      else uploaded.cover_image = publicUrl
    }
    const nextProfileData = {
      id: user.id,
      email: accountForm.email.trim() || user.email || profile?.email || null,
      full_name: accountForm.full_name.trim() || profile?.full_name || user.user_metadata?.full_name || null,
      username: accountForm.username.trim().toLowerCase().replace(/\s+/g, '-') || profile?.username || user.user_metadata?.username || null,
      phone: accountForm.phone.trim() || profile?.phone || null,
      avatar_url: uploaded.profile_image ?? (profile?.profile_image || profile?.avatar_url || user.user_metadata?.profile_image || user.user_metadata?.avatar_url || null),
      cover_image: uploaded.cover_image ?? (profile?.cover_image || user.user_metadata?.cover_image || null),
      preferences: profile?.preferences ?? {},
    }

    const { error: profileError } = await supabase.from('profiles').upsert(nextProfileData, { onConflict: 'id' })

    if (profileError) {
      if (uploadedPaths.length) await supabase.storage.from('profile-media').remove(uploadedPaths)
      setError(profileError.message)
    }
    else {
      const oldPaths = (['avatar', 'cover'] as const)
        .filter(kind => Boolean(mediaFiles[kind]))
        .map(kind => profileStoragePath(previousUrls[kind]))
        .filter((path): path is string => Boolean(path))
      if (oldPaths.length) await supabase.storage.from('profile-media').remove(oldPaths)
      const organizerRole = profile?.role === 'organizer' || user.user_metadata?.role === 'organizer' || user.user_metadata?.intent === 'organizer'
      if (organizerRole && (uploaded.profile_image || nextProfileData.avatar_url || uploaded.cover_image)) {
        const { data: organizerRow } = await supabase.from('organizers').select('*, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email)').eq('user_id', user.id).maybeSingle()
        const organizerName = nextProfileData.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Organizer'
        const nextLogo = uploaded.profile_image ?? nextProfileData.avatar_url ?? null
        if (organizerRow) {
          await supabase.from('organizers').update({ name: organizerName, logo_url: nextLogo }).eq('id', organizerRow.id)
        } else {
          await supabase.from('organizers').insert({ user_id: user.id, name: organizerName, logo_url: nextLogo, description: null, website: null, phone: null, city: 'Bujumbura', verified: false, subscription_tier: 'free' })
        }
      }

      await refreshProfile()
      setMessage('Profile images updated.')
      setMediaFiles({ avatar: null, cover: null })
      setMediaPreviews({ avatar: '', cover: '' })
      setMediaModalOpen(false)
    }
    setSaving(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('home')
  }

  const TABS = [
    { key: 'account' as const, label: 'Account', Icon: UserIcon },
    { key: 'preferences' as const, label: 'Preferences', Icon: SettingsIcon },
    { key: 'security' as const, label: 'Security', Icon: ShieldIcon },
  ]

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6">

        {/* Profile header */}
        <div className="rounded-2xl p-6 mb-6 relative overflow-hidden"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {coverImage && <img src={coverImage} alt="" className="absolute inset-0 h-28 w-full object-cover opacity-35" />}
          <div className="absolute inset-0" aria-hidden style={{ background: 'linear-gradient(to bottom, rgba(18,18,18,0.25), var(--card) 72%)' }} />
          <div className="absolute inset-0" aria-hidden
            style={{ background: 'radial-gradient(ellipse 70% 100% at 0% 0%, rgba(249,112,21,0.12) 0%, transparent 60%)' }} />
          <div className="relative z-10 flex items-center gap-4">
            {avatarUrl
              ? <img src={avatarUrl} className="h-16 w-16 rounded-full object-cover ring-2 ring-black/40" alt={displayName} />
              : <div className="h-16 w-16 rounded-full flex items-center justify-center text-2xl font-black ring-2 ring-black/40"
                  style={{ background: 'rgba(249,112,21,0.2)', color: 'var(--accent)' }}>
                  {initials}
                </div>
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{displayName}</h1>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: roleBadge !== 'Attendee' ? 'rgba(249,112,21,0.12)' : 'rgba(255,255,255,0.06)', color: roleBadge !== 'Attendee' ? 'var(--accent)' : 'var(--muted-foreground)', border: `1px solid ${roleBadge !== 'Attendee' ? 'rgba(249,112,21,0.28)' : 'var(--border)'}` }}>
                  {roleBadge}
                </span>
              </div>
              <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>{email}</p>
              {isTeamMember && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--primary-light)' }}>{teamMembership.organizer?.name ?? 'Organizer'} team</p>}
              {username && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--primary-light)' }}>@{username.replace(/^@/, '')}</p>}
            </div>
            <button className="p-2 rounded-xl transition-all" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}
              onClick={() => setMediaModalOpen(true)} aria-label="Edit profile images">
              <EditIcon size={16} />
            </button>
          </div>

          {/* Quick stats */}
          <div className={`relative z-10 grid ${role === 'organizer' ? 'grid-cols-4' : 'grid-cols-3'} gap-3 mt-5 pt-5 border-t`} style={{ borderColor: 'var(--border)' }}>
            {[
              { label: 'Events attended', value: String(profileStats.eventsAttended) },
              { label: 'Tickets owned', value: String(profileStats.ticketsOwned) },
              ...(role === 'organizer' ? [{ label: 'Followers', value: String(followerCount) }] : []),
              { label: 'Member since', value: new Date(user.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="font-bold text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>{value}</p>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { Icon: TicketIcon, label: 'My Tickets', page: 'my-tickets', desc: 'View your tickets' },
            { Icon: BellIcon, label: 'Notifications', page: 'notifications', desc: 'Your alerts' },
            { Icon: HeartIcon, label: 'Favorites', page: 'favorites', desc: 'Saved events' },
            ...(role === 'organizer' ? [{ Icon: SettingsIcon, label: 'Dashboard', page: 'dashboard', desc: 'Manage events' }] : []),
          ].map(({ Icon, label, page, desc }) => (
            <button key={page} onClick={() => navigate(page)}
              className="flex items-center gap-3 p-4 rounded-xl text-left transition-all"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(249,112,21,0.38)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(249,112,21,0.12)', color: 'var(--accent)' }}>
                <Icon size={17} />
              </div>
              <div>
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{desc}</p>
              </div>
            </button>
          ))}
        </div>

        <section className="mb-6 rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between gap-3"><h2 className="font-bold">Organizers you follow</h2><span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{followedOrganizers.length}</span></div>
          {followingError ? <div className="mt-2"><p className="text-sm" style={{ color: '#fca5a5' }}>Unable to load followed organizers: {followingError}</p><button onClick={() => setFollowingRetryToken(current => current + 1)} className="mt-3 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Try again</button></div> : followedOrganizers.length === 0 ? <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>Follow an organizer to see them here.</p> : <div className="mt-4 flex flex-wrap gap-3">{followedOrganizers.map(organizer => { const name = organizer.profiles?.full_name || organizer.name; const avatar = organizer.profiles?.avatar_url || organizer.logo_url; return <button key={organizer.id} onClick={() => navigate('organizer-profile', organizer as any)} className="flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: 'var(--border)' }}>{avatar ? <img src={avatar} alt={name} className="h-7 w-7 rounded-full object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--muted)' }}>{name[0]?.toUpperCase()}</span>}<span className="text-xs font-semibold">{name}</span></button> })}</div>}
        </section>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'var(--muted)' }}>
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ background: tab === key ? 'var(--card)' : 'transparent', color: tab === key ? 'var(--foreground)' : 'var(--muted-foreground)', border: tab === key ? '1px solid var(--border)' : '1px solid transparent' }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {(message || error) && <div className="mx-6 mt-6 rounded-xl px-4 py-3 text-sm" style={{ background: error ? 'rgba(248,113,113,0.1)' : 'rgba(34,197,94,0.1)', color: error ? '#fca5a5' : '#86efac' }}>{error || message}</div>}
          {tab === 'account' && (
            <div className="p-6 space-y-4">
              {[
                { label: 'Full name', key: 'full_name' as const, type: 'text', placeholder: 'Your name' },
                { label: 'Username', key: 'username' as const, type: 'text', placeholder: 'your-username' },
                { label: 'Email address', key: 'email' as const, type: 'email', placeholder: 'your@email.com' },
                { label: 'Phone number', key: 'phone' as const, type: 'tel', placeholder: '+257 XX XXX XXX' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>{label}</label>
                  <input type={type} value={accountForm[key]} onChange={e => setAccountField(key, e.target.value)} placeholder={placeholder}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(249,112,21,0.6)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249,112,21,0.12)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
                </div>
              ))}
              {organizer && <div className="w-full">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Organizer bio</label>
                <textarea value={accountForm.organizer_bio} onChange={e => setAccountField('organizer_bio', e.target.value)} placeholder="Tell attendees about your organization" rows={4}
                  className="block w-full resize-none px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>This bio appears on your public organizer profile.</p>
              </div>}
              <button className="w-full py-3 rounded-xl text-sm font-bold mt-2"
                style={{ background: 'var(--primary)', color: '#fff', opacity: saving ? 0.7 : 1 }} onClick={handleAccountSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          )}

          {tab === 'preferences' && (
            <div className="p-6 space-y-4">
              {[
                { key: 'email_notifications', label: 'Email notifications', desc: 'Receive updates about your tickets and events' },
                { key: 'event_reminders', label: 'Event reminders', desc: 'Get reminded 24h before events you have tickets for' },
                { key: 'promotions', label: 'Promotions', desc: 'Receive special offers and discounts from organizers' },
                { key: 'nearby_events', label: 'New events nearby', desc: 'Get notified about new events in your area' },
              ].map(({ key, label, desc }) => (
                <div key={label} className="flex items-start justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{desc}</p>
                  </div>
                  <button onClick={() => togglePreference(key)} className="relative w-11 h-6 rounded-full flex-shrink-0 transition-all" aria-pressed={!!preferences[key]}
                    style={{ background: preferences[key] ? 'var(--primary)' : 'var(--muted)', border: '1px solid var(--border)' }}>
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                      style={{ left: preferences[key] ? '22px' : '2px', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'security' && (
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>New password</label>
                <input type="password" value={passwordForm.password} onChange={e => setPasswordForm(current => ({ ...current, password: e.target.value }))} placeholder="••••••••" className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(249,112,21,0.6)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249,112,21,0.12)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Confirm password</label>
                <input type="password" value={passwordForm.confirm} onChange={e => setPasswordForm(current => ({ ...current, confirm: e.target.value }))} placeholder="••••••••" className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(249,112,21,0.6)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249,112,21,0.12)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
              </div>
              <button className="w-full py-3 rounded-xl text-sm font-bold" onClick={handlePasswordUpdate} disabled={saving}
                style={{ background: 'var(--primary)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Updating...' : 'Update password'}
              </button>
              <div className="pt-3 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted-foreground)' }}>Sign-in method</p>
                <p className="text-sm">{user.app_metadata?.provider === 'google' ? 'Google' : 'Email & Password'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button onClick={handleSignOut}
          className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}>
          <LogOutIcon size={15} /> Sign out
        </button>

        {mediaModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-semibold">Edit profile images</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>Update your profile photo and cover image.</p></div><button onClick={() => setMediaModalOpen(false)} className="text-xl" style={{ color: 'var(--muted-foreground)' }} aria-label="Close">×</button></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Profile photo</span><div className="flex items-center gap-3"><div className="h-16 w-16 overflow-hidden rounded-2xl flex-shrink-0" style={{ background: 'var(--muted)' }}>{(mediaPreviews.avatar || avatarUrl) && <img src={mediaPreviews.avatar || avatarUrl || ''} alt="Profile preview" className="h-full w-full object-cover" />}</div><div className="flex-1 flex flex-col gap-2"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => handleMediaFile('avatar', event.target.files?.[0])} className="min-w-0 text-xs" style={{ color: 'var(--muted-foreground)' }} />{avatarUrl && <button type="button" onClick={() => handleDeleteImage('avatar')} className="text-xs font-medium text-left" style={{ color: '#ef4444' }} disabled={saving}>Delete photo</button>}</div></div></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Cover image</span><div className="overflow-hidden rounded-xl" style={{ background: 'var(--muted)' }}>{(mediaPreviews.cover || coverImage) && <img src={mediaPreviews.cover || coverImage || ''} alt="Cover preview" className="h-28 w-full object-cover" />}<div className="flex flex-col gap-2 p-3"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => handleMediaFile('cover', event.target.files?.[0])} className="w-full text-xs" style={{ color: 'var(--muted-foreground)' }} />{coverImage && <button type="button" onClick={() => handleDeleteImage('cover')} className="text-xs font-medium text-left" style={{ color: '#ef4444' }} disabled={saving}>Delete cover</button>}</div></div></label>
            </div>
            <div className="mt-5 flex gap-3"><button onClick={() => setMediaModalOpen(false)} className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Cancel</button><button onClick={handleMediaSave} disabled={saving} className="flex-1 rounded-xl py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#fff', opacity: saving ? 0.7 : 1 }}>{saving ? 'Uploading...' : 'Save images'}</button></div>
          </div>
        </div>}

      </div>
    </div>
  )
}
