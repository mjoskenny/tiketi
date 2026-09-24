import { WhatsAppIcon, InstagramIcon, FacebookIcon, TwitterXIcon, TikTokIcon, MapPinIcon } from './Icon'
import { FEATURES } from '../lib/features'

type FooterProps = { navigate: (p: string) => void }

export default function Footer({ navigate }: FooterProps) {
  const socials = [
    { Icon: InstagramIcon, label: 'Instagram', href: 'https://www.instagram.com/' },
    { Icon: FacebookIcon, label: 'Facebook', href: 'https://www.facebook.com/' },
    { Icon: TwitterXIcon, label: 'X / Twitter', href: 'https://x.com/' },
    { Icon: TikTokIcon, label: 'TikTok', href: 'https://www.tiktok.com/' },
    { Icon: WhatsAppIcon, label: 'WhatsApp', href: 'https://wa.me/' },
  ]

  return (
    <footer className="mt-16" style={{ background: '#070709' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">

          {/* Brand */}
          <div className="col-span-2 md:col-span-2">
            <div className="text-2xl font-black mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '-0.02em' }}>tiketi</div>
            <p className="text-sm mb-5" style={{ color: 'var(--muted-foreground)' }}>Discover. Book. Experience.</p>
            <div className="flex items-center gap-1.5 mb-6 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <MapPinIcon size={13} />
              Bujumbura, Burundi
            </div>
            <div className="flex gap-3">
              {socials.map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '0' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, var(--primary-light), var(--accent-lime))'; e.currentTarget.style.color = '#17100a' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'inherit' }}
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-xs font-semibold mb-4 tracking-widest" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>PLATFORM</h4>
            {[
              { label: 'Discover', page: 'events' },
              { label: 'Events', page: 'events' },
              { label: 'For Organizers', page: 'organizers' },
              { label: 'My Tickets', page: 'my-tickets' },
            ].map(({ label, page }) => (
              <button key={page} onClick={() => navigate(page)}
                className="block text-sm mb-3 text-left transition-colors"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}>
                {label}
              </button>
            ))}
          </div>

          <div>
            <h4 className="text-xs font-semibold mb-4 tracking-widest" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>COMPANY</h4>
            {[
              { label: 'Home', page: 'marketing' },
              { label: 'About', page: 'about' },
            ].map(({ label, page }) => (
              <button key={label} onClick={() => navigate(page)} className="block text-sm mb-3 cursor-pointer transition-colors text-left"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}>
                {label}
              </button>
            ))}
          </div>

          <div>
            <h4 className="text-xs font-semibold mb-4 tracking-widest" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>SUPPORT</h4>
            {[['Help Center', 'help'], ['Contact Us', 'contact'], ['Terms', 'terms'], ['Privacy', 'privacy'], ...(FEATURES.refunds ? [['Refunds', 'refunds']] : [])].map(([label, page]) => (
              <button key={label} onClick={() => navigate(page)} className="block text-sm mb-3 cursor-pointer text-left"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>© 2026 Tiketi. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>All systems operational</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
