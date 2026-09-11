export const EXPENSE_CATEGORIES = [
  'Food', 'Grocery', 'Rent', 'Utilities', 'Fuel', 'Shopping', 'Medical',
  'Education', 'Entertainment', 'Insurance', 'Travel', 'EMI', 'Miscellaneous',
] as const;

export const INCOME_CATEGORIES = [
  'Salary', 'Freelancing', 'Business', 'Rental Income', 'Investments', 'Interest', 'Other Income',
] as const;

export const INVESTMENT_TYPES = [
  'Stocks', 'Mutual Funds', 'SIPs', 'Fixed Deposits', 'Gold', 'Cryptocurrency',
  'Bonds', 'PPF', 'EPF', 'NPS', 'Real Estate Investments', 'Other Investments',
] as const;

export const ASSET_CATEGORIES = [
  'House', 'Land', 'Vehicle', 'Gold', 'Jewellery', 'Electronics', 'Furniture', 'Collectibles', 'Other',
] as const;

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

export const LOAN_TYPES = [
  'Home Loan',
  'Personal Loan',
  'Car Loan',
  'Education Loan',
  'Gold Loan',
  'Business Loan',
  'Loan Against Property',
  'Credit Card EMI',
  'Other',
] as const;

export const PREPAY_STRATEGIES = [
  {
    value: 'reduce_tenure',
    label: 'Reduce tenure (keep EMI)',
    hint: 'Same EMI, finish the loan earlier — usually the biggest interest saving.',
  },
  {
    value: 'reduce_emi',
    label: 'Reduce EMI (keep tenure)',
    hint: 'Lower monthly outgo; original end date stays roughly the same.',
  },
  {
    value: 'hybrid',
    label: 'Custom new EMI',
    hint: 'Set any EMI after prepayment; tenure adjusts to that EMI.',
  },
] as const;
