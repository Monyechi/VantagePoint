export interface BuyerType {
  id: string;
  label: string;
}

export const BUYER_TYPES: BuyerType[] = [
  { id: "individual", label: "Individual / consumer" },
  { id: "local_business", label: "Local business" },
  { id: "startup", label: "Startup" },
  { id: "small_business", label: "Small business" },
  { id: "mid_market", label: "Mid-market company" },
  { id: "enterprise", label: "Enterprise" },
  { id: "nonprofit", label: "Nonprofit / association" },
];

export function buyerTypeLabel(id: string): string {
  return BUYER_TYPES.find((b) => b.id === id)?.label ?? id;
}
