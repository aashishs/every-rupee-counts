import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

const FIELDS = [
  'name',
  'loan_type',
  'lender',
  'account_no',
  'principal',
  'outstanding',
  'interest_rate',
  'emi_amount',
  'tenure_months',
  'start_date',
  'end_date',
  'next_due_date',
  'status',
  'notes',
  'client_id',
];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT * FROM loans
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY
         CASE WHEN status = 'active' THEN 0 ELSE 1 END,
         next_due_date ASC NULLS LAST,
         updated_at DESC`,
      [req.user.id]
    );
    res.json({ loans: result.rows });
  })
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const totals = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
         COUNT(*)::int AS total_count,
         COALESCE(SUM(principal),0) AS principal,
         COALESCE(SUM(CASE WHEN status = 'active' THEN outstanding ELSE 0 END),0) AS outstanding,
         COALESCE(SUM(CASE WHEN status = 'active' THEN emi_amount ELSE 0 END),0) AS monthly_emi
       FROM loans
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    const byType = await query(
      `SELECT loan_type,
              COUNT(*)::int AS count,
              COALESCE(SUM(CASE WHEN status = 'active' THEN outstanding ELSE 0 END),0) AS outstanding
       FROM loans
       WHERE user_id = $1 AND deleted_at IS NULL
       GROUP BY loan_type
       ORDER BY outstanding DESC`,
      [req.user.id]
    );
    const upcoming = await query(
      `SELECT id, name, loan_type, emi_amount, next_due_date, outstanding, lender
       FROM loans
       WHERE user_id = $1 AND deleted_at IS NULL AND status = 'active'
         AND next_due_date IS NOT NULL
         AND next_due_date <= (CURRENT_DATE + INTERVAL '30 days')
       ORDER BY next_due_date ASC
       LIMIT 8`,
      [req.user.id]
    );

    res.json({
      totals: {
        activeCount: totals.rows[0].active_count,
        totalCount: totals.rows[0].total_count,
        principal: Number(totals.rows[0].principal),
        outstanding: Number(totals.rows[0].outstanding),
        monthlyEmi: Number(totals.rows[0].monthly_emi),
      },
      byType: byType.rows.map((r) => ({
        loan_type: r.loan_type,
        count: r.count,
        outstanding: Number(r.outstanding),
      })),
      upcomingEmis: upcoming.rows,
    });
  })
);

router.post(
  '/',
  [
    body('name').trim().notEmpty(),
    body('loan_type').trim().notEmpty(),
    body('principal').isFloat({ min: 0 }),
    body('outstanding').optional().isFloat({ min: 0 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      name,
      loan_type,
      lender,
      account_no,
      principal,
      outstanding,
      interest_rate,
      emi_amount,
      tenure_months,
      start_date,
      end_date,
      next_due_date,
      status,
      notes,
      client_id,
    } = req.body;

    const result = await query(
      `INSERT INTO loans
        (user_id, name, loan_type, lender, account_no, principal, outstanding,
         interest_rate, emi_amount, tenure_months, start_date, end_date, next_due_date,
         status, notes, client_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
       RETURNING *`,
      [
        req.user.id,
        name,
        loan_type,
        lender || null,
        account_no || null,
        principal,
        outstanding ?? principal,
        interest_rate ?? null,
        emi_amount ?? 0,
        tenure_months ?? null,
        start_date || null,
        end_date || null,
        next_due_date || null,
        status || 'active',
        notes || null,
        client_id || null,
      ]
    );
    res.status(201).json({ loan: result.rows[0] });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const sets = [];
    const params = [];
    for (const field of FIELDS) {
      if (req.body[field] !== undefined) {
        params.push(req.body[field] === '' ? null : req.body[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()', 'synced_at = NOW()');
    params.push(req.params.id, req.user.id);

    const result = await query(
      `UPDATE loans SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND user_id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Loan not found' });
    res.json({ loan: result.rows[0] });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE loans SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Loan not found' });
    res.json({ success: true });
  })
);

export default router;
