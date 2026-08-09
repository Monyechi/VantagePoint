export type ConnectorCategory =
  | "search"
  | "email"
  | "maps"
  | "company_intel"
  | "website_analysis"
  | "domain"
  | "social"
  | "documents";

export const CONNECTOR_CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  search: "Web Search",
  email: "Email",
  maps: "Maps & Places",
  company_intel: "Company Intelligence",
  website_analysis: "Website Tech & SEO",
  domain: "Domain",
  social: "Social",
  documents: "PDFs & Documents",
};

export type ConnectorStatus = "implemented";

export interface Connector {
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  status: ConnectorStatus;
  /** Only present for implemented connectors that need a saved key. */
  keyHint?: string;
  /** Set to false for implemented connectors that need no key at all (e.g. free
   * public APIs) — hides the key-entry row entirely. Defaults to true. */
  requiresKey?: boolean;
  /** Set for implemented connectors where testing would cost real money/credits
   * (sending a real email, spending a paid API credit) — shown instead of a Test button. */
  testCaveat?: string;
}
