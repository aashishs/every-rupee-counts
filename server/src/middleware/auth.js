import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || (roles.length && !roles.includes(req.user.role))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export async function attachUser(req, res, next) {
  try {
    const result = await query(
      'SELECT id, email, name, currency, theme, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.currentUser = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}
