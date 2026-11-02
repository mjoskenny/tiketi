import { useAuth } from '../context/AuthContext'
import { SearchIcon, TicketIcon, UserIcon } from './Icon'
import { useEffect, useRef, useState } from 'react'

type Props = {
  current: string
  navigate: (p: string) => void
}

function HomeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  )
}

export default function BottomNav({ current, navigate }: Props) {
  const { user } = useAuth()
  const [visible, setVisible] = useState(true)
  const lastScrollY = useRef(0)

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
    { key: 'discover', label: 'Home', Icon: HomeIcon },
    { key: 'events', label: 'Discover', Icon: SearchIcon },
    { key: 'my-tickets', label: 'Tickets', Icon: TicketIcon },
    { key: 'profile', label: user ? 'Profile' : 'Sign in', Icon: UserIcon },
  ]

  const HIDDEN_PAGES = new Set(['auth-customer', 'auth-organizer', 'checkin', 'dashboard', 'agent-dashboard', 'agent-ticket'])
  if (HIDDEN_PAGES.has(current)) return null
  return (
    <nav className="fixed bottom-3 left-[50vw] z-50 md:hidden safe-area-bottom transition-transform duration-300"
      style={{
        width: 'min(940px, calc(100vw - 24px))',
        boxSizing: 'border-box',
        transform: `translateX(-50%) ${visible ? 'translateY(0)' : 'translateY(140%)'}`,
        pointerEvents: visible ? 'auto' : 'none',
      }}>
      <div className="attendee-bottom-nav-frame relative">
        <div aria-hidden="true" className="attendee-bottom-nav-surface absolute inset-0" />
        <div className="attendee-bottom-nav-items relative flex items-center">
        {items.map(({ key, label, Icon }) => {
          const active = current === key
          return (
            <button
              key={key}
              onClick={() => user || key === 'discover' || key === 'events' ? navigate(key) : navigate('auth-customer')}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              title={label}
              className={`attendee-bottom-nav-item relative flex min-w-0 items-center justify-center transition-all ${active ? 'is-active' : ''}`}
              style={active ? { flex: '0 0 auto', minWidth: 'max-content' } : undefined}
              >
              <div className="attendee-bottom-nav-content relative flex items-center justify-center">
                <Icon size={24} />
                {active && <span className="attendee-bottom-nav-label truncate">{label}</span>}
              </div>
            </button>
          )
        })}
        </div>
      </div>
    </nav>
  )
}
