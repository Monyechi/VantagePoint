import { listSearchPresets, saveSearchPreset } from "@/lib/db/queries";
import { INDUSTRIES } from "./offers";
import type { PresetConfig } from "./presetConfig";

/** Rough starting budget band per industry — editable by the user like any preset. */
const INDUSTRY_BUDGET_DEFAULTS: Record<string, string> = {
  software: "5k_25k",
  coaching: "1k_5k",
  marketing: "1k_5k",
  professional_services: "1k_5k",
  home_services: "under_1k",
  health_wellness: "under_1k",
};

export function buildDefaultPresets(): { name: string; config: PresetConfig }[] {
  return INDUSTRIES.map((industry) => {
    const service = industry.services[0]!;
    const config: PresetConfig = {
      industryId: industry.id,
      serviceId: service.id,
      buyerTypeId: service.defaultBuyers[0] ?? "individual",
      intentSignalIds: service.intentSignals,
      countryId: "US",
      stateId: "",
      customRegion: "",
      city: "",
      customIntentSignals: [],
      budgetBandId: INDUSTRY_BUDGET_DEFAULTS[industry.id] ?? "1k_5k",
      companySizeId: "any",
      resultCount: 10,
      extraUrls: "",
      notes: "",
    };
    return { name: `${service.label} — starter`, config };
  });
}

/** Seeds one starter preset per industry the first time the app runs — never
 * overwrites or duplicates once any preset (seeded or user-created) exists. */
export async function ensureDefaultSearchPresets(): Promise<void> {
  const existing = await listSearchPresets();
  if (existing.length > 0) return;
  for (const preset of buildDefaultPresets()) {
    await saveSearchPreset(preset);
  }
}
