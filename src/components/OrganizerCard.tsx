import { ArrowRightIcon, CheckIcon } from './Icon'
import type { Organizer } from '../lib/types'

export type OrganizerCardProps = {
  organizer: Organizer
  eventCount: number
  coverImage?: string | null
  onClick: () => void
  directory?: boolean
}

export default function OrganizerCard({ organizer, eventCount, coverImage, onClick, directory = false }: OrganizerCardProps) {
  const name = organizer.profiles?.full_name?.trim() || organizer.name
  const initials = name.slice(0, 1).toUpperCase()
  const username = organizer.profiles?.username?.trim().replace(/^@/, '') || null
  const avatar = organizer.profiles?.profile_image ?? organizer.profiles?.avatar_url ?? organizer.logo_url ?? null
  const banner = coverImage ?? organizer.profiles?.cover_image ?? null
  const verified = organizer.verified || organizer.verification_status === 'verified'

  return (
    <button
      onClick={onClick}
      className={`home-organizer-card ${directory ? 'organizer-directory-card' : ''} group relative flex min-w-[300px] flex-1 flex-col overflow-visible rounded-2xl border text-left transition-all`}
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <span className="relative block h-32 w-full shrink-0 overflow-hidden rounded-t-2xl" style={{ background: 'var(--muted)' }}>
        {banner && <img src={banner} alt="" className="h-full w-full rounded-t-2xl object-cover opacity-75 transition-transform duration-300 group-hover:scale-105" />}
        <span className="absolute inset-0 rounded-t-2xl bg-gradient-to-t from-black/55 to-transparent" />
      </span>
      <span className="organizer-card-details flex min-w-0 flex-1 items-center gap-3 px-4 py-4">
        <span className="organizer-card-avatar shrink-0">
          <span className="organizer-card-avatar-image">
            {avatar
              ? <img src={avatar} alt={name} />
              : <span className="organizer-card-avatar-fallback">{initials}</span>}
          </span>
          {verified && <span className="verified-profile-badge organizer-card-verified" aria-label="Verified organizer"><CheckIcon size={12} /></span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-white">{name}</span>
          {username && <span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>@{username}</span>}
          <span className="mt-2 block truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>{eventCount} published event{eventCount === 1 ? '' : 's'}</span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-transform group-hover:translate-x-0.5" style={{ borderColor: 'var(--border)', color: 'var(--primary-light)' }} aria-hidden="true"><ArrowRightIcon size={15} /></span>
      </span>
    </button>
  )
}
