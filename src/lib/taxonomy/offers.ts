export interface Service {
  id: string;
  label: string;
  /** Buyer types most likely to need this, in relevance order. */
  defaultBuyers: string[];
  /** Intent signals relevant to this service, in relevance order. */
  intentSignals: string[];
}

export interface Industry {
  id: string;
  label: string;
  services: Service[];
}

export const INDUSTRIES: Industry[] = [
  {
    id: "software",
    label: "Software & Web Development",
    services: [
      {
        id: "website",
        label: "Website design & build",
        defaultBuyers: ["local_business", "small_business", "startup"],
        intentSignals: ["no_website", "outdated_site", "looking_for_help"],
      },
      {
        id: "mobile_app",
        label: "Mobile app development",
        defaultBuyers: ["startup", "small_business", "mid_market"],
        intentSignals: ["looking_for_help", "recent_funding", "hiring_dev"],
      },
      {
        id: "custom_software",
        label: "Custom software / SaaS development",
        defaultBuyers: ["startup", "mid_market", "enterprise"],
        intentSignals: ["hiring_dev", "recent_funding", "rfp_posted"],
      },
    ],
  },
  {
    id: "coaching",
    label: "Coaching & Consulting",
    services: [
      {
        id: "life_coaching",
        label: "Life / relationship coaching",
        defaultBuyers: ["individual"],
        intentSignals: ["looking_for_help", "competitor_switch"],
      },
      {
        id: "business_coaching",
        label: "Business coaching / consulting",
        defaultBuyers: ["small_business", "startup", "mid_market"],
        intentSignals: ["looking_for_help", "recent_funding", "competitor_switch"],
      },
      {
        id: "career_coaching",
        label: "Career coaching",
        defaultBuyers: ["individual"],
        intentSignals: ["looking_for_help"],
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Creative",
    services: [
      {
        id: "seo",
        label: "SEO / digital marketing",
        defaultBuyers: ["local_business", "small_business", "startup"],
        intentSignals: ["outdated_site", "local_no_presence", "competitor_switch"],
      },
      {
        id: "branding_design",
        label: "Branding & graphic design",
        defaultBuyers: ["startup", "small_business"],
        intentSignals: ["outdated_site", "recent_funding", "looking_for_help"],
      },
      {
        id: "social_media",
        label: "Social media management",
        defaultBuyers: ["local_business", "small_business"],
        intentSignals: ["no_website", "local_no_presence", "looking_for_help"],
      },
    ],
  },
  {
    id: "professional_services",
    label: "Professional Services",
    services: [
      {
        id: "accounting",
        label: "Accounting / bookkeeping",
        defaultBuyers: ["small_business", "startup", "individual"],
        intentSignals: ["looking_for_help", "competitor_switch", "local_no_presence"],
      },
      {
        id: "legal",
        label: "Legal services",
        defaultBuyers: ["individual", "small_business", "startup"],
        intentSignals: ["looking_for_help", "local_no_presence"],
      },
      {
        id: "insurance",
        label: "Insurance / financial advising",
        defaultBuyers: ["individual", "small_business"],
        intentSignals: ["looking_for_help", "competitor_switch"],
      },
    ],
  },
  {
    id: "home_services",
    label: "Home & Local Services",
    services: [
      {
        id: "contracting",
        label: "Contracting / renovation",
        defaultBuyers: ["individual", "local_business"],
        intentSignals: ["no_website", "looking_for_help", "local_no_presence"],
      },
      {
        id: "cleaning",
        label: "Cleaning services",
        defaultBuyers: ["individual", "local_business"],
        intentSignals: ["no_website", "local_no_presence", "looking_for_help"],
      },
      {
        id: "landscaping",
        label: "Landscaping / lawn care",
        defaultBuyers: ["individual", "local_business"],
        intentSignals: ["no_website", "local_no_presence"],
      },
    ],
  },
  {
    id: "health_wellness",
    label: "Health & Wellness",
    services: [
      {
        id: "dental",
        label: "Dental services",
        defaultBuyers: ["individual"],
        intentSignals: ["looking_for_help", "local_no_presence", "competitor_switch"],
      },
      {
        id: "fitness",
        label: "Personal training / fitness coaching",
        defaultBuyers: ["individual"],
        intentSignals: ["looking_for_help", "local_no_presence"],
      },
      {
        id: "therapy",
        label: "Therapy / counseling",
        defaultBuyers: ["individual"],
        intentSignals: ["looking_for_help", "competitor_switch"],
      },
    ],
  },
];

export function findService(
  industryId: string,
  serviceId: string,
): { industry: Industry; service: Service } | null {
  const industry = INDUSTRIES.find((i) => i.id === industryId);
  const service = industry?.services.find((s) => s.id === serviceId);
  if (!industry || !service) return null;
  return { industry, service };
}
