export type ConnectorCategory =
  | "search"
  | "email"
  | "calendar"
  | "crm"
  | "contacts"
  | "maps"
  | "company_intel"
  | "website_analysis"
  | "domain"
  | "social"
  | "automation"
  | "notifications"
  | "documents"
  | "payments"
  | "browser_automation";

export const CONNECTOR_CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  search: "Web Search",
  email: "Email",
  calendar: "Calendar",
  crm: "CRM",
  contacts: "Contacts",
  maps: "Maps & Places",
  company_intel: "Company Intelligence",
  website_analysis: "Website Tech & SEO",
  domain: "Domain",
  social: "Social",
  automation: "Automation",
  notifications: "Notifications",
  documents: "PDFs & Documents",
  payments: "Payments",
  browser_automation: "Browser Automation",
};

export type ConnectorStatus = "implemented" | "planned";

export interface Connector {
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  status: ConnectorStatus;
  /** Only present for implemented connectors that need a saved key. */
  keyHint?: string;
}
