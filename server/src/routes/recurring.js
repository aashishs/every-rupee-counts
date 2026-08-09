import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

function addFrequency(dateStr, frequency) {
  const d = new Date(dateStr);
  switch (frequency) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case 'quarterly':
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    default:
      break;
  }
  return d.toISOString().slice(0, 10);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT * FROM recurring_transactions
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY next_due_date ASC`,
      [req.user.id]
    );
    res.json({ recurring: result.rows });
  })
);

router.post(
  '/',
  [
    body('type').isIn(['expense', 'income']),
    body('amount').isFloat({ min: 0 }),
    body('category').trim().notEmpty(),
    body('frequency').isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
    body('start_date').isISO8601(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      type, amount, category, description, frequency, start_date, end_date,
      auto_enter, reminder_enabled, notes, client_id,
    } = req.body;

    const result = await query(
      `INSERT INTO recurring_transactions
        (user_id, type, amount, category, description, frequency, start_date, next_due_date,
         end_date, auto_enter, reminder_enabled, notes, client_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,NOW())
       RETURNING *`,
      [
        req.user.id, type, amount, category, description || null, frequency, start_date,
        end_date || null, auto_enter ?? false, reminder_enabled ?? true, notes || null, client_id || null,
      ]
    );
    res.status(201).json({ recurring: result.rows[0] });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const fields = [
      'type', 'amount', 'category', 'description', 'frequency', 'start_date',
      'next_due_date', 'end_date', 'auto_enter', 'reminder_enabled', 'is_paused', 'notes',
    ];
    const sets = [];
    const params = [];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        params.push(req.body[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()', 'synced_at = NOW()');
    params.push(req.params.id, req.user.id);

    const result = await query(
      `UPDATE recurring_transactions SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND user_id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Recurring transaction not found' });
    res.json({ recurring: result.rows[0] });
  })
);

router.post(
  '/:id/skip',
  asyncHandler(async (req, res) => {
    const current = await query(
      `SELECT * FROM recurring_transactions
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user.id]
    );
    if (!current.rows[0]) return res.status(404).json({ error: 'Not found' });

    const next = addFrequency(current.rows[0].next_due_date, current.rows[0].frequency);
    const result = await query(
      `UPDATE recurring_transactions
       SET next_due_date = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [next, req.params.id]
    );
    res.json({ recurring: result.rows[0] });
  })
);

router.post(
  '/:id/enter',
  asyncHandler(async (req, res) => {
    const current = await query(
      `SELECT * FROM recurring_transactions
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user.id]
    );
    const item = current.rows[0];
    if (!item) return res.status(404).json({ error: 'Not found' });

    const tx = await query(
      `INSERT INTO transactions
        (user_id, type, amount, category, description, date, is_recurring, recurring_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,NOW())
       RETURNING *`,
      [req.user.id, item.type, item.amount, item.category, item.description, item.next_due_date, item.id]
    );

    const next = addFrequency(item.next_due_date, item.frequency);
    await query(
      `UPDATE recurring_transactions SET next_due_date = $1, updated_at = NOW() WHERE id = $2`,
      [next, item.id]
    );

    res.status(201).json({ transaction: tx.rows[0], next_due_date: next });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE recurring_transactions SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  })
);

export default router;
