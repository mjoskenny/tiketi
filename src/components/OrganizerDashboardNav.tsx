import { useEffect, useState } from 'react'
import i18n from '../lib/i18n'
import { LanguageSwitcher } from './LocaleContent'
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  Eye,
  LogOut,
  Menu,
  Plus,
  Search,
  ShoppingCart,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'

type NavItem = { key: string; label: string }
type NavGroup = { label: string; keys: string[] }
type OrganizerNotice = { id: string; title: string; body: string; read_at: string | null }
type OrganizerOption = { organizer: { id: string; name: string; logo_url?: string | null }; membership: unknown }

type Props = {
  isOpen: boolean
  onToggle: () => void
  currentSection: string
  navItems: NavItem[]
  navGroups: NavGroup[]
  navIcons: Record<string, LucideIcon>
  sectionPaths: Record<string, string>
  onSelectSection: (section: string) => void
  organizationName: string
  organizationRole: string
  organizerOptions: OrganizerOption[]
  activeOrganizerId: string
  onSwitchOrganizer: (organizerId: string) => void
  fullName: string
  email: string
  avatarUrl: string | null
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  searchValue: string
  onSearchChange: (value: string) => void
  onSearch: () => void
  canCreateEvent: boolean
  onCreateEvent: () => void
  notifications: OrganizerNotice[]
  onOpenNotification: (notification: OrganizerNotice) => void
  onViewNotifications: () => void
  onOpenSettings: () => void
  onNavigate: (page: string, extra?: unknown) => void
  onSignOut: () => void
}

const t = i18n.t

function ThemeGlyph({ theme }: { theme: 'dark' | 'light' }) {
  return theme === 'dark' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
    </svg>
  )
}

