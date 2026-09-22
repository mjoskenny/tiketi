import { useState } from 'react'
import { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } from '../lib/supabase'
import { GoogleIcon, TicketIcon, BarChartIcon, ShieldIcon, EyeIcon, CheckIcon } from '../components/Icon'

type Mode = 'customer' | 'organizer'
type AuthView = 'signin' | 'signup' | 'reset'
type Props = { defaultMode?: Mode; navigate?: (p: string) => void }

const EyeOffIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)
const MailIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
)
const LockIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)
const PersonIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const ArrowLeftIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
)

const PERKS = [
  { icon: TicketIcon, label: 'Sell tickets online and through agents' },
  { icon: BarChartIcon, label: 'Real-time sales analytics & revenue' },
  { icon: ShieldIcon, label: 'QR check-in and attendee management' },
]

function Field({ Icon, type, placeholder, value, onChange, right }: {
  Icon: React.FC<{ size?: number }>; type: string; placeholder: string
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  right?: React.ReactNode
}) {
  return (
    <div className="relative">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted-foreground)' }}>
        <Icon size={14} />
      </div>
      <input type={type} placeholder={placeholder} value={value} onChange={onChange}
        className="w-full pl-10 pr-10 py-3.5 rounded-xl text-sm outline-none"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--foreground)', transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(249,112,21,0.7)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249,112,21,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }} />
      {right && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  )
}

