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
  [
    q('type').optional().isIn(['expense', 'income']),
    q('category').optional().isString(),
    q('search').optional().isString(),
    q('from').optional().isISO8601(),
    q('to').optional().isISO8601(),
    q('limit').optional().isInt({ min: 1, max: 500 }),
    q('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { type, category, search, from, to } = req.query;
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const params = [req.user.id];
    const clauses = ['user_id = $1', 'deleted_at IS NULL'];

    if (type) {
      params.push(type);
      clauses.push(`type = $${params.length}`);
    }
    if (category) {
      params.push(category);
      clauses.push(`category = $${params.length}`);
    }
    if (from) {
      params.push(from);
      clauses.push(`date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      clauses.push(`date <= $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(description ILIKE $${params.length} OR notes ILIKE $${params.length} OR category ILIKE $${params.length})`);
    }

    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM transactions
       WHERE ${clauses.join(' AND ')}
       ORDER BY date DESC, created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ transactions: result.rows });
  })
);

router.post(
  '/',
  [
    body('type').isIn(['expense', 'income']),
    body('amount').isFloat({ min: 0 }),
    body('category').trim().notEmpty(),
    body('date').optional().isISO8601(),
    body('description').optional().isString(),
    body('notes').optional().isString(),
    body('tags').optional().isArray(),
    body('is_recurring').optional().isBoolean(),
    body('client_id').optional().isUUID(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      type, amount, category, date, description, notes, tags,
      is_recurring, recurring_id, receipt_url, client_id,
    } = req.body;

    const result = await query(
      `INSERT INTO transactions
        (user_id, type, amount, category, description, notes, tags, date, is_recurring, recurring_id, receipt_url, client_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, CURRENT_DATE),$9,$10,$11,$12,NOW())
       RETURNING *`,
      [
        req.user.id, type, amount, category, description || null, notes || null,
        tags || [], date || null, is_recurring || false, recurring_id || null,
        receipt_url || null, client_id || null,
      ]
    );
    res.status(201).json({ transaction: result.rows[0] });
  })
);

router.put(
  '/:id',
  [
    body('amount').optional().isFloat({ min: 0 }),
    body('category').optional().trim().notEmpty(),
    body('date').optional().isISO8601(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const fields = [
      'type', 'amount', 'category', 'description', 'notes', 'tags',
      'date', 'is_recurring', 'receipt_url',
    ];
    const sets = [];
    const params = [];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        params.push(req.body[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (!sets.length) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    sets.push('updated_at = NOW()', 'synced_at = NOW()');
    params.push(req.params.id, req.user.id);

    const result = await query(
      `UPDATE transactions SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND user_id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ transaction: result.rows[0] });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE transactions SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ success: true });
  })
);

export default router;
