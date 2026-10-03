type StatusBadgeProps = {
  label: string
  size?: 'sm' | 'md'
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'
  color?: string
}

type ToneStyle = { foreground: string; background: string; border: string }

const TONES: Record<NonNullable<StatusBadgeProps['tone']>, ToneStyle> = {
  success: { foreground: '#86efac', background: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.28)' },
  warning: { foreground: '#fcd34d', background: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.3)' },
  danger: { foreground: '#fca5a5', background: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.3)' },
  info: { foreground: '#93c5fd', background: 'rgba(96,165,250,.12)', border: 'rgba(96,165,250,.3)' },
  neutral: { foreground: '#cbd5e1', background: 'rgba(148,163,184,.1)', border: 'rgba(148,163,184,.22)' },
  accent: { foreground: 'var(--primary)', background: 'rgba(249,112,21,.12)', border: 'rgba(249,112,21,.28)' },
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
