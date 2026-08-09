import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = req.query.type;
    const params = [];
    let sql = `SELECT * FROM categories WHERE (is_system = TRUE OR user_id = $1)`;
    params.push(req.user.id);
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }
    sql += ` ORDER BY is_system DESC, name ASC`;
    const result = await query(sql, params);
    res.json({ categories: result.rows });
  })
);

export default router;
