import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT * FROM investments
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json({ investments: result.rows });
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
      name, type, invested_amount, current_value, purchase_date, notes, client_id,
    } = req.body;
    const current = current_value ?? invested_amount;

    const result = await query(
      `INSERT INTO investments
        (user_id, name, type, invested_amount, current_value, purchase_date, notes, client_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       RETURNING *`,
      [req.user.id, name, type, invested_amount, current, purchase_date || null, notes || null, client_id || null]
    );

    await query(
      `INSERT INTO investment_history (investment_id, value) VALUES ($1, $2)`,
      [result.rows[0].id, current]
    );

    res.status(201).json({ investment: result.rows[0] });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const fields = ['name', 'type', 'invested_amount', 'current_value', 'purchase_date', 'notes'];
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
