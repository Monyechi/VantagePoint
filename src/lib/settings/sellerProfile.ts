import { getSetting, setSetting } from "@/lib/db/queries";

export type SellerTone = "friendly" | "professional" | "direct" | "casual";

export interface SellerProfile {
  name: string;
  company: string;
  /** What the seller sells / offers. */
  offer: string;
  /** Proof points, credentials, case studies — free text. */
  proofPoints: string;
  tone: SellerTone;
  cta: string;
  bookingLink: string;
  signature: string;
}

export const DEFAULT_SELLER_PROFILE: SellerProfile = {
  name: "",
  company: "",
  offer: "",
  proofPoints: "",
  tone: "professional",
  cta: "Reply to this message to schedule a quick call",
  bookingLink: "",
  signature: "",
};

export const SELLER_TONE_OPTIONS: { value: SellerTone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "direct", label: "Direct" },
  { value: "casual", label: "Casual" },
];

const SETTING_KEY = "seller_profile";

export async function getSellerProfile(): Promise<SellerProfile> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return DEFAULT_SELLER_PROFILE;
  try {
    return { ...DEFAULT_SELLER_PROFILE, ...(JSON.parse(raw) as Partial<SellerProfile>) };
  } catch {
    return DEFAULT_SELLER_PROFILE;
  }
}

export async function setSellerProfile(profile: SellerProfile): Promise<void> {
  await setSetting(SETTING_KEY, JSON.stringify(profile));
}

export function isSellerProfileComplete(profile: SellerProfile): boolean {
  return Boolean(profile.name.trim() && profile.company.trim() && profile.offer.trim());
}

/** Summary of who the seller is, for injection into AI prompts (writing + scoring). */
export function sellerProfileBrief(profile: SellerProfile): string {
  return [
    `Seller name: ${profile.name || "Unknown"}`,
    `Company: ${profile.company || "Unknown"}`,
    `What they sell: ${profile.offer || "Unknown"}`,
    profile.proofPoints && `Proof points / credentials: ${profile.proofPoints}`,
    `Preferred tone: ${profile.tone}`,
    profile.cta && `Call to action: ${profile.cta}`,
    profile.bookingLink && `Booking link: ${profile.bookingLink}`,
  ]
    .filter(Boolean)
    .join("\n");
}
