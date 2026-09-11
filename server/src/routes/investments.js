import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

const WRITABLE = [
  'name',
  'type',
  'invested_amount',
  'current_value',
  'purchase_date',
  'notes',
  'symbol',
  'isin',
  'units',
  'avg_price',
  'broker',
  'source',
  'institution',
  'reference_no',
  'maturity_date',
  'interest_rate',
  'meta',
  'client_id',
];

function normalizeMeta(meta) {
  if (meta == null) return {};
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta);
    } catch {
      return {};
    }
  }
  return typeof meta === 'object' ? meta : {};
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { type } = req.query;
    const params = [req.user.id];
    let sql = `SELECT * FROM investments
       WHERE user_id = $1 AND deleted_at IS NULL`;
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }
    sql += ' ORDER BY type ASC, updated_at DESC';
    const result = await query(sql, params);
    res.json({ investments: result.rows });
  })
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const byType = await query(
      `SELECT type,
              COUNT(*)::int AS count,
              COALESCE(SUM(invested_amount),0) AS invested,
              COALESCE(SUM(current_value),0) AS current
       FROM investments
       WHERE user_id = $1 AND deleted_at IS NULL
       GROUP BY type
       ORDER BY current DESC`,
      [req.user.id]
    );
    const totals = await query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(invested_amount),0) AS invested,
              COALESCE(SUM(current_value),0) AS current
       FROM investments WHERE user_id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    const maturing = await query(
      `SELECT id, name, type, maturity_date, current_value, institution, reference_no
       FROM investments
       WHERE user_id = $1 AND deleted_at IS NULL
         AND maturity_date IS NOT NULL
         AND maturity_date <= (CURRENT_DATE + INTERVAL '90 days')
       ORDER BY maturity_date ASC
       LIMIT 10`,
      [req.user.id]
    );

    res.json({
      totals: {
        count: totals.rows[0].count,
        invested: Number(totals.rows[0].invested),
        current: Number(totals.rows[0].current),
        gain: Number(totals.rows[0].current) - Number(totals.rows[0].invested),
      },
      byType: byType.rows.map((r) => ({
        type: r.type,
        count: r.count,
        invested: Number(r.invested),
        current: Number(r.current),
        gain: Number(r.current) - Number(r.invested),
      })),
      maturingSoon: maturing.rows,
    });
  })
);

router.post(
  '/',
  [
    body('name').trim().notEmpty(),
    body('type').trim().notEmpty(),
    body('invested_amount').isFloat({ min: 0 }),
    body('current_value').optional().isFloat({ min: 0 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      name,
      type,
      invested_amount,
      current_value,
      purchase_date,
      notes,
      client_id,
      symbol,
      isin,
      units,
      avg_price,
      broker,
      source,
      institution,
      reference_no,
      maturity_date,
      interest_rate,
      meta,
    } = req.body;
    const current = current_value ?? invested_amount;

    const result = await query(
      `INSERT INTO investments
        (user_id, name, type, invested_amount, current_value, purchase_date, notes,
         symbol, isin, units, avg_price, broker, source, institution, reference_no,
         maturity_date, interest_rate, meta, client_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,NOW())
       RETURNING *`,
      [
        req.user.id,
        name,
        type,
        invested_amount,
        current,
        purchase_date || null,
        notes || null,
        symbol || null,
        isin || null,
        units ?? 0,
        avg_price ?? 0,
        broker || null,
        source || 'manual',
        institution || null,
        reference_no || null,
        maturity_date || null,
        interest_rate ?? null,
        JSON.stringify(normalizeMeta(meta)),
        client_id || null,
      ]
    );

    await query(
      `INSERT INTO investment_history (investment_id, value) VALUES ($1, $2)`,
      [result.rows[0].id, current]
    );

    res.status(201).json({ investment: result.rows[0] });
  })
);

