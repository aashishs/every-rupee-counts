import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  })
);

router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const created = [];

    const upcoming = await query(
      `SELECT * FROM recurring_transactions
       WHERE user_id=$1 AND deleted_at IS NULL AND is_paused=FALSE AND reminder_enabled=TRUE
         AND next_due_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')`,
      [userId]
    );

    for (const item of upcoming.rows) {
      const exists = await query(
        `SELECT id FROM notifications
         WHERE user_id=$1 AND type='recurring_reminder'
           AND meta->>'recurring_id' = $2
           AND created_at > NOW() - INTERVAL '2 days'`,
        [userId, item.id]
      );
      if (!exists.rows[0]) {
        const n = await query(
          `INSERT INTO notifications (user_id, title, message, type, meta)
           VALUES ($1,$2,$3,'recurring_reminder',$4) RETURNING *`,
          [
            userId,
            'Upcoming payment',
            `${item.description || item.category} of ₹${Number(item.amount).toLocaleString('en-IN')} due on ${item.next_due_date}`,
            JSON.stringify({ recurring_id: item.id }),
          ]
        );
        created.push(n.rows[0]);
      }
    }

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    const start = monthStart.toISOString().slice(0, 10);
    const budgets = await query(
      `SELECT b.*, COALESCE(s.spent,0) AS spent
       FROM budgets b
       LEFT JOIN (
         SELECT category, SUM(amount) AS spent FROM transactions
         WHERE user_id=$1 AND type='expense' AND deleted_at IS NULL
           AND date >= $2 AND date < ($2::date + INTERVAL '1 month')
         GROUP BY category
       ) s ON s.category = b.category
       WHERE b.user_id=$1 AND b.month=$2`,
      [userId, start]
    );

    for (const b of budgets.rows) {
      const utilization = Number(b.amount) > 0 ? (Number(b.spent) / Number(b.amount)) * 100 : 0;
      if (utilization >= Number(b.alert_threshold)) {
        const n = await query(
          `INSERT INTO notifications (user_id, title, message, type, meta)
           VALUES ($1,$2,$3,'budget_warning',$4) RETURNING *`,
          [
            userId,
            'Budget alert',
            `${b.category} is at ${utilization.toFixed(0)}% of your ₹${Number(b.amount).toLocaleString('en-IN')} budget`,
            JSON.stringify({ budget_id: b.id, utilization }),
          ]
        );
        created.push(n.rows[0]);
      }
    }

    res.json({ notifications: created });
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ notification: result.rows[0] });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [
      req.user.id,
    ]);
    res.json({ success: true });
  })
);

export default router;