export default function OrganizerDashboardNav({
  isOpen,
  onToggle,
  currentSection,
  navItems,
  navGroups,
  navIcons,
  sectionPaths,
  onSelectSection,
  organizationName,
  organizationRole,
  organizerOptions,
  activeOrganizerId,
  onSwitchOrganizer,
  fullName,
  email,
  avatarUrl,
  theme,
  onToggleTheme,
  searchValue,
  onSearchChange,
  onSearch,
  canCreateEvent,
  onCreateEvent,
  notifications,
  onOpenNotification,
  onViewNotifications,
  onOpenSettings,
  onNavigate,
  onSignOut,
}: Props) {
  const [openPanel, setOpenPanel] = useState<'profile' | 'notifications' | 'organizations' | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const unreadCount = notifications.filter(notification => !notification.read_at).length

  const closePanel = () => setOpenPanel(null)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      {openPanel && <button className="qpassa-nav-dismiss" type="button" aria-label={t('Close')} onClick={closePanel} />}
      <aside className={`qpassa-workspace-sidebar ${isOpen ? 'is-open' : ''}`} aria-label={t('Dashboard')}>
        <div className="qpassa-workspace-org-wrap">
          <button type="button" className="qpassa-workspace-org-switcher" aria-label={t('Switch organization')} aria-expanded={openPanel === 'organizations'} onClick={() => setOpenPanel(value => value === 'organizations' ? null : 'organizations')}>
            <span className="qpassa-workspace-org-avatar">
              {organizerOptions.find(option => option.organizer.id === activeOrganizerId)?.organizer.logo_url
                ? <img src={organizerOptions.find(option => option.organizer.id === activeOrganizerId)?.organizer.logo_url ?? ''} alt="" />
                : <Building2 size={15} strokeWidth={1.8} />}
            </span>
            <span className="qpassa-workspace-org-copy"><strong>{organizationName}</strong><small>{organizationRole}</small></span>
            <ChevronsUpDown size={15} strokeWidth={1.8} />
          </button>
          {openPanel === 'organizations' && <div className="qpassa-workspace-org-menu" role="menu" aria-label={t('Organizations')}>
            <p>{t('Switch organization')}</p>
            {organizerOptions.map(option => <button key={option.organizer.id} type="button" role="menuitemradio" aria-checked={option.organizer.id === activeOrganizerId} onClick={() => { onSwitchOrganizer(option.organizer.id); closePanel() }}>
              <span className="qpassa-workspace-org-option-avatar">{option.organizer.logo_url ? <img src={option.organizer.logo_url} alt="" /> : <Building2 size={14} />}</span>
              <span>{option.organizer.name}</span>
              {option.organizer.id === activeOrganizerId && <Check size={14} />}
            </button>)}
            {!organizerOptions.length && <span className="qpassa-workspace-org-empty">{t('No organizations available')}</span>}
          </div>}
        </div>
        <nav className="qpassa-workspace-links" aria-label="Organizer dashboard sections">
          <div className="qpassa-workspace-language-switcher" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'flex-start' }}>
            <LanguageSwitcher bare />
          </div>
          {navGroups.map(group => {
            const groupItems = group.keys.flatMap(key => {
              const item = navItems.find(candidate => candidate.key === key)
              return item ? [item] : []
            })
            if (!groupItems.length) return null
            return <section className="qpassa-workspace-link-group" key={group.label}>
              {group.label && <h6>{group.label}</h6>}
              {groupItems.map(item => {
                const Icon = navIcons[item.key]
                return <a
                  key={item.key}
                  href={sectionPaths[item.key]}
                  aria-current={currentSection === item.key ? 'page' : undefined}
                  onClick={event => { event.preventDefault(); closePanel(); onSelectSection(item.key) }}
                  className="qpassa-workspace-link"
                >
                  {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
                  <span>{item.label}</span>
                  {item.key === 'notifications' && unreadCount > 0 && <i>{unreadCount > 99 ? '99+' : unreadCount}</i>}
                </a>
              })}
            </section>
          })}
        </nav>

        {canCreateEvent && <div className="qpassa-workspace-create-card">
          <span className="qpassa-workspace-create-mark"><Plus size={15} strokeWidth={2.2} /></span>
          <strong>{t('Ready to host?')}</strong>
          <span>{t('Bring your next event to life.')}</span>
          <button type="button" onClick={onCreateEvent}>{t('Create an event')} <Plus size={13} strokeWidth={2} /></button>
          <small className="qpassa-workspace-create-context">{t('Organizer dashboard')}</small>
        </div>}

        <div className="qpassa-workspace-user-wrap">
          {openPanel === 'profile' && <div className="qpassa-workspace-user-menu" role="menu">
            <p title={email}>{email || fullName || organizationName}</p>
            <button type="button" role="menuitem" onClick={() => { closePanel(); onOpenSettings() }}><UserRoundIcon />{t('Account profile')}</button>
            <button type="button" role="menuitem" onClick={() => { closePanel(); onNavigate('organizer-profile') }}><ExternalLink size={15} strokeWidth={1.8} />{t('Organizer profile')}</button>
            <button type="button" role="menuitem" onClick={() => { closePanel(); onNavigate('organizer-profile') }}><Eye size={15} strokeWidth={1.8} />{t('View site')}</button>
            <button type="button" role="menuitem" onClick={onSignOut} className="is-signout"><LogOut size={15} strokeWidth={1.8} />{t('Sign out')}</button>
          </div>}
          <button type="button" className="qpassa-workspace-user" aria-label={t('Open profile menu')} aria-expanded={openPanel === 'profile'} onClick={() => setOpenPanel(value => value === 'profile' ? null : 'profile')}>
            <span className="qpassa-workspace-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{(fullName || organizationName || '?').slice(0, 1).toUpperCase()}</span>}
            </span>
            <span className="qpassa-workspace-user-copy"><strong>{fullName || organizationName}</strong><small>{t('View profile')}</small></span>
            {openPanel === 'profile' ? <ChevronDown size={15} strokeWidth={1.8} /> : <ChevronRight size={15} strokeWidth={1.8} />}
          </button>
        </div>
      </aside>

      {isOpen && <button type="button" className="qpassa-workspace-backdrop" aria-label={t('Close sidebar')} onClick={onToggle} />}
      <header className={`qpassa-workspace-header ${isOpen ? 'is-sidebar-open' : ''} ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="qpassa-workspace-header-start">
          <button type="button" className="qpassa-workspace-menu-button" aria-label={isOpen ? t('Close sidebar') : t('Open sidebar')} onClick={onToggle}>
            {isOpen ? <X size={19} strokeWidth={1.8} /> : <Menu size={19} strokeWidth={1.8} />}
          </button>
          <span className="qpassa-workspace-mobile-brand" aria-label="QPassa">
            <span className="qpassa-workspace-mobile-brand-mark" aria-hidden="true">Q</span>
            <strong>QPassa</strong>
          </span>
        </div>
        <div className="qpassa-workspace-header-actions">
          <label className="qpassa-workspace-search">
            <Search size={16} strokeWidth={1.8} aria-hidden="true" />
            <input value={searchValue} onChange={event => onSearchChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') onSearch() }} placeholder={t('Search')} aria-label={t('Search events')} />
            <kbd>↵</kbd>
          </label>
          {canCreateEvent && <button type="button" className="qpassa-workspace-create" onClick={onCreateEvent}><Plus size={15} strokeWidth={1.9} />{t('Create Event')}</button>}
          <button type="button" className="qpassa-workspace-icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={onToggleTheme}><ThemeGlyph theme={theme} /></button>
          <div className="qpassa-workspace-notices">
            <button type="button" className="qpassa-workspace-icon-button" aria-label={unreadCount ? `${t('Notifications')}, ${unreadCount} ${t('unread')}` : t('Notifications')} aria-expanded={openPanel === 'notifications'} onClick={() => setOpenPanel(value => value === 'notifications' ? null : 'notifications')}>
              <Bell size={17} strokeWidth={1.8} />
              {unreadCount > 0 && <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            {openPanel === 'notifications' && <div className="qpassa-workspace-notice-menu">
              <div className="qpassa-workspace-notice-heading"><strong>{t('Notifications')}</strong><Bell size={15} strokeWidth={1.8} /></div>
              <div className="qpassa-workspace-notice-list">
                {notifications.slice(0, 6).map(notification => <button key={notification.id} type="button" onClick={() => { closePanel(); onOpenNotification(notification) }} className={!notification.read_at ? 'is-unread' : ''}>
                  <strong>{notification.title}</strong><span>{notification.body}</span>
                </button>)}
                {!notifications.length && <p>{t('No organizer updates yet.')}</p>}
              </div>
              <button type="button" className="qpassa-workspace-view-notices" onClick={() => { closePanel(); onViewNotifications() }}>{t('View all notifications')}</button>
            </div>}
          </div>
        </div>
      </header>
      <nav className="qpassa-workspace-mobile-nav" aria-label="Organizer dashboard shortcuts">
        {[
          { key: 'overview', label: 'Home', Icon: navIcons.overview },
          { key: 'orders', label: 'Orders', Icon: ShoppingCart },
          { key: 'events', label: 'Events', Icon: navIcons.events },
          { key: 'customers', label: 'Customers', Icon: navIcons.customers },
          { key: 'profile', label: 'Profile', Icon: UserRound },
        ].flatMap(item => {
          const dashboardSection = item.key === 'profile' ? null : item.key
          const sectionAvailable = dashboardSection === null || navItems.some(candidate => candidate.key === dashboardSection)
          if (!sectionAvailable || !item.Icon) return []
          const active = dashboardSection ? currentSection === dashboardSection : currentSection === 'settings'
          return [<button key={item.key} type="button" aria-current={active ? 'page' : undefined} onClick={() => {
            closePanel()
            if (dashboardSection) onSelectSection(dashboardSection)
            else onOpenSettings()
          }}>
            <item.Icon size={17} strokeWidth={1.8} aria-hidden="true" />
            {active && <span>{item.label}</span>}
          </button>]
        })}
      </nav>
    </>
  )
}

function UserRoundIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
}
