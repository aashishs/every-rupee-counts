import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

/**
 * Offline-first sync: client uploads encrypted blob + pulls latest cloud blob.
 * Conflict strategy: last-write-wins by version / updated_at, client merges locally.
 */
router.get(
  '/latest',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, encrypted_payload, iv, checksum, device_id, version, updated_at
       FROM sync_blobs
       WHERE user_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [req.user.id]
    );
    res.json({ blob: result.rows[0] || null });
  })
);

router.post(
  '/push',
  [
    body('encrypted_payload').isString().notEmpty(),
    body('iv').isString().notEmpty(),
    body('version').isInt({ min: 1 }),
    body('checksum').optional().isString(),
    body('device_id').optional().isString(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { encrypted_payload, iv, version, checksum, device_id } = req.body;

    const latest = await query(
      `SELECT version FROM sync_blobs WHERE user_id = $1 ORDER BY version DESC LIMIT 1`,
      [req.user.id]
    );
    const cloudVersion = latest.rows[0]?.version || 0;

    if (version <= cloudVersion) {
      return res.status(409).json({
        error: 'Conflict: cloud has newer or equal version',
        cloudVersion,
        resolve: 'pull-merge-push',
      });
    }

    const result = await query(
      `INSERT INTO sync_blobs (user_id, encrypted_payload, iv, checksum, device_id, version, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       RETURNING id, version, updated_at, device_id`,
      [req.user.id, encrypted_payload, iv, checksum || null, device_id || null, version]
    );

    // Keep last 10 versions
    await query(
      `DELETE FROM sync_blobs
       WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM sync_blobs WHERE user_id = $1 ORDER BY version DESC LIMIT 10
       )`,
      [req.user.id]
    );

    res.status(201).json({ blob: result.rows[0] });
  })
);

router.post(
  '/entities',
  asyncHandler(async (req, res) => {
    // Structured entity sync with LWW conflict resolution on updated_at
    const { transactions = [], investments = [], assets = [], budgets = [], recurring = [] } = req.body;
    const results = { transactions: [], investments: [], assets: [], budgets: [], recurring: [] };

    for (const tx of transactions) {
      const existing = tx.client_id
        ? await query(
            `SELECT id, updated_at FROM transactions WHERE user_id=$1 AND client_id=$2`,
            [req.user.id, tx.client_id]
          )
        : { rows: [] };

      if (!existing.rows[0]) {
        const inserted = await query(
          `INSERT INTO transactions
            (user_id, type, amount, category, description, notes, tags, date, is_recurring, client_id, synced_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),COALESCE($11,NOW()))
           RETURNING *`,
          [
            req.user.id, tx.type, tx.amount, tx.category, tx.description || null, tx.notes || null,
            tx.tags || [], tx.date, tx.is_recurring || false, tx.client_id, tx.updated_at || null,
          ]
        );
        results.transactions.push(inserted.rows[0]);
      } else if (new Date(tx.updated_at) > new Date(existing.rows[0].updated_at)) {
        const updated = await query(
          `UPDATE transactions SET
             type=$1, amount=$2, category=$3, description=$4, notes=$5, tags=$6, date=$7,
             deleted_at=$8, updated_at=$9, synced_at=NOW()
           WHERE id=$10 RETURNING *`,
          [
            tx.type, tx.amount, tx.category, tx.description || null, tx.notes || null,
            tx.tags || [], tx.date, tx.deleted_at || null, tx.updated_at, existing.rows[0].id,
          ]
        );
        results.transactions.push(updated.rows[0]);
      }
    }

    res.json({ synced: results });
  })
);

export default router;
