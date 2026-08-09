import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body } from 'express-validator';
import { Router } from 'express';
import { query } from '../db/pool.js';
import { config } from '../config/index.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();

function signToken(user) {
  return jwt.sign(
    { email: user.email, role: user.role },
    config.jwtSecret,
    { subject: user.id, expiresIn: config.jwtExpiresIn }
  );
}

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').trim().isLength({ min: 2, max: 100 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const salt = crypto.randomBytes(16).toString('hex');
    const result = await query(
      `INSERT INTO users (email, password_hash, name, encryption_salt)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, currency, theme, role, encryption_salt, created_at`,
      [email, passwordHash, name, salt]
    );

    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  })
);

router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await query(
      `SELECT id, email, name, currency, theme, role, password_hash, encryption_salt, created_at
       FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { password_hash, ...safeUser } = user;
    const token = signToken(safeUser);
    res.json({ token, user: safeUser });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, email, name, currency, theme, role, encryption_salt, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  })
);

router.patch(
  '/me',
  authenticate,
  [
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('currency').optional().isLength({ min: 3, max: 3 }),
    body('theme').optional().isIn(['light', 'dark', 'system']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { name, currency, theme } = req.body;
    const result = await query(
      `UPDATE users SET
         name = COALESCE($1, name),
         currency = COALESCE($2, currency),
         theme = COALESCE($3, theme),
         updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, name, currency, theme, role, encryption_salt, created_at`,
      [name ?? null, currency ?? null, theme ?? null, req.user.id]
    );
    res.json({ user: result.rows[0] });
  })
);

export default router;
