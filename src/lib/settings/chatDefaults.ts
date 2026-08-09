import { getSetting, setSetting } from "@/lib/db/queries";

/** User-configurable defaults the chat agent falls back to instead of asking every
 * time — e.g. "always assume Orlando unless I say otherwise." All optional; an unset
 * field just means the agent asks (or infers from the seller profile) as usual. */
export interface ChatDefaults {
  /** Default prospect_search taxonomy selection (src/lib/taxonomy). */
  industryId?: string;
  serviceId?: string;
  /** Default location, shared by both pipelines. */
  location?: string;
  /** Default local_business_search business type (free text, matches
   * LocalBusinessHunterPage's businessType input). */
  businessType?: string;
}

export const DEFAULT_CHAT_DEFAULTS: ChatDefaults = {};

const SETTING_KEY = "chat_defaults";

export async function getChatDefaults(): Promise<ChatDefaults> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return DEFAULT_CHAT_DEFAULTS;
  try {
    return { ...DEFAULT_CHAT_DEFAULTS, ...(JSON.parse(raw) as Partial<ChatDefaults>) };
  } catch {
    return DEFAULT_CHAT_DEFAULTS;
  }
}

export async function setChatDefaults(defaults: ChatDefaults): Promise<void> {
  await setSetting(SETTING_KEY, JSON.stringify(defaults));
}
