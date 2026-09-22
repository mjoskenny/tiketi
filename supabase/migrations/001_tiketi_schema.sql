-- ============================================================
-- TIKETI — Full Database Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- PROFILES (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'organizer', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORGANIZERS
CREATE TABLE IF NOT EXISTS organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  website TEXT,
  phone TEXT,
  city TEXT DEFAULT 'Bujumbura',
  verified BOOLEAN DEFAULT FALSE,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'pro', 'enterprise')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORGANIZER ROLES
CREATE TABLE IF NOT EXISTS organizer_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORGANIZER MEMBERS (team)
CREATE TABLE IF NOT EXISTS organizer_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID REFERENCES organizer_roles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organizer_id, user_id)
);

-- SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  price INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EVENTS
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  venue TEXT NOT NULL,
  city TEXT DEFAULT 'Bujumbura',
  cover_image TEXT,
  capacity INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  is_featured BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  refund_policy TEXT DEFAULT 'Tickets are non-refundable',
  entry_policy TEXT DEFAULT 'Valid ID required at entry',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TICKET TIERS
CREATE TABLE IF NOT EXISTS ticket_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  total_spent INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'refunded')),
  subtotal INTEGER NOT NULL,
  service_fee INTEGER DEFAULT 0,
  total INTEGER NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('mobile_money', 'card', 'cash')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_tier_id UUID REFERENCES ticket_tiers(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL
);

-- TICKETS
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_tier_id UUID REFERENCES ticket_tiers(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  holder_name TEXT,
  holder_email TEXT,
  holder_phone TEXT,
  qr_code TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  status TEXT DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled')),
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('payment', 'refund', 'payout', 'fee')),
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'BIF',
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id);

-- Organizers: owner can manage, public can read published data
CREATE POLICY "organizers_owner" ON organizers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "organizers_public_read" ON organizers FOR SELECT USING (true);

-- Events: organizer can manage, public can see published
CREATE POLICY "events_organizer" ON events FOR ALL
  USING (organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid()));
CREATE POLICY "events_public_read" ON events FOR SELECT USING (status = 'published');

-- Ticket tiers: public read for published events
CREATE POLICY "ticket_tiers_organizer" ON ticket_tiers FOR ALL
  USING (event_id IN (SELECT id FROM events WHERE organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid())));
CREATE POLICY "ticket_tiers_public_read" ON ticket_tiers FOR SELECT USING (true);

-- Organizer roles & members: scoped to organizer owner
CREATE POLICY "roles_organizer" ON organizer_roles FOR ALL
  USING (organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid()));
CREATE POLICY "members_organizer" ON organizer_members FOR ALL
  USING (organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid()));

-- Subscriptions: organizer owner only
CREATE POLICY "subs_organizer" ON subscriptions FOR ALL
  USING (organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid()));

-- Orders & customers: organizer sees theirs, customer sees own
CREATE POLICY "orders_organizer" ON orders FOR ALL
  USING (organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid()));
CREATE POLICY "orders_customer" ON orders FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "orders_insert_customer" ON orders FOR INSERT WITH CHECK (customer_id = auth.uid());

CREATE POLICY "customers_organizer" ON customers FOR ALL
  USING (organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid()));

CREATE POLICY "order_items_organizer" ON order_items FOR ALL
  USING (order_id IN (SELECT id FROM orders WHERE organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid())));
CREATE POLICY "order_items_customer" ON order_items FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()));

-- Tickets
CREATE POLICY "tickets_organizer" ON tickets FOR ALL
  USING (event_id IN (SELECT id FROM events WHERE organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid())));
CREATE POLICY "tickets_customer" ON tickets FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()));

-- Transactions: organizer only
CREATE POLICY "transactions_organizer" ON transactions FOR ALL
  USING (organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid()));

-- ============================================================
-- SEED DEMO DATA (optional — remove in production)
-- ============================================================

-- Demo events will be inserted via the app after organizer signs up
