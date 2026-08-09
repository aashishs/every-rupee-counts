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
      `SELECT * FROM assets WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json({ assets: result.rows });
  })
);

router.post(
  '/',
  [
    body('name').trim().notEmpty(),
    body('category').trim().notEmpty(),
    body('purchase_value').isFloat({ min: 0 }),
    body('current_value').optional().isFloat({ min: 0 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { name, category, purchase_date, purchase_value, current_value, notes, client_id } = req.body;
    const result = await query(
      `INSERT INTO assets
        (user_id, name, category, purchase_date, purchase_value, current_value, notes, client_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       RETURNING *`,
      [
        req.user.id, name, category, purchase_date || null, purchase_value,
        current_value ?? purchase_value, notes || null, client_id || null,
      ]
    );
    res.status(201).json({ asset: result.rows[0] });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const fields = ['name', 'category', 'purchase_date', 'purchase_value', 'current_value', 'notes'];
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
      `UPDATE assets SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND user_id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Asset not found' });
    res.json({ asset: result.rows[0] });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE assets SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true });
  })
);

export default router;
