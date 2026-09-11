import { query } from '../db/pool.js';
import {
  fingerprintTrade,
  inferAssetType,
  portfolioType,
} from './contractParsers.js';

async function findOrCreateInvestment(userId, trade) {
  const assetType = trade.asset_type || inferAssetType(trade.name, trade.isin);
  const type = portfolioType(assetType);

  let existing = null;
  if (trade.isin) {
    const byIsin = await query(
      `SELECT * FROM investments
       WHERE user_id = $1 AND deleted_at IS NULL AND isin = $2
       LIMIT 1`,
      [userId, trade.isin]
    );
    existing = byIsin.rows[0];
  }

  if (!existing && trade.symbol) {
    const bySymbol = await query(
      `SELECT * FROM investments
       WHERE user_id = $1 AND deleted_at IS NULL
         AND (symbol = $2 OR LOWER(name) = LOWER($2))
       LIMIT 1`,
      [userId, trade.symbol]
    );
    existing = bySymbol.rows[0];
  }

  if (!existing) {
    const byName = await query(
      `SELECT * FROM investments
       WHERE user_id = $1 AND deleted_at IS NULL AND LOWER(name) = LOWER($2)
       LIMIT 1`,
      [userId, trade.name]
    );
    existing = byName.rows[0];
  }

  if (existing) return existing;

  const created = await query(
    `INSERT INTO investments
      (user_id, name, type, invested_amount, current_value, purchase_date, notes,
       symbol, isin, units, avg_price, broker, source, synced_at)
     VALUES ($1,$2,$3,0,0,$4,$5,$6,$7,0,0,$8,'email',NOW())
     RETURNING *`,
    [
      userId,
      trade.name,
      type,
      trade.trade_date || null,
      trade.notes || 'Created from email import',
      trade.symbol || null,
      trade.isin || null,
      trade.broker || null,
    ]
  );
  return created.rows[0];
}

function applyTradeToHolding(investment, trade) {
  let units = Number(investment.units || 0);
  let invested = Number(investment.invested_amount || 0);
  let avgPrice = Number(investment.avg_price || 0);
  const qty = Number(trade.quantity || 0);
  const amount = Number(trade.amount || 0);
  const charges = Number(trade.charges || 0);
  const side = trade.side;

  if (side === 'buy' || side === 'sip' || side === 'switch_in') {
    const cost = amount + charges;
    if (qty > 0) {
      const newUnits = units + qty;
      avgPrice = newUnits > 0 ? (invested + cost) / newUnits : avgPrice;
      units = newUnits;
      invested += cost;
    } else if (cost > 0) {
      // Amount-only SIP without units/NAV yet
      invested += cost;
    }
  } else if (side === 'sell' || side === 'switch_out') {
    if (qty > 0 && units > 0) {
      const sellRatio = Math.min(qty, units) / units;
      invested = Math.max(0, invested * (1 - sellRatio));
      units = Math.max(0, units - qty);
      if (units === 0) avgPrice = 0;
    } else if (amount > 0 && invested > 0) {
      invested = Math.max(0, invested - amount);
    }
  } else if (side === 'dividend') {
    // Cash dividend does not change units; leave holding as-is
  }

  const currentValue =
    units > 0 && Number(trade.price) > 0
      ? units * Number(trade.price)
      : units > 0 && avgPrice > 0
        ? units * avgPrice
        : invested;

  return {
    units,
    invested_amount: Number(invested.toFixed(2)),
    avg_price: Number(avgPrice.toFixed(4)),
    current_value: Number(currentValue.toFixed(2)),
  };
}

export async function importTrades(userId, trades, { importJobId = null } = {}) {
  let imported = 0;
  let skipped = 0;
  const saved = [];

  for (const trade of trades) {
    if (!trade?.name || !trade?.trade_date) {
      skipped += 1;
      continue;
    }
    if (!Number(trade.amount) && !Number(trade.quantity)) {
      skipped += 1;
      continue;
    }

    const fp = fingerprintTrade(userId, trade);
    const exists = await query(
      `SELECT id FROM investment_transactions WHERE fingerprint = $1`,
      [fp]
    );
    if (exists.rows[0]) {
      skipped += 1;
      continue;
    }

    const investment = await findOrCreateInvestment(userId, trade);
    const next = applyTradeToHolding(investment, trade);

    await query(
      `UPDATE investments
       SET units = $1,
           invested_amount = $2,
           avg_price = $3,
           current_value = $4,
           symbol = COALESCE(symbol, $5),
           isin = COALESCE(isin, $6),
           broker = COALESCE(broker, $7),
           source = CASE WHEN source = 'manual' THEN 'email' ELSE source END,
           purchase_date = COALESCE(purchase_date, $8),
           updated_at = NOW(),
           synced_at = NOW()
       WHERE id = $9`,
      [
        next.units,
        next.invested_amount,
        next.avg_price,
        next.current_value,
        trade.symbol || null,
        trade.isin || null,
        trade.broker || null,
        trade.trade_date,
        investment.id,
      ]
    );

    await query(
      `INSERT INTO investment_history (investment_id, value) VALUES ($1, $2)`,
      [investment.id, next.current_value]
    );

    const row = await query(
      `INSERT INTO investment_transactions
        (user_id, investment_id, import_job_id, trade_date, side, asset_type, name, symbol, isin,
         quantity, price, amount, charges, broker, exchange, notes, fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        userId,
        investment.id,
        importJobId,
        trade.trade_date,
        trade.side,
        trade.asset_type || inferAssetType(trade.name, trade.isin),
        trade.name,
        trade.symbol || null,
        trade.isin || null,
        trade.quantity || 0,
        trade.price || 0,
        trade.amount || 0,
        trade.charges || 0,
        trade.broker || null,
        trade.exchange || null,
        trade.notes || null,
        fp,
      ]
    );

    imported += 1;
    saved.push(row.rows[0]);
  }

  return { imported, skipped, transactions: saved };
}

export function sampleContractNoteText() {
  return `
ZERODHA BROKING LIMITED
Digitally Signed Contract Note
Trade Date: 05/09/2026
Contract Note No: CN-2026-0905-001

BUY RELIANCE 15 2950.25 44253.75 NSE INE002A01018
SELL INFY 10 1850.00 18500.00 NSE INE009A01021
BUY TCS 5 4120.50 20602.50 NSE INE467B01029

Charges: Brokerage and statutory levies as applicable.
`;
}

export function sampleMutualFundCasText() {
  return `
CAMS Consolidated Account Statement (CAS)
Statement Period: 01/04/2026 to 05/09/2026

Folio No: 1234567890
Scheme: Parag Parikh Flexi Cap Fund - Direct Growth
ISIN: INF879O01027
05/08/2026 SIP 5000.00 82.4500 60.643
12/08/2026 Purchase 10000.00 83.1000 120.337

Folio No: 9876543210
Scheme: UTI Nifty 50 Index Fund - Direct Growth
ISIN: INF789F01XA0
01/09/2026 SIP 2500.00 145.2200 17.215
`;
}
