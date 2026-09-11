import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import {
  calculateEmi,
  summarizeLoan,
  simulatePrepayment,
  estimateForeclosure,
  buildSchedule,
} from '../services/loanMath.js';

const router = Router();
router.use(authenticate);

async function getLoanForUser(loanId, userId) {
  const result = await query(
    `SELECT * FROM loans WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [loanId, userId]
  );
  return result.rows[0] || null;
}

async function getPrepayments(loanId, userId) {
  const result = await query(
    `SELECT * FROM loan_prepayments WHERE loan_id = $1 AND user_id = $2 ORDER BY date ASC, created_at ASC`,
    [loanId, userId]
  );
  return result.rows;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT * FROM loans WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [req.user.id]
    );
    const loans = [];
    for (const loan of result.rows) {
      const prepayments = await getPrepayments(loan.id, req.user.id);
      loans.push({
        ...loan,
        summary: summarizeLoan(loan, prepayments),
        prepayment_count: prepayments.length,
      });
    }
    res.json({ loans });
  })
);

/** Quick EMI helper (no loan saved) — must be before /:id */
router.post(
  '/tools/emi',
  [
    body('principal').isFloat({ min: 0 }),
    body('interest_rate').isFloat({ min: 0 }),
    body('tenure_months').isInt({ min: 1 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { principal, interest_rate, tenure_months, start_date } = req.body;
    const emi = calculateEmi(principal, interest_rate, tenure_months);
    const schedule = buildSchedule({
      principal,
      annualRatePercent: interest_rate,
      emi,
      startDate: start_date || new Date().toISOString().slice(0, 10),
    });
    res.json({
      emi,
      closingDate: schedule.closingDate,
      closingYear: schedule.closingYear,
      months: schedule.months,
      totalInterest: schedule.totalInterest,
      totalPayment: schedule.totalPayment,
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const loan = await getLoanForUser(req.params.id, req.user.id);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const prepayments = await getPrepayments(loan.id, req.user.id);
    const summary = summarizeLoan(loan, prepayments);
    const schedule = buildSchedule({
      principal: summary.outstanding,
      annualRatePercent: summary.interestRate,
      emi: summary.emi,
      startDate: new Date().toISOString().slice(0, 10),
    });
    res.json({ loan, prepayments, summary, schedule });
  })
);

router.post(
  '/',
  [
    body('name').trim().notEmpty(),
    body('principal').isFloat({ min: 0 }),
    body('interest_rate').isFloat({ min: 0 }),
    body('tenure_months').isInt({ min: 1, max: 600 }),
    body('start_date').isISO8601(),
    body('loan_type').optional().isString(),
    body('emi').optional().isFloat({ min: 0 }),
    body('foreclosure_charge_percent').optional().isFloat({ min: 0 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      name, lender, loan_type, principal, interest_rate, tenure_months,
      emi, start_date, foreclosure_charge_percent, notes, client_id,
    } = req.body;

    const computedEmi = emi ?? calculateEmi(principal, interest_rate, tenure_months);

    const result = await query(
      `INSERT INTO loans
        (user_id, name, lender, loan_type, principal, interest_rate, tenure_months,
         emi, start_date, foreclosure_charge_percent, notes, client_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       RETURNING *`,
      [
        req.user.id,
        name,
        lender || null,
        loan_type || 'Personal',
        principal,
        interest_rate,
        tenure_months,
        computedEmi,
        start_date,
        foreclosure_charge_percent ?? 0,
        notes || null,
        client_id || null,
      ]
    );

    const loan = result.rows[0];
    res.status(201).json({
      loan,
      summary: summarizeLoan(loan, []),
    });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const fields = [
      'name', 'lender', 'loan_type', 'principal', 'interest_rate', 'tenure_months',
      'emi', 'start_date', 'foreclosure_charge_percent', 'notes', 'status',
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

    // Recalculate EMI if principal/rate/tenure changed and emi not explicitly set
    if (
      req.body.emi === undefined &&
      (req.body.principal !== undefined ||
        req.body.interest_rate !== undefined ||
        req.body.tenure_months !== undefined)
    ) {
      const current = await getLoanForUser(req.params.id, req.user.id);
      if (!current) return res.status(404).json({ error: 'Loan not found' });
      const p = req.body.principal ?? current.principal;
      const r = req.body.interest_rate ?? current.interest_rate;
      const t = req.body.tenure_months ?? current.tenure_months;
      params.push(calculateEmi(p, r, t));
      sets.push(`emi = $${params.length}`);
    }

    sets.push('updated_at = NOW()', 'synced_at = NOW()');
    params.push(req.params.id, req.user.id);

    const result = await query(
      `UPDATE loans SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND user_id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Loan not found' });

    const prepayments = await getPrepayments(result.rows[0].id, req.user.id);
    res.json({ loan: result.rows[0], summary: summarizeLoan(result.rows[0], prepayments) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE loans SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Loan not found' });
    res.json({ success: true });
  })
);

/** Preview prepayment impact without saving */
router.post(
  '/:id/prepay/simulate',
  [
    body('amount').isFloat({ min: 1 }),
    body('strategy').optional().isIn(['reduce_tenure', 'reduce_emi', 'hybrid']),
    body('new_emi').optional().isFloat({ min: 1 }),
    body('date').optional().isISO8601(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const loan = await getLoanForUser(req.params.id, req.user.id);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const prepayments = await getPrepayments(loan.id, req.user.id);
    const summary = summarizeLoan(loan, prepayments);

    const simulation = simulatePrepayment({
      outstanding: summary.outstanding,
      annualRatePercent: summary.interestRate,
      currentEmi: summary.emi,
      remainingMonths: summary.remainingMonths,
      prepayAmount: req.body.amount,
      strategy: req.body.strategy || 'reduce_tenure',
      asOfDate: req.body.date || new Date().toISOString().slice(0, 10),
      newEmi: req.body.new_emi,
    });

    res.json({ summary, simulation });
  })
);

/** Record a prepayment */
router.post(
  '/:id/prepay',
  [
    body('amount').isFloat({ min: 1 }),
    body('strategy').isIn(['reduce_tenure', 'reduce_emi', 'hybrid']),
    body('date').optional().isISO8601(),
    body('new_emi').optional().isFloat({ min: 1 }),
    body('notes').optional().isString(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const loan = await getLoanForUser(req.params.id, req.user.id);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const prepayments = await getPrepayments(loan.id, req.user.id);
    const summary = summarizeLoan(loan, prepayments);

    if (summary.outstanding <= 0) {
      return res.status(400).json({ error: 'Loan is already closed' });
    }

    const simulation = simulatePrepayment({
      outstanding: summary.outstanding,
      annualRatePercent: summary.interestRate,
      currentEmi: summary.emi,
      remainingMonths: summary.remainingMonths,
      prepayAmount: req.body.amount,
      strategy: req.body.strategy,
      asOfDate: req.body.date || new Date().toISOString().slice(0, 10),
      newEmi: req.body.new_emi,
    });

    const inserted = await query(
      `INSERT INTO loan_prepayments
        (loan_id, user_id, amount, date, strategy, new_emi, notes,
         outstanding_before, outstanding_after, months_saved, interest_saved, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        loan.id,
        req.user.id,
        simulation.prepayAmount,
        req.body.date || new Date().toISOString().slice(0, 10),
        req.body.strategy,
        req.body.new_emi || null,
        req.body.notes || null,
        simulation.outstandingBefore,
        simulation.outstandingAfter,
        simulation.monthsSaved,
        simulation.interestSaved,
        req.body.client_id || null,
      ]
    );

    // Update EMI on loan when strategy reduces EMI
    if (req.body.strategy === 'reduce_emi' || (req.body.strategy === 'hybrid' && req.body.new_emi)) {
      await query(
        `UPDATE loans SET emi = $1, updated_at = NOW() WHERE id = $2`,
        [simulation.emiAfter, loan.id]
      );
    }

    if (simulation.fullyClosed || simulation.outstandingAfter <= 0) {
      await query(
        `UPDATE loans SET status = 'closed', updated_at = NOW() WHERE id = $1`,
        [loan.id]
      );
    }

    const updatedLoan = await getLoanForUser(loan.id, req.user.id);
    const allPrepays = await getPrepayments(loan.id, req.user.id);

    res.status(201).json({
      prepayment: inserted.rows[0],
      simulation,
      loan: updatedLoan,
      summary: summarizeLoan(updatedLoan, allPrepays),
    });
  })
);

router.delete(
  '/:id/prepay/:prepayId',
  asyncHandler(async (req, res) => {
    const loan = await getLoanForUser(req.params.id, req.user.id);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    const result = await query(
      `DELETE FROM loan_prepayments WHERE id = $1 AND loan_id = $2 AND user_id = $3 RETURNING id`,
      [req.params.prepayId, loan.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Prepayment not found' });

    // Re-open loan if still has outstanding after undo
    const prepayments = await getPrepayments(loan.id, req.user.id);
    const summary = summarizeLoan(loan, prepayments);
    if (summary.outstanding > 0 && loan.status === 'closed') {
      await query(`UPDATE loans SET status = 'active', updated_at = NOW() WHERE id = $1`, [loan.id]);
    }

    res.json({ success: true, summary });
  })
);

/** Foreclosure estimate for a tentative date */
router.post(
  '/:id/foreclose/estimate',
  [
    body('tentative_date').isISO8601(),
    body('foreclosure_charge_percent').optional().isFloat({ min: 0 }),
    body('waive_interest').optional().isBoolean(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const loan = await getLoanForUser(req.params.id, req.user.id);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const prepayments = await getPrepayments(loan.id, req.user.id);
    const summary = summarizeLoan(loan, prepayments);

    const estimate = estimateForeclosure({
      outstanding: summary.outstanding,
      annualRatePercent: summary.interestRate,
      emi: summary.emi,
      tentativeDate: req.body.tentative_date,
      foreclosureChargePercent:
        req.body.foreclosure_charge_percent ?? loan.foreclosure_charge_percent ?? 0,
      waiveInterestForMonth: req.body.waive_interest ?? false,
    });

    res.json({ summary, estimate });
  })
);

export default router;
