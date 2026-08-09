import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { start, end } = monthBounds(0);
    const userId = req.user.id;

    const [incomeRes, expenseRes, investRes, assetRes, recentRes, recurringRes, budgetsRes, cashflowRes] =
      await Promise.all([
        query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
           WHERE user_id=$1 AND type='income' AND deleted_at IS NULL AND date >= $2 AND date < $3`,
          [userId, start, end]
        ),
        query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
           WHERE user_id=$1 AND type='expense' AND deleted_at IS NULL AND date >= $2 AND date < $3`,
          [userId, start, end]
        ),
        query(
          `SELECT COALESCE(SUM(invested_amount),0) AS invested,
                  COALESCE(SUM(current_value),0) AS current
           FROM investments WHERE user_id=$1 AND deleted_at IS NULL`,
          [userId]
        ),
        query(
          `SELECT COALESCE(SUM(purchase_value),0) AS purchase,
                  COALESCE(SUM(current_value),0) AS current
           FROM assets WHERE user_id=$1 AND deleted_at IS NULL`,
          [userId]
        ),
        query(
          `SELECT * FROM transactions
           WHERE user_id=$1 AND deleted_at IS NULL
           ORDER BY date DESC, created_at DESC LIMIT 8`,
          [userId]
        ),
        query(
          `SELECT * FROM recurring_transactions
           WHERE user_id=$1 AND deleted_at IS NULL AND is_paused = FALSE
             AND next_due_date <= (CURRENT_DATE + INTERVAL '14 days')
           ORDER BY next_due_date ASC LIMIT 6`,
          [userId]
        ),
        query(
          `SELECT b.*, COALESCE(s.spent,0) AS spent
           FROM budgets b
           LEFT JOIN (
             SELECT category, SUM(amount) AS spent
             FROM transactions
             WHERE user_id=$1 AND type='expense' AND deleted_at IS NULL
               AND date >= $2 AND date < $3
             GROUP BY category
           ) s ON s.category = b.category
           WHERE b.user_id=$1 AND b.month = $2`,
          [userId, start, end]
        ),
        query(
          `SELECT date_trunc('month', date) AS period,
                  SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
                  SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
           FROM transactions
           WHERE user_id=$1 AND deleted_at IS NULL
             AND date >= (CURRENT_DATE - INTERVAL '11 months')
           GROUP BY date_trunc('month', date)
           ORDER BY period ASC`,
          [userId]
        ),
      ]);

    const monthlyIncome = Number(incomeRes.rows[0].total);
    const monthlyExpenses = Number(expenseRes.rows[0].total);
    const netSavings = monthlyIncome - monthlyExpenses;
    const investmentValue = Number(investRes.rows[0].current);
    const investedAmount = Number(investRes.rows[0].invested);
    const assetValue = Number(assetRes.rows[0].current);
    const netWorth = investmentValue + assetValue;

    const expenseByCategory = await query(
      `SELECT category, SUM(amount) AS total
       FROM transactions
       WHERE user_id=$1 AND type='expense' AND deleted_at IS NULL AND date >= $2 AND date < $3
       GROUP BY category ORDER BY total DESC`,
      [userId, start, end]
    );

    const budgetTotal = budgetsRes.rows.reduce((s, b) => s + Number(b.amount), 0);
    const budgetSpent = budgetsRes.rows.reduce((s, b) => s + Number(b.spent), 0);
    const budgetUtilization = budgetTotal > 0 ? (budgetSpent / budgetTotal) * 100 : 0;

    // Simple financial health score 0-100
    let health = 50;
    if (monthlyIncome > 0) {
      const savingsRate = netSavings / monthlyIncome;
      health += Math.min(25, Math.max(-25, savingsRate * 50));
    }
    if (investmentValue > 0) health += 10;
    if (budgetUtilization > 0 && budgetUtilization < 90) health += 10;
    if (budgetUtilization >= 100) health -= 15;
    health = Math.round(Math.max(0, Math.min(100, health)));

    res.json({
      overview: {
        monthlyIncome,
        monthlyExpenses,
        netSavings,
        cashFlow: netSavings,
        budgetUtilization,
        investmentPortfolio: investmentValue,
        investedAmount,
        investmentGain: investmentValue - investedAmount,
        totalAssets: assetValue,
        netWorth,
        financialHealthScore: health,
        accountBalance: netSavings, // simplified current-month balance proxy
      },
      expenseByCategory: expenseByCategory.rows,
      cashFlowTrend: cashflowRes.rows.map((r) => ({
        period: r.period,
        income: Number(r.income),
        expense: Number(r.expense),
        net: Number(r.income) - Number(r.expense),
      })),
      budgets: budgetsRes.rows,
      upcomingPayments: recurringRes.rows,
      recentTransactions: recentRes.rows,
    });
  })
);

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { from, to, group = 'month' } = req.query;
    const fromDate = from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);
    const trunc = ['day', 'week', 'month', 'quarter', 'year'].includes(group) ? group : 'month';

    const [flow, expenses, income, investments, assets] = await Promise.all([
      query(
        `SELECT date_trunc($4, date) AS period,
                SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
                SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
         FROM transactions
         WHERE user_id=$1 AND deleted_at IS NULL AND date >= $2 AND date <= $3
         GROUP BY period ORDER BY period`,
        [req.user.id, fromDate, toDate, trunc]
      ),
      query(
        `SELECT category, SUM(amount) AS total
         FROM transactions
         WHERE user_id=$1 AND type='expense' AND deleted_at IS NULL AND date >= $2 AND date <= $3
         GROUP BY category ORDER BY total DESC`,
        [req.user.id, fromDate, toDate]
      ),
      query(
        `SELECT category, SUM(amount) AS total
         FROM transactions
         WHERE user_id=$1 AND type='income' AND deleted_at IS NULL AND date >= $2 AND date <= $3
         GROUP BY category ORDER BY total DESC`,
        [req.user.id, fromDate, toDate]
      ),
      query(
        `SELECT type, SUM(invested_amount) AS invested, SUM(current_value) AS current
         FROM investments WHERE user_id=$1 AND deleted_at IS NULL
         GROUP BY type`,
        [req.user.id]
      ),
      query(
        `SELECT category, SUM(purchase_value) AS purchase, SUM(current_value) AS current
         FROM assets WHERE user_id=$1 AND deleted_at IS NULL
         GROUP BY category`,
        [req.user.id]
      ),
    ]);

    res.json({
      from: fromDate,
      to: toDate,
      group: trunc,
      cashFlow: flow.rows,
      expenseBreakdown: expenses.rows,
      incomeBreakdown: income.rows,
      investmentAllocation: investments.rows,
      assetBreakdown: assets.rows,
    });
  })
);

export default router;
