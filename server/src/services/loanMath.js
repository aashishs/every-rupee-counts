/**
 * Reducing-balance EMI loan maths (monthly compounding).
 */

export function monthlyRate(annualPercent) {
  return Number(annualPercent) / 12 / 100;
}

export function calculateEmi(principal, annualRatePercent, tenureMonths) {
  const P = Number(principal);
  const n = Number(tenureMonths);
  const r = monthlyRate(annualRatePercent);
  if (P <= 0 || n <= 0) return 0;
  if (r === 0) return round2(P / n);
  const factor = Math.pow(1 + r, n);
  return round2((P * r * factor) / (factor - 1));
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function addMonths(dateInput, months) {
  const d = new Date(dateInput);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp end-of-month overflow
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/**
 * Build amortization schedule from a starting balance.
 */
export function buildSchedule({
  principal,
  annualRatePercent,
  emi,
  startDate,
  maxMonths = 600,
}) {
  const r = monthlyRate(annualRatePercent);
  let balance = Number(principal);
  const payment = Number(emi);
  const rows = [];
  let month = 0;
  let totalInterest = 0;
  let totalPrincipal = 0;

  while (balance > 0.01 && month < maxMonths) {
    month += 1;
    const interest = round2(balance * r);
    let principalPart = round2(payment - interest);
    if (principalPart <= 0 && r > 0) {
      // EMI too low to cover interest — break to avoid infinite loop
      rows.push({
        month,
        date: addMonths(startDate, month - 1),
        emi: payment,
        interest,
        principal: 0,
        balance: round2(balance + interest),
        note: 'EMI does not cover interest',
      });
      break;
    }
    if (principalPart > balance) principalPart = round2(balance);
    const actualEmi = round2(principalPart + interest);
    balance = round2(balance - principalPart);
    totalInterest = round2(totalInterest + interest);
    totalPrincipal = round2(totalPrincipal + principalPart);
    rows.push({
      month,
      date: addMonths(startDate, month - 1),
      emi: actualEmi,
      interest,
      principal: principalPart,
      balance: Math.max(0, balance),
    });
  }

  return {
    months: month,
    closingDate: rows.length ? rows[rows.length - 1].date : null,
    closingYear: rows.length ? Number(rows[rows.length - 1].date.slice(0, 4)) : null,
    totalInterest,
    totalPrincipal,
    totalPayment: round2(totalInterest + totalPrincipal),
    schedule: rows,
  };
}

/**
 * Months remaining to close at current EMI (reduce-tenure style).
 */
export function monthsToClose(principal, annualRatePercent, emi) {
  const result = buildSchedule({
    principal,
    annualRatePercent,
    emi,
    startDate: new Date().toISOString().slice(0, 10),
  });
  return {
    months: result.months,
    closingDate: result.closingDate,
    closingYear: result.closingYear,
    totalInterest: result.totalInterest,
    totalPayment: result.totalPayment,
  };
}

/**
 * Simulate a lump-sum prepayment.
 * strategy:
 *  - reduce_tenure: keep EMI, finish earlier
 *  - reduce_emi: keep original remaining tenure, lower EMI
 *  - hybrid: apply part to tenure reduction using a custom new EMI (optional)
 */
export function simulatePrepayment({
  outstanding,
  annualRatePercent,
  currentEmi,
  remainingMonths,
  prepayAmount,
  strategy = 'reduce_tenure',
  asOfDate = new Date().toISOString().slice(0, 10),
  newEmi,
}) {
  const prepay = Math.min(Number(prepayAmount), Number(outstanding));
  const afterPrepay = round2(Number(outstanding) - prepay);
  if (afterPrepay <= 0) {
    return {
      strategy,
      prepayAmount: prepay,
      outstandingBefore: Number(outstanding),
      outstandingAfter: 0,
      emiBefore: Number(currentEmi),
      emiAfter: 0,
      monthsBefore: Number(remainingMonths),
      monthsAfter: 0,
      closingDateBefore: addMonths(asOfDate, Number(remainingMonths) - 1),
      closingDateAfter: asOfDate,
      interestBefore: null,
      interestAfter: 0,
      interestSaved: null,
      monthsSaved: Number(remainingMonths),
      fullyClosed: true,
    };
  }

  const before = buildSchedule({
    principal: outstanding,
    annualRatePercent,
    emi: currentEmi,
    startDate: asOfDate,
    maxMonths: Number(remainingMonths) || 600,
  });

  let emiAfter = Number(currentEmi);
  let after;

  if (strategy === 'reduce_emi') {
    const tenure = Number(remainingMonths) || before.months;
    emiAfter = calculateEmi(afterPrepay, annualRatePercent, tenure);
    after = buildSchedule({
      principal: afterPrepay,
      annualRatePercent,
      emi: emiAfter,
      startDate: asOfDate,
      maxMonths: tenure,
    });
  } else if (strategy === 'hybrid' && newEmi) {
    emiAfter = Number(newEmi);
    after = buildSchedule({
      principal: afterPrepay,
      annualRatePercent,
      emi: emiAfter,
      startDate: asOfDate,
    });
  } else {
    // reduce_tenure (default)
    after = buildSchedule({
      principal: afterPrepay,
      annualRatePercent,
      emi: currentEmi,
      startDate: asOfDate,
    });
    emiAfter = Number(currentEmi);
  }

  return {
    strategy,
    prepayAmount: prepay,
    outstandingBefore: Number(outstanding),
    outstandingAfter: afterPrepay,
    emiBefore: Number(currentEmi),
    emiAfter,
    monthsBefore: before.months,
    monthsAfter: after.months,
    closingDateBefore: before.closingDate,
    closingDateAfter: after.closingDate,
    closingYearAfter: after.closingYear,
    interestBefore: before.totalInterest,
    interestAfter: after.totalInterest,
    interestSaved: round2(before.totalInterest - after.totalInterest),
    monthsSaved: before.months - after.months,
    fullyClosed: false,
    schedulePreview: after.schedule.slice(0, 6),
  };
}

/**
 * Foreclosure estimate on a tentative date.
 * Assumes unpaid EMIs until that date are paid on schedule, then remaining principal is settled.
 * foreclosureChargePercent is applied on outstanding principal at foreclosure.
 */
export function estimateForeclosure({
  outstanding,
  annualRatePercent,
  emi,
  tentativeDate,
  asOfDate = new Date().toISOString().slice(0, 10),
  foreclosureChargePercent = 0,
  waiveInterestForMonth = false,
}) {
  const start = new Date(asOfDate);
  const end = new Date(tentativeDate);
  if (end < start) {
    throw Object.assign(new Error('Tentative date must be on or after today'), { status: 400 });
  }

  // Months from asOf to tentative (ceil to next EMI boundary)
  const monthsUntil =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    (end.getUTCDate() > start.getUTCDate() ? 1 : 0);

  const r = monthlyRate(annualRatePercent);
  let balance = Number(outstanding);
  let interestPaid = 0;
  let principalPaid = 0;
  let emisPaid = 0;
  const payment = Number(emi);

  for (let i = 0; i < monthsUntil && balance > 0.01; i += 1) {
    const interest = round2(balance * r);
    let principalPart = round2(payment - interest);
    if (principalPart > balance) principalPart = round2(balance);
    if (principalPart < 0) principalPart = 0;
    balance = round2(balance - principalPart);
    interestPaid = round2(interestPaid + interest);
    principalPaid = round2(principalPaid + principalPart);
    emisPaid += 1;
  }

  // Accrued interest for partial month to tentative date (simple day count / 30)
  let accrued = 0;
  if (!waiveInterestForMonth && balance > 0) {
    const days = Math.max(0, Math.round((end - addMonthsDate(start, emisPaid)) / (1000 * 60 * 60 * 24)));
    accrued = round2(balance * (Number(annualRatePercent) / 100) * (Math.min(days, 30) / 365));
  }

  const charges = round2(balance * (Number(foreclosureChargePercent) / 100));
  const foreclosureAmount = round2(balance + accrued + charges);

  const natural = monthsToClose(outstanding, annualRatePercent, emi);

  return {
    asOfDate,
    tentativeDate,
    monthsUntilForeclosure: monthsUntil,
    emisPaidUntilThen: emisPaid,
    principalPaidUntilThen: principalPaid,
    interestPaidUntilThen: interestPaid,
    outstandingOnDate: balance,
    accruedInterest: accrued,
    foreclosureChargePercent: Number(foreclosureChargePercent),
    foreclosureCharges: charges,
    totalForeclosureAmount: foreclosureAmount,
    naturalClosingDate: natural.closingDate,
    naturalMonthsRemaining: natural.months,
    monthsSavedVsNatural: Math.max(0, natural.months - monthsUntil),
    interestSavedVsNatural: round2(
      Math.max(0, (natural.totalInterest || 0) - interestPaid - accrued)
    ),
  };
}

function addMonthsDate(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function summarizeLoan(loan, prepayments = []) {
  const principal = Number(loan.principal);
  const rate = Number(loan.interest_rate);
  const tenure = Number(loan.tenure_months);
  const emi = Number(loan.emi) || calculateEmi(principal, rate, tenure);
  const startDate = loan.start_date;

  // Apply recorded prepayments chronologically against outstanding
  let outstanding = principal;
  let currentEmi = emi;
  let remainingMonths = tenure;
  const asOf = new Date().toISOString().slice(0, 10);

  // Progress EMIs from start until today (approx by month count)
  const start = new Date(startDate);
  const today = new Date(asOf);
  let monthsElapsed = Math.max(
    0,
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (today.getUTCMonth() - start.getUTCMonth())
  );
  monthsElapsed = Math.min(monthsElapsed, tenure);

  const paidSchedule = buildSchedule({
    principal,
    annualRatePercent: rate,
    emi,
    startDate,
    maxMonths: monthsElapsed,
  });
  if (paidSchedule.schedule.length) {
    outstanding = paidSchedule.schedule[paidSchedule.schedule.length - 1].balance;
    remainingMonths = Math.max(0, tenure - paidSchedule.months);
  }

  const sorted = [...prepayments].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const p of sorted) {
    const amount = Number(p.amount);
    outstanding = round2(Math.max(0, outstanding - amount));
    if (p.strategy === 'reduce_emi' && remainingMonths > 0 && outstanding > 0) {
      currentEmi = calculateEmi(outstanding, rate, remainingMonths);
    } else if (p.strategy === 'hybrid' && p.new_emi) {
      currentEmi = Number(p.new_emi);
      const sim = monthsToClose(outstanding, rate, currentEmi);
      remainingMonths = sim.months;
    } else {
      // reduce_tenure
      const sim = monthsToClose(outstanding, rate, currentEmi);
      remainingMonths = sim.months;
    }
  }

  const closing = monthsToClose(outstanding, rate, currentEmi);
  const originalClosing = addMonths(startDate, tenure - 1);

  return {
    principal,
    emi: currentEmi,
    originalEmi: emi,
    interestRate: rate,
    tenureMonths: tenure,
    monthsElapsed,
    outstanding,
    remainingMonths: closing.months,
    closingDate: closing.closingDate,
    closingYear: closing.closingYear,
    originalClosingDate: originalClosing,
    totalInterestRemaining: closing.totalInterest,
    totalPrepaid: round2(sorted.reduce((s, p) => s + Number(p.amount), 0)),
    status: outstanding <= 0 ? 'closed' : loan.status || 'active',
  };
}
