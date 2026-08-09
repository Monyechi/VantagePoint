import { getSetting, setSetting } from "@/lib/db/queries";

export interface AuditLensAttribute {
  id: string;
  label: string;
  /** Asked to the model as a yes/no question about the page content. */
  question: string;
}

export interface AuditLens {
  name: string;
  /** What the model is told to look for — swap this to retarget the same pipeline at
   * a different market question without touching any pipeline code. */
  systemPrompt: string;
  attributes: AuditLensAttribute[];
}

const SETTING_KEY = "market_audit_lens";

export const DEFAULT_AUDIT_LENS: AuditLens = {
  name: "Digital presence & maturity",
  systemPrompt:
    "You profile small local businesses for market research — not sales prospecting. Given the page content, PageSpeed scores, and detected technology, extract objective, verifiable facts about this business's digital presence and apparent maturity. Describe what is true, not what a salesperson could pitch.",
  attributes: [
    {
      id: "has_contact_form",
      label: "Has contact form",
      question: "Does the site have a contact form?",
    },
    {
      id: "has_online_booking",
      label: "Has online booking",
      question: "Does the site support booking or scheduling online?",
    },
  ],
};

export async function getAuditLens(): Promise<AuditLens> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return DEFAULT_AUDIT_LENS;
  try {
    const parsed = JSON.parse(raw) as Partial<AuditLens>;
    return {
      name: parsed.name || DEFAULT_AUDIT_LENS.name,
      systemPrompt: parsed.systemPrompt || DEFAULT_AUDIT_LENS.systemPrompt,
      attributes:
        Array.isArray(parsed.attributes) && parsed.attributes.length > 0
          ? parsed.attributes
          : DEFAULT_AUDIT_LENS.attributes,
    };
  } catch {
    return DEFAULT_AUDIT_LENS;
  }
}

export async function setAuditLens(lens: AuditLens): Promise<void> {
  await setSetting(SETTING_KEY, JSON.stringify(lens));
}
