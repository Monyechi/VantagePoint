export * from "./buyerTypes";
export * from "./offers";
export * from "./intentSignals";
export * from "./locations";

export interface BudgetBand {
  id: string;
  label: string;
}

export const BUDGET_BANDS: BudgetBand[] = [
  { id: "under_1k", label: "Under $1k" },
  { id: "1k_5k", label: "$1k – $5k" },
  { id: "5k_25k", label: "$5k – $25k" },
  { id: "25k_100k", label: "$25k – $100k" },
  { id: "100k_plus", label: "$100k+" },
];

export interface CompanySize {
  id: string;
  label: string;
}

export const COMPANY_SIZES: CompanySize[] = [
  { id: "any", label: "Any size" },
  { id: "solo", label: "Solo / freelancer" },
  { id: "micro", label: "2–10 employees" },
  { id: "small", label: "11–50 employees" },
  { id: "mid", label: "51–200 employees" },
  { id: "large", label: "200+ employees" },
];

export function budgetBandLabel(id: string): string {
  return BUDGET_BANDS.find((b) => b.id === id)?.label ?? id;
}

export function companySizeLabel(id: string): string {
  return COMPANY_SIZES.find((c) => c.id === id)?.label ?? id;
}
