import { PROVIDERS, type ProviderId } from "./types";

/** Assumed tokens per task for estimate display. website_analysis now covers the merged
 * analyze+score call, so its output assumption includes the score/reasons fields. */
export const TASK_TOKEN_ASSUMPTIONS: Record<
  string,
  { input: number; output: number; unitLabel: string }
> = {
  website_analysis: { input: 4000, output: 750, unitLabel: "websites" },
  lead_research: { input: 3000, output: 800, unitLabel: "research jobs" },
  email_writing: { input: 1200, output: 400, unitLabel: "emails" },
  linkedin_writing: { input: 1000, output: 300, unitLabel: "messages" },
  facebook_writing: { input: 1000, output: 300, unitLabel: "messages" },
};

export function estimateCostPer1000(
  providerId: ProviderId,
  modelId: string,
  taskKind: string,
): { cost: number; unitLabel: string } {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  const inputPerM = model?.inputPerM ?? 1;
  const outputPerM = model?.outputPerM ?? 3;
  const tokens = TASK_TOKEN_ASSUMPTIONS[taskKind] ?? {
    input: 1500,
    output: 400,
    unitLabel: "tasks",
  };
  const perTask =
    (tokens.input / 1_000_000) * inputPerM + (tokens.output / 1_000_000) * outputPerM;
  return { cost: perTask * 1000, unitLabel: tokens.unitLabel };
}

export function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
