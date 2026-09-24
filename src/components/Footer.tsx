import { WhatsAppIcon, InstagramIcon, FacebookIcon, TwitterXIcon, TikTokIcon, MapPinIcon, MailIcon, PhoneIcon } from './Icon'
import { FEATURES } from '../lib/features'

type FooterProps = {
  navigate: (p: string) => void
  publicPlatformSettings?: {
    platform_name?: string
    support_email?: string
    support_phone?: string
    contact_whatsapp?: string
    contact_address?: string
    social_links?: Array<{ platform: string; label: string; href: string; active: boolean }>
  }
}

export default function Footer({ navigate, publicPlatformSettings }: FooterProps) {
  const platformName = publicPlatformSettings?.platform_name || 'Tiketi'
  const supportEmail = publicPlatformSettings?.support_email || 'hello@tiketi.events'
  const supportPhone = publicPlatformSettings?.support_phone || '+257 22 000 000'
  const contactAddress = publicPlatformSettings?.contact_address || 'Bujumbura, Burundi'
  const socials = (publicPlatformSettings?.social_links ?? []).filter(link => link.active && link.href)

  const socialIconMap: Record<string, React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
    instagram: InstagramIcon,
    facebook: FacebookIcon,
    x: TwitterXIcon,
    tiktok: TikTokIcon,
    whatsapp: WhatsAppIcon,
  }

  return (
    <footer className="mt-16" style={{ background: '#070709' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2 md:col-span-2">
            <div className="mb-2 text-2xl font-black" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '-0.02em' }}>{platformName.toLowerCase()}</div>
            <p className="mb-5 text-sm" style={{ color: 'var(--muted-foreground)' }}>Discover. Book. Experience.</p>
            <div className="mb-3 flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <MapPinIcon size={13} />
              {contactAddress}
            </div>
            <div className="mb-3 flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <MailIcon size={13} />
              <a href={`mailto:${supportEmail}`} className="transition-colors hover:text-white">{supportEmail}</a>
            </div>
            <div className="mb-6 flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <PhoneIcon size={13} />
              <a href={`tel:${supportPhone.replace(/\s+/g, '')}`} className="transition-colors hover:text-white">{supportPhone}</a>
            </div>
            <div className="flex gap-3">
              {socials.map(link => {
                const Icon = socialIconMap[link.platform] ?? InstagramIcon
                return (
                  <a
                    key={link.platform}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={link.label}
                    className="flex h-9 w-9 items-center justify-center rounded-xl transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '0' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, var(--primary-light), var(--accent-lime))'; e.currentTarget.style.color = '#17100a' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'inherit' }}
                  >
                    <Icon size={16} />
                  </a>
                )
              })}
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-xs font-semibold tracking-widest" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>PLATFORM</h4>
            {[
              { label: 'Discover', page: 'events' },
              { label: 'Events', page: 'events' },
              { label: 'For Organizers', page: 'organizers' },
              { label: 'My Tickets', page: 'my-tickets' },
            ].map(({ label, page }) => (
              <button key={page} onClick={() => navigate(page)}
                className="mb-3 block text-left text-sm transition-colors"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}>
                {label}
              </button>
            ))}
          </div>

          <div>
            <h4 className="mb-4 text-xs font-semibold tracking-widest" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>COMPANY</h4>
            {[
              { label: 'Home', page: 'marketing' },
              { label: 'About', page: 'about' },
            ].map(({ label, page }) => (
              <button key={label} onClick={() => navigate(page)} className="mb-3 block cursor-pointer text-left text-sm transition-colors"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}>
                {label}
              </button>
            ))}
          </div>

          <div>
            <h4 className="mb-4 text-xs font-semibold tracking-widest" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>SUPPORT</h4>
            {[['Help Center', 'help'], ['Contact Us', 'contact'], ['Terms', 'terms'], ['Privacy', 'privacy'], ...(FEATURES.refunds ? [['Refunds', 'refunds']] : [])].map(([label, page]) => (
              <button key={label} onClick={() => navigate(page)} className="mb-3 block cursor-pointer text-left text-sm"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>© 2026 {platformName}. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#22c55e' }} />
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>All systems operational</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
