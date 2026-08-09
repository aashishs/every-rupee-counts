import { pool } from './pool.js';

const schema = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  theme VARCHAR(20) DEFAULT 'system',
  role VARCHAR(50) DEFAULT 'user',
  encryption_salt VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('expense', 'income', 'investment', 'asset')),
  icon VARCHAR(50),
  color VARCHAR(20),
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('expense', 'income')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  description TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_id UUID,
  receipt_url TEXT,
  client_id UUID,
  synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  invested_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  current_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  purchase_date DATE,
  notes TEXT,
  client_id UUID,
  synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS investment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  value NUMERIC(14, 2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  purchase_date DATE,
  purchase_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  current_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  client_id UUID,
  synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  month DATE NOT NULL,
  alert_threshold NUMERIC(5, 2) DEFAULT 80,
  client_id UUID,
  synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, month)
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('expense', 'income')),
  amount NUMERIC(14, 2) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  start_date DATE NOT NULL,
  next_due_date DATE NOT NULL,
  end_date DATE,
  auto_enter BOOLEAN DEFAULT FALSE,
  reminder_enabled BOOLEAN DEFAULT TRUE,
  is_paused BOOLEAN DEFAULT FALSE,
  notes TEXT,
  client_id UUID,
  synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_payload TEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  checksum VARCHAR(128),
  device_id VARCHAR(255),
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
CREATE INDEX IF NOT EXISTS idx_recurring_user_due ON recurring_transactions(user_id, next_due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_blobs_user ON sync_blobs(user_id, version DESC);
`;

const defaultCategories = [
  ['Food', 'expense', 'utensils', '#e07a3d'],
  ['Grocery', 'expense', 'shopping-basket', '#4caf50'],
  ['Rent', 'expense', 'home', '#5c6bc0'],
  ['Utilities', 'expense', 'zap', '#26a69a'],
  ['Fuel', 'expense', 'fuel', '#ef5350'],
  ['Shopping', 'expense', 'shopping-bag', '#ab47bc'],
  ['Medical', 'expense', 'heart-pulse', '#ec407a'],
  ['Education', 'expense', 'book', '#42a5f5'],
  ['Entertainment', 'expense', 'popcorn', '#ff7043'],
  ['Insurance', 'expense', 'shield', '#78909c'],
  ['Travel', 'expense', 'plane', '#29b6f6'],
  ['EMI', 'expense', 'credit-card', '#8d6e63'],
  ['Miscellaneous', 'expense', 'more-horizontal', '#90a4ae'],
  ['Salary', 'income', 'banknote', '#2e7d32'],
  ['Freelancing', 'income', 'laptop', '#00897b'],
  ['Business', 'income', 'briefcase', '#1565c0'],
  ['Rental Income', 'income', 'building', '#6a1b9a'],
  ['Investments', 'income', 'trending-up', '#ef6c00'],
  ['Interest', 'income', 'percent', '#546e7a'],
  ['Other Income', 'income', 'plus-circle', '#455a64'],
];

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);

    for (const [name, type, icon, color] of defaultCategories) {
      await client.query(
        `INSERT INTO categories (user_id, name, type, icon, color, is_system)
         SELECT NULL, $1, $2, $3, $4, TRUE
         WHERE NOT EXISTS (
           SELECT 1 FROM categories WHERE name = $1 AND type = $2 AND is_system = TRUE
         )`,
        [name, type, icon, color]
      );
    }

    await client.query('COMMIT');
    console.log('Database migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('migrate')) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
