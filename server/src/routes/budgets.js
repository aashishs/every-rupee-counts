import { Router } from 'express';
import { body, query as q } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  [q('month').optional().isISO8601()],
  validate,
  asyncHandler(async (req, res) => {
    const month = req.query.month
      ? new Date(req.query.month)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));

    const budgets = await query(
      `SELECT * FROM budgets WHERE user_id = $1 AND month = $2 ORDER BY category`,
      [req.user.id, monthStart.toISOString().slice(0, 10)]
    );

    const spent = await query(
      `SELECT category, COALESCE(SUM(amount), 0) AS spent
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND deleted_at IS NULL
         AND date >= $2 AND date < ($2::date + INTERVAL '1 month')
       GROUP BY category`,
      [req.user.id, monthStart.toISOString().slice(0, 10)]
    );

    const spentMap = Object.fromEntries(spent.rows.map((r) => [r.category, Number(r.spent)]));
    const enriched = budgets.rows.map((b) => ({
      ...b,
      spent: spentMap[b.category] || 0,
      remaining: Number(b.amount) - (spentMap[b.category] || 0),
      utilization: Number(b.amount) > 0
        ? ((spentMap[b.category] || 0) / Number(b.amount)) * 100
        : 0,
    }));

    res.json({ budgets: enriched, month: monthStart.toISOString().slice(0, 10) });
  })
);

router.post(
  '/',
  [
    body('category').trim().notEmpty(),
    body('amount').isFloat({ min: 0 }),
    body('month').isISO8601(),
    body('alert_threshold').optional().isFloat({ min: 1, max: 100 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { category, amount, month, alert_threshold, client_id } = req.body;
    const monthDate = new Date(month);
    const monthStart = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);

    const result = await query(
      `INSERT INTO budgets (user_id, category, amount, month, alert_threshold, client_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (user_id, category, month)
       DO UPDATE SET amount = EXCLUDED.amount,
                     alert_threshold = EXCLUDED.alert_threshold,
                     updated_at = NOW(),
                     synced_at = NOW()
       RETURNING *`,
      [req.user.id, category, amount, monthStart, alert_threshold ?? 80, client_id || null]
    );
    res.status(201).json({ budget: result.rows[0] });
  })
);

router.post(
  '/recommend',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT category,
              AVG(monthly_total) AS avg_spend,
              MAX(monthly_total) AS max_spend
       FROM (
         SELECT category,
                date_trunc('month', date) AS month,
                SUM(amount) AS monthly_total
         FROM transactions
         WHERE user_id = $1 AND type = 'expense' AND deleted_at IS NULL
           AND date >= (CURRENT_DATE - INTERVAL '6 months')
         GROUP BY category, date_trunc('month', date)
       ) t
       GROUP BY category
       ORDER BY avg_spend DESC`,
      [req.user.id]
    );

    const recommendations = result.rows.map((row) => {
      const avg = Number(row.avg_spend);
      const max = Number(row.max_spend);
      // Slight buffer for seasonal spikes
      const recommended = Math.ceil((avg * 0.7 + max * 0.3) / 100) * 100;
      return {
        category: row.category,
        average_spend: avg,
        recommended_budget: recommended,
      };
    });

    res.json({ recommendations });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await query(
      `DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Budget not found' });
    res.json({ success: true });
  })
);

export default router;
