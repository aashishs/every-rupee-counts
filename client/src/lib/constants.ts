export const EXPENSE_CATEGORIES = [
  'Food', 'Grocery', 'Rent', 'Utilities', 'Fuel', 'Shopping', 'Medical',
  'Education', 'Entertainment', 'Insurance', 'Travel', 'EMI', 'Miscellaneous',
] as const;

export const INCOME_CATEGORIES = [
  'Salary', 'Freelancing', 'Business', 'Rental Income', 'Investments', 'Interest', 'Other Income',
] as const;

/** @deprecated Prefer PORTFOLIO_TYPES — kept for compatibility */
export const INVESTMENT_TYPES = [
  'Stocks',
  'Mutual Funds',
  'SIPs',
  'Fixed Deposits',
  'Recurring Deposits',
  'Gold',
  'Cryptocurrency',
  'Bonds',
  'PPF',
  'EPF',
  'NPS',
  'Insurance Policies',
  'ULIP',
  'Real Estate',
  'PMS',
  'AIF',
  'Other Investments',
] as const;

export const ASSET_CATEGORIES = [
  'House', 'Land', 'Vehicle', 'Gold', 'Jewellery', 'Electronics', 'Furniture', 'Collectibles', 'Other',
] as const;

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

export type PortfolioFieldKey =
  | 'institution'
  | 'reference_no'
  | 'purchase_date'
  | 'maturity_date'
  | 'interest_rate'
  | 'symbol'
  | 'isin'
  | 'units'
  | 'broker'
  | 'sum_assured'
  | 'premium'
  | 'premium_frequency'
  | 'insured_name'
  | 'term_years'
  | 'premium_term_years'
  | 'policy_type'
  | 'uan'
  | 'employer'
  | 'pran'
  | 'monthly_installment'
  | 'tenure_months'
  | 'address'
  | 'area_sqft'
  | 'rental_income_monthly'
  | 'quantity_grams'
  | 'purity';

export interface PortfolioTypeDef {
  type: string;
  group: string;
  description: string;
  fields: PortfolioFieldKey[];
}

export const PORTFOLIO_GROUPS = [
  'Equities & Funds',
  'Deposits & Debt',
  'Retirement',
  'Insurance',
  'Real Assets',
  'Alternatives',
] as const;

export const PORTFOLIO_TYPES: PortfolioTypeDef[] = [
  {
    type: 'Stocks',
    group: 'Equities & Funds',
    description: 'Listed equities and ETFs',
    fields: ['symbol', 'isin', 'units', 'broker', 'purchase_date', 'institution'],
  },
  {
    type: 'Mutual Funds',
    group: 'Equities & Funds',
    description: 'Open-ended mutual fund schemes',
    fields: ['isin', 'units', 'broker', 'reference_no', 'purchase_date', 'institution'],
  },
  {
    type: 'SIPs',
    group: 'Equities & Funds',
    description: 'Systematic investment plans',
    fields: ['isin', 'units', 'broker', 'reference_no', 'monthly_installment', 'purchase_date', 'institution'],
  },
  {
    type: 'Fixed Deposits',
    group: 'Deposits & Debt',
    description: 'Bank / NBFC fixed deposits',
    fields: ['institution', 'reference_no', 'interest_rate', 'purchase_date', 'maturity_date'],
  },
  {
    type: 'Recurring Deposits',
    group: 'Deposits & Debt',
    description: 'Monthly recurring deposits',
    fields: [
      'institution',
      'reference_no',
      'interest_rate',
      'monthly_installment',
      'tenure_months',
      'purchase_date',
      'maturity_date',
    ],
  },
  {
    type: 'Bonds',
    group: 'Deposits & Debt',
    description: 'Government and corporate bonds',
    fields: ['institution', 'reference_no', 'isin', 'interest_rate', 'purchase_date', 'maturity_date'],
  },
  {
    type: 'PPF',
    group: 'Retirement',
    description: 'Public Provident Fund',
    fields: ['institution', 'reference_no', 'interest_rate', 'purchase_date', 'maturity_date'],
  },
  {
    type: 'EPF',
    group: 'Retirement',
    description: 'Employee Provident Fund',
    fields: ['institution', 'reference_no', 'uan', 'employer', 'interest_rate', 'purchase_date'],
  },
  {
    type: 'NPS',
    group: 'Retirement',
    description: 'National Pension System',
    fields: ['institution', 'reference_no', 'pran', 'purchase_date'],
  },
  {
    type: 'Insurance Policies',
    group: 'Insurance',
    description: 'Life / term / endowment policies',
    fields: [
      'institution',
      'reference_no',
      'policy_type',
      'sum_assured',
      'premium',
      'premium_frequency',
      'insured_name',
      'term_years',
      'premium_term_years',
      'purchase_date',
      'maturity_date',
    ],
  },
  {
    type: 'ULIP',
    group: 'Insurance',
    description: 'Unit-linked insurance plans',
    fields: [
      'institution',
      'reference_no',
      'sum_assured',
      'premium',
      'premium_frequency',
      'insured_name',
      'units',
      'purchase_date',
      'maturity_date',
    ],
  },
  {
    type: 'Real Estate',
    group: 'Real Assets',
    description: 'Property and land investments',
    fields: ['institution', 'reference_no', 'address', 'area_sqft', 'rental_income_monthly', 'purchase_date'],
  },
  {
    type: 'Gold',
    group: 'Real Assets',
    description: 'Physical gold, coins, bars',
    fields: ['institution', 'quantity_grams', 'purity', 'purchase_date'],
  },
  {
    type: 'Cryptocurrency',
    group: 'Alternatives',
    description: 'Crypto holdings',
    fields: ['symbol', 'units', 'broker', 'purchase_date'],
  },
  {
    type: 'PMS',
    group: 'Alternatives',
    description: 'Portfolio Management Services',
    fields: ['institution', 'reference_no', 'purchase_date', 'broker'],
  },
  {
    type: 'AIF',
    group: 'Alternatives',
    description: 'Alternative Investment Funds',
    fields: ['institution', 'reference_no', 'purchase_date', 'broker'],
  },
  {
    type: 'Other Investments',
    group: 'Alternatives',
    description: 'Anything else you want to track',
    fields: ['institution', 'reference_no', 'purchase_date', 'maturity_date', 'interest_rate'],
  },
];

export const META_FIELDS = new Set<PortfolioFieldKey>([
  'sum_assured',
  'premium',
  'premium_frequency',
  'insured_name',
  'term_years',
  'premium_term_years',
  'policy_type',
  'uan',
  'employer',
  'pran',
  'monthly_installment',
  'tenure_months',
  'address',
  'area_sqft',
  'rental_income_monthly',
  'quantity_grams',
  'purity',
]);

export function getPortfolioType(type: string) {
  return PORTFOLIO_TYPES.find((t) => t.type === type) || PORTFOLIO_TYPES[PORTFOLIO_TYPES.length - 1];
}