export default function AuthPage({ defaultMode = 'customer', navigate }: Props) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [view, setView] = useState<AuthView>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))
  const clear = () => { setError(null); setSuccess(null) }
  const switchView = (v: AuthView) => { setView(v); clear(); setForm({ name: '', email: '', password: '', confirm: '' }) }

  function friendlyError(e: unknown, context?: 'google' | 'email'): string {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('provider') && msg.includes('not enabled')) {
      if (context === 'google')
        return 'Google sign-in is not fully configured. In your Supabase dashboard go to Authentication → Providers → Google and add your Google OAuth Client ID and Client Secret. Use email/password below instead.'
      return 'Email sign-in is not enabled. In your Supabase dashboard go to Authentication → Providers and enable the Email provider.'
    }
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials'))
      return 'Incorrect email or password. Please try again.'
    if (msg.includes('Email not confirmed'))
      return 'Check your inbox and click the confirmation link, then try signing in again.'
    if (msg.includes('User already registered'))
      return 'An account with this email already exists. Sign in instead.'
    if (msg.includes('Password should be') || msg.includes('weak_password'))
      return 'Password must be at least 6 characters.'
    if (msg.includes('rate limit') || msg.includes('too many'))
      return 'Too many attempts. Wait a moment and try again.'
    return msg || 'Something went wrong. Please try again.'
  }

  const handleGoogle = async () => {
    setLoading(true); clear()
    try { await signInWithGoogle(mode) }
    catch (e: unknown) { setError(friendlyError(e, 'google')); setLoading(false) }
  }

  const handleSignIn = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!form.email || !form.password) { setError('Fill in all fields.'); return }
    setLoading(true); clear()
    try { await signInWithEmail(form.email, form.password) }
    catch (e: unknown) { setError(friendlyError(e, 'email')); setLoading(false) }
  }

  const handleSignUp = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!form.name || !form.email || !form.password) { setError('Fill in all fields.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    setLoading(true); clear()
    try {
      await signUpWithEmail(form.email, form.password, form.name, mode)
      setSuccess('Account created! Check your email to confirm, then sign in.')
      switchView('signin')
    } catch (e: unknown) { setError(friendlyError(e, 'email')) }
    finally { setLoading(false) }
  }

  const handleReset = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!form.email) { setError('Enter your email.'); return }
    setLoading(true); clear()
    try { await resetPassword(form.email); setSuccess('Reset link sent — check your inbox.') }
    catch (e: unknown) { setError(friendlyError(e, 'email')) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'radial-gradient(circle at 76% 12%, rgba(249,112,21,0.11), transparent 28%), var(--background)', color: 'var(--foreground)' }}>

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex flex-col w-[46%] relative overflow-hidden">
        <img src="https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=900&h=1200&fit=crop&auto=format"
          alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.28 }} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(145deg, rgba(8,8,8,0.98) 0%, rgba(122,45,10,0.62) 55%, rgba(8,8,8,0.94) 100%)' }} />
        <div className="absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(249,112,21,0.13) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

        <div className="relative flex flex-col justify-between h-full p-12">
          <button onClick={() => navigate?.('home')} className="text-2xl font-black w-fit"
            style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
            TIKETI
          </button>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-5"
              style={{ background: 'rgba(249,112,21,0.15)', border: '1px solid rgba(249,112,21,0.34)', color: 'var(--primary-light)' }}>
              {mode === 'organizer' ? 'For Organizers' : 'Event Discovery'}
            </div>
            <h2 className="text-4xl font-bold leading-tight mb-4"
              style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.03em' }}>
              {mode === 'organizer'
                ? <><span>Sell out your</span><br /><span style={{ color: 'var(--accent)' }}>next event.</span></>
                : <><span>Discover events</span><br /><span style={{ color: 'var(--accent)' }}>near you.</span></>}
            </h2>
            <p className="text-sm leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.45)', maxWidth: 300 }}>
              {mode === 'organizer'
                ? 'Create, sell, promote and manage events from one platform built for Burundi.'
                : 'Find concerts, parties, sports, comedy and more happening in Bujumbura.'}
            </p>
            {mode === 'organizer' && (
              <div className="space-y-3">
                {PERKS.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(249,112,21,0.16)', border: '1px solid rgba(249,112,21,0.3)' }}>
                      <Icon size={13} style={{ color: 'var(--accent)' }} />
                    </div>
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.18)' }}>© 2026 Tiketi · Bujumbura, Burundi</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-[28px] p-6 sm:p-8"
          style={{ background: 'rgba(18,18,18,0.82)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>

          {/* Mobile logo */}
          <button onClick={() => navigate?.('home')} className="lg:hidden block w-full text-center text-2xl font-black mb-8"
            style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>TIKETI</button>

          {/* Role selector */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.42)' }}>I am a</span>
            </div>
            <div className="inline-flex items-center rounded-full border p-1"
              style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}>
              {(['customer', 'organizer'] as Mode[]).map(m => (
                <button key={m} onClick={() => { setMode(m); clear() }}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-all"
                  style={{
                    background: mode === m ? 'linear-gradient(135deg, rgba(249,112,21,0.18), rgba(249,112,21,0.08))' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--muted-foreground)',
                    boxShadow: mode === m ? 'inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
                  }}>
                  {m === 'customer' ? 'Attendee' : 'Organizer'}
                </button>
              ))}
            </div>
          </div>

          {/* View tabs (sign in / create account) */}
          {view !== 'reset' && (
            <div className="mb-6 p-1 rounded-2xl"
              style={{ background: 'rgba(12,12,12,0.66)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex gap-1">
                {(['signin', 'signup'] as AuthView[]).map(v => (
                  <button key={v} onClick={() => switchView(v)}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all"
                    style={{
                      background: view === v ? 'linear-gradient(135deg, #ff7a18 0%, #ff9e45 45%, #ffd36b 100%)' : 'transparent',
                      color: view === v ? '#17100a' : 'var(--muted-foreground)',
                      boxShadow: view === v ? '0 10px 24px rgba(249,112,21,0.22)' : 'none',
                    }}>
                    {v === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Heading */}
          {view === 'reset' ? (
            <div className="mb-5">
              <button onClick={() => switchView('signin')} className="text-sm flex items-center gap-1.5 mb-4"
                style={{ color: 'var(--muted-foreground)' }}>
                <ArrowLeftIcon size={13} /> Back to sign in
              </button>
              <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>Reset password</h1>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>We&apos;ll email you a link to reset your password.</p>
            </div>
          ) : (
            <div className="mb-5">
              <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
                {view === 'signin'
                  ? (mode === 'customer' ? 'Welcome back' : 'Organizer sign in')
                  : 'Create your account'}
              </h1>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {view === 'signin'
                  ? 'Sign in to access your tickets and events.'
                  : mode === 'organizer' ? 'Start selling tickets in minutes.' : 'Join thousands of event-goers in Burundi.'}
              </p>
            </div>
          )}

          {/* Alerts */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm leading-relaxed"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}>
              {error}
              {error.includes('Supabase dashboard') && (
                <a
                  href="https://supabase.com/dashboard/project/_/auth/providers"
                  target="_blank"
                  rel="noreferrer"
                  className="block mt-2 underline font-semibold"
                  style={{ color: '#fca5a5' }}
                >
                  Open Supabase Auth Providers →
                </a>
              )}
            </div>
          )}
          {success && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-start gap-2"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}>
              <CheckIcon size={14} style={{ marginTop: 1, flexShrink: 0 }} /> {success}
            </div>
          )}

          {/* ── Email/password forms (PRIMARY) ── */}
          {view === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-3">
              <Field Icon={MailIcon} type="email" placeholder="Email address" value={form.email} onChange={set('email')} />
              <Field Icon={LockIcon} type={showPw ? 'text' : 'password'} placeholder="Password" value={form.password} onChange={set('password')}
                right={
                  <button type="button" onClick={() => setShowPw(v => !v)} style={{ color: 'var(--muted-foreground)' }}>
                    {showPw ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                  </button>
                } />
              <div className="flex justify-end">
                <button type="button" onClick={() => switchView('reset')} className="text-xs"
                  style={{ color: 'var(--muted-foreground)' }}>
                  Forgot password?
                </button>
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-xl font-semibold text-sm transition-transform hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(110deg, #ff7a18 0%, #ff9e45 45%, #ffd36b 100%)', color: '#17100a', opacity: loading ? 0.7 : 1, boxShadow: '0 10px 22px rgba(249,112,21,0.24)' }}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {view === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3">
              <Field Icon={PersonIcon} type="text" placeholder="Full name" value={form.name} onChange={set('name')} />
              <Field Icon={MailIcon} type="email" placeholder="Email address" value={form.email} onChange={set('email')} />
              <Field Icon={LockIcon} type={showPw ? 'text' : 'password'} placeholder="Password (min. 8 chars)" value={form.password} onChange={set('password')}
                right={
                  <button type="button" onClick={() => setShowPw(v => !v)} style={{ color: 'var(--muted-foreground)' }}>
                    {showPw ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                  </button>
                } />
              <Field Icon={LockIcon} type={showPw ? 'text' : 'password'} placeholder="Confirm password" value={form.confirm} onChange={set('confirm')} />
              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-xl font-semibold text-sm transition-transform hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(110deg, #ff7a18 0%, #ff9e45 45%, #ffd36b 100%)', color: '#17100a', opacity: loading ? 0.7 : 1, boxShadow: '0 10px 22px rgba(249,112,21,0.24)' }}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
              <p className="text-xs text-center" style={{ color: 'var(--muted-foreground)' }}>
                By signing up you agree to our{' '}
                <span className="underline cursor-pointer" style={{ color: 'rgba(160,160,192,0.65)' }}>Terms</span>
                {' '}and{' '}
                <span className="underline cursor-pointer" style={{ color: 'rgba(160,160,192,0.65)' }}>Privacy</span>.
              </p>
            </form>
          )}

          {/* ── Google OAuth (SECONDARY — requires Google Cloud setup) ── */}
          {view !== 'reset' && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>or</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <button onClick={handleGoogle} disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-sm transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.65)',
                  opacity: loading ? 0.5 : 1,
                }}
                onMouseEnter={e => !loading && (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}>
                <GoogleIcon size={17} />
                Continue with Google
              </button>
            </>
          )}

          {/* Reset form */}
          {view === 'reset' && (
            <form onSubmit={handleReset} className="space-y-3">
              <Field Icon={MailIcon} type="email" placeholder="Your email address" value={form.email} onChange={set('email')} />
              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-xl font-semibold text-sm transition-transform hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(110deg, #ff7a18 0%, #ff9e45 45%, #ffd36b 100%)', color: '#17100a', opacity: loading ? 0.7 : 1, boxShadow: '0 10px 22px rgba(249,112,21,0.24)' }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          {/* Organizer first-time note */}
          {mode === 'organizer' && view === 'signup' && (
            <div className="mt-5 p-4 rounded-xl"
              style={{ background: 'rgba(249,112,21,0.07)', border: '1px solid rgba(249,112,21,0.2)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--accent)' }}>First time as an organizer?</p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Your organizer profile is set up automatically — no extra steps needed.
              </p>
            </div>
          )}

          {/* Social proof */}
          {view !== 'reset' && (
            <div className="mt-7 pt-5 border-t flex items-center gap-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="flex -space-x-2 flex-shrink-0">
                {[
                  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop',
                  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop',
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=40&h=40&fit=crop',
                ].map((src, i) => (
                  <img key={i} src={src} className="w-7 h-7 rounded-full object-cover border-2"
                    style={{ borderColor: 'var(--background)' }} alt="" />
                ))}
              </div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Joined by <strong style={{ color: 'var(--foreground)' }}>2,400+</strong> in Bujumbura
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
