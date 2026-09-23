export type Profile = {
  id: string
  email: string
  full_name: string | null
  profile_image: string | null
  avatar_url: string | null
  phone: string | null
  username?: string | null
  cover_image?: string | null
  preferences?: Record<string, boolean> | null
  role: 'customer' | 'organizer' | 'admin'
  created_at: string
}

export type Organizer = {
  id: string
  user_id: string
  name: string
  description: string | null
  logo_url: string | null
  website: string | null
  phone: string | null
  city: string
  verified: boolean
  verification_status?: 'unverified' | 'pending' | 'verified'
  verification_requested_at?: string | null
  verification_reviewed_at?: string | null
  verification_reviewed_by?: string | null
  verification_note?: string | null
  subscription_tier: 'free' | 'starter' | 'pro' | 'enterprise'
  created_at: string
  profiles?: Partial<Profile> | null
}

export type OrganizerRole = {
  id: string
  organizer_id: string
  name: string
  permissions: Record<string, boolean>
  created_at: string
}

export type OrganizerMember = {
  id: string
  organizer_id: string
  user_id: string
  role_id: string | null
  status: 'active' | 'inactive' | 'pending'
  created_at: string
  profiles?: Profile
  organizer_roles?: OrganizerRole
}

export type TeamMembership = OrganizerMember & {
  organizer?: Organizer
}

export type AgentInvitation = {
  id: string
  organizer_id: string
  user_id: string
  invited_by: string
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
  message: string | null
  expires_at: string
  created_at: string
  accepted_at: string | null
  declined_at: string | null
  cancelled_at: string | null
  organizers?: Organizer | null
}

export type AgentAssignment = {
  id: string
  organizer_id: string
  user_id: string
  organizer_member_id: string
  event_id: string
  ticket_tier_ids: string[]
  allow_all_ticket_types: boolean
  commission_rate: number
  ticket_limit: number | null
  sales_limit: number | null
  starts_at: string
  ends_at: string | null
  status: 'pending' | 'active' | 'paused' | 'expired' | 'revoked'
  created_at: string
  updated_at: string
  events?: Event
  organizers?: Organizer
}

export type Subscription = {
  id: string
  organizer_id: string
  tier: 'free' | 'starter' | 'pro' | 'enterprise'
  status: 'active' | 'cancelled' | 'expired'
  price: number
  started_at: string
  expires_at: string | null
  created_at: string
}

export type Event = {
  id: string
  organizer_id: string
  title: string
  description: string | null
  category: string
  date: string
  time: string
  end_time?: string | null
  venue: string
  venue_latitude?: number | null
  venue_longitude?: number | null
  city: string
  cover_image: string | null
  capacity: number
  status: 'draft' | 'published' | 'cancelled' | 'completed'
  is_featured: boolean
  tags: string[] | null
  refund_policy?: string | null
  entry_policy?: string | null
  created_at: string
  updated_at: string
  ticket_tiers?: TicketTier[]
  organizers?: Organizer
}

export type TicketTier = {
  id: string
  event_id: string
  name: string
  price: number
  description: string | null
  ticket_type?: 'consumable' | 'non_consumable'
  extra_info?: string | null
  expires_at?: string | null
  group_size?: number
  quantity: number
  sold: number
  created_at: string
}

export type Customer = {
  id: string
  user_id: string | null
  organizer_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  total_spent: number
  total_orders: number
  created_at: string
}

export type Order = {
  id: string
  customer_id: string
  event_id: string
  organizer_id: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'refunded'
  subtotal: number
  service_fee: number
  total: number
  payment_method: 'mobile_money' | 'card' | 'cash' | null
  created_at: string
  events?: Event
  profiles?: Profile
  order_items?: OrderItem[]
}

export type OrderItem = {
  id: string
  order_id: string
  ticket_tier_id: string
  quantity: number
  unit_price: number
  total_price: number
  ticket_tiers?: TicketTier
}

export type Ticket = {
  id: string
  order_id: string
  ticket_tier_id: string
  event_id: string
  holder_name: string | null
  holder_email: string | null
  holder_phone: string | null
  qr_code: string
  status: 'valid' | 'used' | 'cancelled'
  checked_in_at: string | null
  created_at: string
  events?: Event
  ticket_tiers?: TicketTier
}

export type Transaction = {
  id: string
  order_id: string | null
  organizer_withdrawal_id?: string | null
  organizer_id: string
  type: 'payment' | 'refund' | 'payout' | 'fee'
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed'
  reference: string | null
  created_at: string
  orders?: Order
}

export type OrganizerWithdrawal = {
  id: string
  organizer_id: string
  requested_by: string
  amount: number
  payment_method: 'mobile_money' | 'bank'
  payment_reference: string
  status: 'requested' | 'processing' | 'paid' | 'rejected' | 'cancelled'
  note: string | null
  requested_at: string
  processed_at: string | null
  processed_by: string | null
}
