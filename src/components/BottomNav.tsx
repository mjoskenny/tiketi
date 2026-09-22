import { useAuth } from '../context/AuthContext'
import { SearchIcon, TicketIcon, BellIcon, UserIcon, BarChartIcon } from './Icon'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  current: string
  navigate: (p: string) => void
}

function HomeIcon2({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  )
}

export default function BottomNav({ current, navigate }: Props) {
  const { user, isOrganizer, teamMembership } = useAuth()
  const hasPendingInvitation = teamMembership?.status === 'pending'
  const [visible, setVisible] = useState(true)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const lastScrollY = useRef(0)

  useEffect(() => {
    if (!user) { setUnreadNotifications(0); return }
    let active = true
    const loadUnread = async () => {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null)
      if (active) setUnreadNotifications(count ?? 0)
    }
    void loadUnread()
    const channel = supabase.channel(`bottom-notifications:${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => { void loadUnread() }).subscribe()
    return () => { active = false; void supabase.removeChannel(channel) }
  }, [user?.id])

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const diff = currentScrollY - lastScrollY.current

      if (currentScrollY < 20) setVisible(true)
      else if (diff > 10) setVisible(false)
      else if (diff < -10) setVisible(true)

      lastScrollY.current = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const items = [
    { key: 'home', label: 'Discover', Icon: HomeIcon2 },
    { key: 'events', label: 'Events', Icon: SearchIcon },
    ...(user
      ? hasPendingInvitation
        ? [{ key: 'dashboard', label: 'Accept invite', Icon: BarChartIcon }]
        : isOrganizer
        ? [{ key: 'dashboard', label: 'Dashboard', Icon: BarChartIcon }]
        : [{ key: 'my-tickets', label: 'Tickets', Icon: TicketIcon }]
      : [{ key: 'my-tickets', label: 'Tickets', Icon: TicketIcon }]
    ),
    ...(user ? [{ key: 'notifications', label: 'Alerts', Icon: BellIcon }] : []),
    { key: 'profile', label: user ? 'Profile' : 'Sign in', Icon: UserIcon },
  ]

  const HIDDEN_PAGES = new Set(['auth-customer', 'auth-organizer', 'checkin', 'dashboard', 'agent-dashboard', 'agent-ticket'])
  if (HIDDEN_PAGES.has(current)) return null
  const hasFloatingCenter = items.length % 2 === 1 && items.length >= 5

  return (
    <nav className="fixed bottom-3 left-1/2 z-50 md:hidden safe-area-bottom transition-all duration-300"
      style={{
        width: 'calc(100vw - 16px)',
        maxWidth: '420px',
        opacity: visible ? 1 : 0,
        transform: `translateX(-50%) ${visible ? 'translateY(0)' : 'translateY(140%)'}`,
        pointerEvents: visible ? 'auto' : 'none',
      }}>
      <div className="relative">
        <div aria-hidden="true" className="absolute inset-0 rounded-[26px] border shadow-2xl"
        style={{
          background: 'rgba(16,16,16,0.86)',
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.38)',
          ...(hasFloatingCenter ? {
            maskImage: 'radial-gradient(circle 48px at 50% 18px, transparent 0 42px, #000 43px)',
            WebkitMaskImage: 'radial-gradient(circle 48px at 50% 18px, transparent 0 42px, #000 43px)',
          } : {}),
        }} />
        <div className={`relative items-center rounded-[26px] px-2 py-2 ${hasFloatingCenter ? 'grid grid-cols-5' : 'flex justify-around'}`}>
        {items.map(({ key, label, Icon }, index) => {
          const active = current === key
          const isCenter = hasFloatingCenter && index === Math.floor(items.length / 2)
          return (
            <button
              key={key}
              onClick={() => user || key === 'home' || key === 'events' ? navigate(key) : navigate('auth-customer')}
              className={`relative flex flex-col items-center gap-1 rounded-2xl px-3 py-2 transition-all ${isCenter ? 'z-10 -translate-y-7 justify-self-center' : ''}`}
              style={{
                color: isCenter || active ? '#fff' : 'rgba(255,255,255,0.6)',
                background: isCenter ? 'linear-gradient(145deg, #ff9a3d 0%, var(--primary) 72%)' : active ? 'linear-gradient(135deg, rgba(249,112,21,0.2), rgba(249,112,21,0.08))' : 'transparent',
                minWidth: isCenter ? 72 : 52,
                width: isCenter ? 72 : undefined,
                height: isCenter ? 72 : undefined,
                justifyContent: isCenter ? 'center' : undefined,
                border: isCenter ? '0 solid transparent' : active ? '1px solid rgba(249,112,21,0.38)' : '1px solid transparent',
                borderRadius: isCenter ? '999px' : undefined,
                boxShadow: isCenter ? 'none' : undefined,
              }}>
              <div className="relative">
                <Icon size={20} />
                {key === 'notifications' && unreadNotifications > 0 && <span className="absolute -right-2 -top-2 min-w-5 rounded-full px-1 text-center text-[10px] font-black" style={{ background: 'var(--primary)', color: '#000' }}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
              </div>
              <span className={`text-[10px] font-medium ${isCenter ? 'absolute -bottom-7 whitespace-nowrap' : ''}`}>{label}</span>
            </button>
          )
        })}
        </div>
      </div>
    </nav>
  )
}
