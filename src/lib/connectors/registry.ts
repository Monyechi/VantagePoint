import type { Connector } from "./types";

export const CONNECTORS: Connector[] = [
  // Search
  {
    id: "serp",
    name: "SerpAPI",
    category: "search",
    description: "Google search results (organic, maps, shopping, images, news).",
    status: "implemented",
    keyHint: "Enter your SerpAPI key in Settings.",
  },
  {
    id: "tavily",
    name: "Tavily",
    category: "search",
    description: "Search built for AI — clean results, built-in summaries.",
    status: "implemented",
    keyHint: "Enter your Tavily key in Settings.",
  },
  {
    id: "brave",
    name: "Brave Search",
    category: "search",
    description: "Independent search index, inexpensive, good for company sites and blogs.",
    status: "implemented",
    keyHint: "Enter your Brave Search API key in Settings.",
  },
  {
    id: "serper",
    name: "Serper",
    category: "search",
    description: "Another Google Search API option.",
    status: "planned",
  },

  // Email
  {
    id: "resend",
    name: "Resend",
    category: "email",
    description: "Send outreach emails directly instead of mailto/clipboard.",
    status: "implemented",
    keyHint: "Enter your Resend key and a verified \"from\" address in Settings.",
  },
  { id: "postmark", name: "Postmark", category: "email", description: "Transactional email with strong deliverability.", status: "planned" },
  { id: "sendgrid", name: "SendGrid", category: "email", description: "Industry-standard email sending.", status: "planned" },
  { id: "mailgun", name: "Mailgun", category: "email", description: "Transactional email API.", status: "planned" },

  // Calendar
  { id: "google_calendar", name: "Google Calendar", category: "calendar", description: "Book meetings automatically.", status: "planned" },
  { id: "outlook_calendar", name: "Microsoft Outlook", category: "calendar", description: "Book meetings automatically.", status: "planned" },

  // CRM
  { id: "hubspot", name: "HubSpot", category: "crm", description: "Sync leads to an external CRM.", status: "planned" },
  { id: "salesforce", name: "Salesforce", category: "crm", description: "Sync leads to an external CRM.", status: "planned" },
  { id: "pipedrive", name: "Pipedrive", category: "crm", description: "Sync leads to an external CRM.", status: "planned" },
  { id: "zoho", name: "Zoho CRM", category: "crm", description: "Sync leads to an external CRM.", status: "planned" },

  // Contacts
  { id: "google_contacts", name: "Google Contacts", category: "contacts", description: "Sync contacts.", status: "planned" },
  { id: "microsoft_contacts", name: "Microsoft Contacts", category: "contacts", description: "Sync contacts.", status: "planned" },

  // Maps
  { id: "google_places", name: "Google Places", category: "maps", description: "\"Find dentists within 10 miles\" style local search.", status: "planned" },
  { id: "mapbox", name: "Mapbox", category: "maps", description: "Geocoding and maps.", status: "planned" },
  { id: "openstreetmap", name: "OpenStreetMap", category: "maps", description: "Free geocoding.", status: "planned" },

  // Company intelligence
  { id: "clearbit", name: "Clearbit", category: "company_intel", description: "Company data — revenue, employees, technologies.", status: "planned" },
  { id: "apollo", name: "Apollo", category: "company_intel", description: "Lead database — decision makers, emails, phone numbers.", status: "planned" },
  { id: "people_data_labs", name: "People Data Labs", category: "company_intel", description: "Large-scale person/company data.", status: "planned" },
  { id: "hunter", name: "Hunter.io", category: "company_intel", description: "Find company emails.", status: "planned" },
  { id: "snov", name: "Snov.io", category: "company_intel", description: "Email finder and outreach.", status: "planned" },

  // Website tech / SEO
  { id: "pagespeed", name: "Google PageSpeed", category: "website_analysis", description: "Analyze speed, mobile-friendliness, accessibility — a great selling point in outreach.", status: "planned" },
  { id: "builtwith", name: "BuiltWith", category: "website_analysis", description: "Detect a site's tech stack.", status: "planned" },
  { id: "wappalyzer", name: "Wappalyzer", category: "website_analysis", description: "Detect WordPress, Shopify, Wix, Squarespace, etc.", status: "planned" },

  // Domain
  { id: "whois", name: "WHOIS / DNS", category: "domain", description: "Domain age, registrar, expiration.", status: "planned" },

  // Social
  { id: "x_twitter", name: "X (Twitter)", category: "social", description: "Public post monitoring.", status: "planned" },
  { id: "reddit", name: "Reddit", category: "social", description: "Find posts from people asking for exactly the help you sell.", status: "planned" },
  { id: "youtube", name: "YouTube", category: "social", description: "Find creators and potential partnerships.", status: "planned" },
  { id: "facebook", name: "Facebook", category: "social", description: "Public page/group content where permitted.", status: "planned" },
  { id: "instagram", name: "Instagram", category: "social", description: "Public content, limited API access.", status: "planned" },
  { id: "tiktok", name: "TikTok", category: "social", description: "Public content, limited API access.", status: "planned" },

  // Automation
  { id: "n8n", name: "n8n", category: "automation", description: "Custom workflow automation.", status: "planned" },
  { id: "mcp", name: "MCP (Model Context Protocol)", category: "automation", description: "Standardized tool-calling for the AI.", status: "planned" },

  // Notifications
  { id: "discord", name: "Discord", category: "notifications", description: "Job/lead notifications.", status: "planned" },
  { id: "slack", name: "Slack", category: "notifications", description: "Job/lead notifications.", status: "planned" },
  { id: "telegram", name: "Telegram", category: "notifications", description: "Job/lead notifications.", status: "planned" },
  { id: "pushbullet", name: "Pushbullet", category: "notifications", description: "Push notifications.", status: "planned" },

  // Documents
  { id: "pdf_generation", name: "PDF Generation", category: "documents", description: "Proposals, contracts, invoices.", status: "planned" },

  // Payments
  { id: "stripe", name: "Stripe", category: "payments", description: "Take payment if you commercialize the platform.", status: "planned" },
  { id: "paddle", name: "Paddle", category: "payments", description: "Take payment if you commercialize the platform.", status: "planned" },
  { id: "lemon_squeezy", name: "Lemon Squeezy", category: "payments", description: "Take payment if you commercialize the platform.", status: "planned" },

  // Browser automation
  { id: "playwright", name: "Playwright", category: "browser_automation", description: "Open pages, log in, fill forms, download reports.", status: "planned" },
  { id: "browser_use", name: "Browser-use", category: "browser_automation", description: "AI-driven browser automation.", status: "planned" },
  { id: "stagehand", name: "Stagehand", category: "browser_automation", description: "AI-driven browser automation.", status: "planned" },
];

export function connectorsByCategory(): { category: Connector["category"]; connectors: Connector[] }[] {
  const order: Connector["category"][] = [
    "search",
    "email",
    "calendar",
    "crm",
    "contacts",
    "maps",
    "company_intel",
    "website_analysis",
    "domain",
    "social",
    "automation",
    "notifications",
    "documents",
    "payments",
    "browser_automation",
  ];
  return order.map((category) => ({
    category,
    connectors: CONNECTORS.filter((c) => c.category === category),
  }));
}
