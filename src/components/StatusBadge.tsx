type StatusBadgeProps = {
  label: string
  size?: 'sm' | 'md'
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'
  color?: string
}

type ToneStyle = { foreground: string; background: string; border: string }

const TONES: Record<NonNullable<StatusBadgeProps['tone']>, ToneStyle> = {
  success: { foreground: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)', border: 'color-mix(in srgb, var(--success) 30%, transparent)' },
  warning: { foreground: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: 'color-mix(in srgb, var(--warning) 30%, transparent)' },
  danger: { foreground: 'var(--error)', background: 'color-mix(in srgb, var(--error) 12%, transparent)', border: 'color-mix(in srgb, var(--error) 30%, transparent)' },
  info: { foreground: 'var(--info)', background: 'color-mix(in srgb, var(--info) 12%, transparent)', border: 'color-mix(in srgb, var(--info) 30%, transparent)' },
  neutral: { foreground: 'var(--secondary-foreground)', background: 'var(--hover)', border: 'var(--border)' },
  accent: { foreground: 'var(--brand-orange)', background: 'var(--brand-orange-soft)', border: 'color-mix(in srgb, var(--brand-orange) 30%, transparent)' },
}

const STATUS_TONES: Record<string, NonNullable<StatusBadgeProps['tone']>> = {
  active: 'success', available: 'success', completed: 'success', completed_t: 'success', confirmed: 'success', paid: 'success', published: 'success', processed: 'success', used: 'success', valid: 'success', verified: 'success',
  pending: 'warning', pending_t: 'warning', requested: 'warning', processing: 'warning', awaiting_payment: 'warning', unverified: 'warning', draft: 'neutral', inactive: 'neutral', cancelled: 'danger', declined: 'danger', failed: 'danger', rejected: 'danger', refunded: 'danger', revoked: 'danger', expired: 'neutral',
  approved: 'info', approved_for_processing: 'info', bank: 'info', card: 'info', mobile_money: 'info', customer: 'neutral', organizer: 'accent', admin: 'danger', payment: 'accent', payout: 'info', refund: 'danger', fee: 'neutral', cash: 'success', digital: 'info',
}

function readableLabel(label: string) {
  return label.replace(/_/g, ' ')
}

export default function StatusBadge({ label, size = 'sm', tone }: StatusBadgeProps) {
  const normalizedLabel = label.toLowerCase().replace(/\s+/g, '_')
  const semanticTone = tone ?? STATUS_TONES[normalizedLabel] ?? (normalizedLabel.includes('pending') ? 'warning' : normalizedLabel.includes('verified') ? 'success' : 'neutral')
  const palette = TONES[semanticTone]
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border font-bold capitalize ${size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[10px] tracking-[.02em]'}`} style={{ color: palette.foreground, background: palette.background, borderColor: palette.border }}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: palette.foreground }} />
      {readableLabel(label)}
    </span>
  )
}
