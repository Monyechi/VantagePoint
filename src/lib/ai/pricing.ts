import type { ProviderId } from "./types";

/** USD per 1M tokens — approximate public pricing for cost estimates */
export const PRICING: Record<
  ProviderId,
  { inputPerM: number; outputPerM: number; label: string }
> = {
  deepseek: { inputPerM: 0.14, outputPerM: 0.28, label: "DeepSeek V4 Flash-class" },
  claude: { inputPerM: 3.0, outputPerM: 15.0, label: "Claude Sonnet" },
  openai: { inputPerM: 0.4, outputPerM: 1.6, label: "GPT-4.1 Mini" },
  gemini: { inputPerM: 0.1, outputPerM: 0.4, label: "Gemini Flash" },
  kimi: { inputPerM: 0.6, outputPerM: 2.5, label: "Kimi" },
  grok: { inputPerM: 0.3, outputPerM: 1.5, label: "Grok Fast" },
};

/** Assumed tokens per task for estimate display */
export const TASK_TOKEN_ASSUMPTIONS: Record<
  string,
  { input: number; output: number; unitLabel: string }
> = {
  website_analysis: { input: 4000, output: 600, unitLabel: "websites" },
  lead_scoring: { input: 800, output: 200, unitLabel: "leads" },
  lead_research: { input: 3000, output: 800, unitLabel: "research jobs" },
  email_writing: { input: 1200, output: 400, unitLabel: "emails" },
  linkedin_writing: { input: 1000, output: 300, unitLabel: "messages" },
  facebook_writing: { input: 1000, output: 300, unitLabel: "messages" },
};

export function estimateCostPer1000(
  providerId: ProviderId,
  taskKind: string,
): { cost: number; unitLabel: string } {
  const price = PRICING[providerId];
  const tokens = TASK_TOKEN_ASSUMPTIONS[taskKind] ?? {
    input: 1500,
    output: 400,
    unitLabel: "tasks",
  };
  const perTask =
    (tokens.input / 1_000_000) * price.inputPerM +
    (tokens.output / 1_000_000) * price.outputPerM;
  return { cost: perTask * 1000, unitLabel: tokens.unitLabel };
}

export function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
