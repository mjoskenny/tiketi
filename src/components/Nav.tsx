import { useEffect, useState } from 'react'
import { type User } from '@supabase/supabase-js'
import { signOut } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { MenuIcon, XIcon, TicketIcon, UserIcon, LogOutIcon, BarChartIcon, BellIcon, HeartIcon } from './Icon'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../lib/types'

type NavProps = {
  current: string
  navigate: (p: string) => void
  profile: Profile | null
  user: User | null
}

export default function Nav({ current, navigate, profile, user }: NavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const { isOrganizer, teamMembership, agentAssignments } = useAuth()
  const hasPendingInvitation = teamMembership?.status === 'pending'
  const isTeamMember = teamMembership?.status === 'active'
  const isAgentOnlyMember = agentAssignments.length > 0 && teamMembership?.organizer_roles?.name?.toLowerCase() === 'agent'
  const shouldShowOrganizerDashboard = isOrganizer && !isAgentOnlyMember
  const roleBadge = isTeamMember ? teamMembership.organizer_roles?.name ?? 'Team member' : isOrganizer ? 'Organizer' : null

  useEffect(() => {
    if (!user) { setUnreadNotifications(0); return }
    let active = true
    const loadUnread = async () => {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null)
      if (active) setUnreadNotifications(count ?? 0)
    }
    void loadUnread()
    const channel = supabase.channel(`nav-notifications:${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => { void loadUnread() }).subscribe()
    return () => { active = false; void supabase.removeChannel(channel) }
  }, [user?.id])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Use profile data when available, fall back to user metadata
  const displayName: string =
    profile?.full_name?.split(' ')[0] ??
    user?.user_metadata?.full_name?.split(' ')[0] ??
    user?.email?.split('@')[0] ??
    'Account'

  const displayEmail: string =
    profile?.email ?? user?.email ?? ''

  const avatarUrl: string | null =
    profile?.profile_image ?? profile?.avatar_url ?? user?.user_metadata?.profile_image ?? user?.user_metadata?.avatar_url ?? null

  const initials: string = (profile?.full_name ?? user?.user_metadata?.full_name ?? user?.email ?? '?')[0].toUpperCase()

  const isLoggedIn = !!user

  const handleSignOut = async () => {
    setProfileOpen(false)
    setMenuOpen(false)
    await signOut()
    navigate('home')
  }

  const navLink = (label: string, page: string) => (
    <button key={page} onClick={() => navigate(page)}
      className={`nav-link text-sm font-bold transition-colors ${current === page ? 'is-active' : ''}`}
      style={{ color: current === page ? '#fff' : 'rgba(255,255,255,0.78)' }}
      onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
      onMouseLeave={e => (e.currentTarget.style.color = current === page ? '#fff' : 'rgba(255,255,255,0.78)')}>
      {label}
    </button>
  )

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
        style={{ background: scrolled ? 'rgba(10,10,10,0.78)' : 'transparent', backdropFilter: scrolled ? 'blur(24px)' : 'none', WebkitBackdropFilter: scrolled ? 'blur(24px)' : 'none' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-[4.5rem]">

          <button onClick={() => navigate('home')} className="flex items-center gap-2 text-xl font-bold tracking-tight"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', color: 'var(--foreground)', letterSpacing: '-0.04em' }}>
            <span className="flex items-center justify-center w-8 h-8 rounded-[0.7rem] text-sm font-black" style={{ background: 'var(--primary)', color: '#17100a', boxShadow: '0 0 22px rgba(249,112,21,0.28)' }}>t</span>
            tiketi
          </button>

          <div className="hidden md:flex items-center gap-7">
            {navLink('Discover events', 'events')}
            {navLink('For Organizers', 'organizers')}
          </div>

          <div className="hidden md:flex items-center gap-2.5">
            {isLoggedIn ? (
              <>
                {hasPendingInvitation && (
                  <button onClick={() => navigate('dashboard')}
                    className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition-all"
                    style={{ color: '#17100a', background: 'var(--primary)', border: '1px solid transparent' }}>
                    Accept invite
                  </button>
                )}
                {!isOrganizer && (
                  <button onClick={() => navigate('my-tickets')}
                    className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition-all"
                    style={{ color: '#fff', background: current === 'my-tickets' ? 'var(--muted)' : 'transparent', border: '1px solid transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = current === 'my-tickets' ? 'var(--muted)' : 'transparent'; e.currentTarget.style.color = '#fff' }}>
                    <TicketIcon size={16} /> My Tickets
                  </button>
                )}
                {shouldShowOrganizerDashboard && (
                  <button onClick={() => navigate('dashboard')}
                    className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition-all"
                    style={{ color: '#fff', background: current === 'dashboard' ? 'var(--muted)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.16)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = current === 'dashboard' ? 'var(--muted)' : 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = '#fff' }}>
                    <BarChartIcon size={16} /> Dashboard
                  </button>
                )}
                {agentAssignments.length > 0 && (
                  <button onClick={() => navigate('agent-dashboard')}
                    className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition-all"
                    style={{ color: '#fff', background: current === 'agent-dashboard' ? 'var(--muted)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.16)' }}>
                    <TicketIcon size={16} /> Agent Dashboard
                  </button>
                )}

                {/* Avatar dropdown */}
                <div className="relative">
                  <button onClick={() => setProfileOpen(v => !v)}
                    className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl transition-all"
                    style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}>
                    {avatarUrl
                      ? <img src={avatarUrl} className="w-6 h-6 rounded-full object-cover" alt={displayName} />
                      : <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: 'rgba(249,112,21,0.18)', color: 'var(--accent)' }}>
                          {initials}
                        </div>}
                    <span className="text-sm font-medium max-w-[100px] truncate">{displayName}</span>
                  </button>

                  {profileOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                      <div className="absolute right-0 top-12 w-56 rounded-2xl overflow-hidden shadow-2xl z-20"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                          <p className="font-semibold text-sm truncate">{displayName}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{displayEmail}</p>
                          {roleBadge && (
                            <span className="text-xs font-semibold mt-1 inline-block px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(249,112,21,0.12)', color: 'var(--accent)' }}>
                              {roleBadge}
                            </span>
                          )}
                          {isTeamMember && <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{teamMembership.organizer?.name ?? 'Organizer'} team</p>}
                        </div>
                        {[
                          { Icon: UserIcon, label: 'Profile', page: 'profile' },
                          { Icon: HeartIcon, label: 'Favorites', page: 'favorites' },
                          { Icon: BellIcon, label: 'Notifications', page: 'notifications' },
                          ].map(({ Icon, label, page }) => (
                          <button key={page} onClick={() => { navigate(page); setProfileOpen(false) }}
                            className="profile-menu-item w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors"
                            style={{ color: '#fff' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--foreground)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted-foreground)' }}>
                            <Icon size={15} /> <span className="flex-1 text-left">{label}</span>{page === 'notifications' && unreadNotifications > 0 && <span className="min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black" style={{ background: 'var(--primary)', color: '#000' }}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
                          </button>
                        ))}
                        <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
                        <button onClick={handleSignOut}
                          className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors"
                          style={{ color: '#f87171' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <LogOutIcon size={15} /> Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <button onClick={() => navigate('auth-customer')}
                  className="text-sm font-medium px-4 py-2 rounded-xl transition-all"
                  style={{ color: 'var(--muted-foreground)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.background = 'var(--muted)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted-foreground)'; e.currentTarget.style.background = 'transparent' }}>
                  Sign in
                </button>
                <button onClick={() => navigate('auth-organizer')}
                  className="gradient-action text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
                  style={{ boxShadow: '0 4px 20px rgba(249,112,21,0.2)' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  Create Event
                </button>
              </>
            )}
          </div>

          <button className="md:hidden p-2 rounded-xl" style={{ color: 'var(--foreground)' }}
            onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30 md:hidden" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setMenuOpen(false)} />
          <div className="fixed top-16 left-0 right-0 z-40 md:hidden border-b"
            style={{ background: 'rgba(8,8,15,0.98)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="px-4 py-5 flex flex-col gap-1">
              {[
                { label: 'Discover events', page: 'home' },
                { label: 'For Organizers', page: 'organizers' },
                ...(!isOrganizer && isLoggedIn ? [{ label: 'My Tickets', page: 'my-tickets' }] : []),
                ...(shouldShowOrganizerDashboard ? [{ label: 'Dashboard', page: 'dashboard' }] : []),
                ...(agentAssignments.length > 0 ? [{ label: 'Agent Dashboard', page: 'agent-dashboard' }] : []),
              ].map(({ label, page }) => (
                <button key={page} onClick={() => { navigate(page); setMenuOpen(false) }}
                  className="text-left py-3 px-3 rounded-xl text-sm font-medium"
                  style={{ color: current === page ? 'var(--foreground)' : 'var(--muted-foreground)', background: current === page ? 'var(--muted)' : 'transparent' }}>
                  {label}
                </button>
              ))}
              {hasPendingInvitation && (
                <button onClick={() => { navigate('dashboard'); setMenuOpen(false) }}
                  className="mt-2 text-left py-3 px-3 rounded-xl text-sm font-bold"
                  style={{ background: 'var(--primary)', color: '#17100a' }}>
                  Accept organizer invite
                </button>
              )}

              <div className="mt-3 pt-3 border-t flex flex-col gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {isLoggedIn ? (
                  <>
                    <div className="flex items-center gap-3 px-3 py-2">
                      {avatarUrl
                        ? <img src={avatarUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
                        : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: 'rgba(249,112,21,0.18)', color: 'var(--accent)' }}>
                            {initials}
                          </div>}
                      <div>
                        <p className="text-sm font-medium">{displayName}</p>
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{displayEmail}</p>
                      </div>
                    </div>
                    <button onClick={handleSignOut}
                      className="flex items-center gap-2 py-3 px-3 rounded-xl text-sm" style={{ color: '#f87171' }}>
                      <LogOutIcon size={15} /> Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { navigate('auth-customer'); setMenuOpen(false) }}
                      className="py-3 rounded-xl text-sm font-medium text-center"
                      style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                      Sign in
                    </button>
                    <button onClick={() => { navigate('auth-organizer'); setMenuOpen(false) }}
                      className="py-3 rounded-xl text-sm font-semibold text-center"
                      style={{ background: 'var(--primary)', color: '#fff' }}>
                      Create Event
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