router.post(
  '/demo-multi-asset',
  asyncHandler(async (req, res) => {
    const samples = [
      {
        name: 'SBI Tax Saver FD',
        type: 'Fixed Deposits',
        invested_amount: 150000,
        current_value: 162500,
        purchase_date: '2024-04-01',
        maturity_date: '2029-04-01',
        interest_rate: 7.1,
        institution: 'SBI',
        reference_no: 'FD-778812',
        meta: { compounding: 'quarterly', payout: 'cumulative' },
      },
      {
        name: 'HDFC Recurring Deposit',
        type: 'Recurring Deposits',
        invested_amount: 60000,
        current_value: 63500,
        purchase_date: '2025-01-05',
        maturity_date: '2027-01-05',
        interest_rate: 6.5,
        institution: 'HDFC Bank',
        reference_no: 'RD-99102',
        meta: { monthly_installment: 5000, tenure_months: 24 },
      },
      {
        name: 'EPF – Current Employer',
        type: 'EPF',
        invested_amount: 420000,
        current_value: 485000,
        purchase_date: '2018-06-01',
        interest_rate: 8.25,
        institution: 'EPFO',
        reference_no: 'UAN-100234567890',
        meta: { uan: '100234567890', employer: 'Acme Pvt Ltd' },
      },
      {
        name: 'PPF – SBI',
        type: 'PPF',
        invested_amount: 210000,
        current_value: 268000,
        purchase_date: '2019-04-10',
        maturity_date: '2034-04-10',
        interest_rate: 7.1,
        institution: 'SBI',
        reference_no: 'PPF-334455',
        meta: {},
      },
      {
        name: 'LIC Jeevan Anand',
        type: 'Insurance Policies',
        invested_amount: 180000,
        current_value: 195000,
        purchase_date: '2020-08-15',
        maturity_date: '2040-08-15',
        institution: 'LIC',
        reference_no: 'POL-1122334455',
        meta: {
          policy_type: 'Endowment',
          sum_assured: 1000000,
          premium: 18000,
          premium_frequency: 'yearly',
          insured_name: 'Self',
          term_years: 20,
          premium_term_years: 15,
        },
      },
      {
        name: 'HDFC Click 2 Wealth ULIP',
        type: 'ULIP',
        invested_amount: 120000,
        current_value: 138500,
        purchase_date: '2022-03-01',
        institution: 'HDFC Life',
        reference_no: 'ULIP-556677',
        meta: {
          policy_type: 'ULIP',
          sum_assured: 600000,
          premium: 20000,
          premium_frequency: 'yearly',
          insured_name: 'Self',
        },
      },
      {
        name: 'Apartment – Whitefield',
        type: 'Real Estate',
        invested_amount: 4500000,
        current_value: 6200000,
        purchase_date: '2017-11-20',
        institution: 'Self',
        reference_no: 'PROP-WF-12',
        meta: {
          address: 'Whitefield, Bengaluru',
          area_sqft: 1250,
          rental_income_monthly: 28000,
          ownership: 'self',
        },
      },
      {
        name: 'Physical Gold (coins)',
        type: 'Gold',
        invested_amount: 185000,
        current_value: 242000,
        purchase_date: '2021-10-12',
        institution: 'MMTC',
        meta: { quantity_grams: 50, purity: '24K' },
      },
      {
        name: 'eNPS Tier I',
        type: 'NPS',
        invested_amount: 275000,
        current_value: 312000,
        purchase_date: '2016-05-01',
        institution: 'NSDL eNPS',
        reference_no: 'PRAN-123456789012',
        meta: { pran: '123456789012', tier: 'I' },
      },
      {
        name: 'RBI Floating Rate Bond 2026',
        type: 'Bonds',
        invested_amount: 100000,
        current_value: 104200,
        purchase_date: '2023-07-01',
        maturity_date: '2026-07-01',
        interest_rate: 8.05,
        institution: 'RBI',
        reference_no: 'BOND-FRB-2026',
        meta: { coupon_frequency: 'half-yearly' },
      },
    ];

    const created = [];
    for (const s of samples) {
      const exists = await query(
        `SELECT id FROM investments
         WHERE user_id = $1 AND deleted_at IS NULL AND name = $2 AND type = $3
         LIMIT 1`,
        [req.user.id, s.name, s.type]
      );
      if (exists.rows[0]) continue;

      const result = await query(
        `INSERT INTO investments
          (user_id, name, type, invested_amount, current_value, purchase_date, notes,
           institution, reference_no, maturity_date, interest_rate, meta, source, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'demo',NOW())
         RETURNING *`,
        [
          req.user.id,
          s.name,
          s.type,
          s.invested_amount,
          s.current_value,
          s.purchase_date,
          'Demo multi-asset holding',
          s.institution || null,
          s.reference_no || null,
          s.maturity_date || null,
          s.interest_rate ?? null,
          JSON.stringify(s.meta || {}),
        ]
      );
      await query(
        `INSERT INTO investment_history (investment_id, value) VALUES ($1, $2)`,
        [result.rows[0].id, s.current_value]
      );
      created.push(result.rows[0]);
    }

    res.status(201).json({ created: created.length, investments: created });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const sets = [];
    const params = [];
    for (const field of WRITABLE) {
      if (req.body[field] !== undefined) {
        if (field === 'meta') {
          params.push(JSON.stringify(normalizeMeta(req.body.meta)));
          sets.push(`meta = $${params.length}::jsonb`);
        } else {
          params.push(req.body[field] === '' ? null : req.body[field]);
          sets.push(`${field} = $${params.length}`);
        }
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()', 'synced_at = NOW()');
    params.push(req.params.id, req.user.id);

    const result = await query(
      `UPDATE investments SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND user_id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Investment not found' });

    if (req.body.current_value !== undefined) {
      await query(
        `INSERT INTO investment_history (investment_id, value) VALUES ($1, $2)`,
        [result.rows[0].id, req.body.current_value]
      );
    }

    res.json({ investment: result.rows[0] });
  })
);

router.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const owned = await query(
      `SELECT id FROM investments WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user.id]
    );
    if (!owned.rows[0]) return res.status(404).json({ error: 'Investment not found' });

    const history = await query(
      `SELECT * FROM investment_history WHERE investment_id = $1 ORDER BY recorded_at ASC`,
      [req.params.id]
    );
    res.json({ history: history.rows });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE investments SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Investment not found' });
    res.json({ success: true });
  })
);

export default router;
