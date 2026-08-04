import { useEffect, useState } from "react";
import {
  PROVIDERS,
  TASK_KIND_LABELS,
  type ModelRouting,
  type ProviderId,
  type TaskKind,
} from "@/lib/ai/types";
import { listRouting, setRouting } from "@/lib/ai/routing";
import { estimateCostPer1000, formatUsd } from "@/lib/ai/pricing";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function AIModelsPage() {
  const [routing, setRoutingState] = useState<ModelRouting[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    void listRouting().then(setRoutingState);
  }, []);

  async function onChange(taskKind: TaskKind, providerId: ProviderId) {
    const provider = PROVIDERS.find((p) => p.id === providerId)!;
    const modelId = provider.models[0]!.id;
    setSaving(taskKind);
    await setRouting({ taskKind, providerId, modelId });
    setRoutingState(await listRouting());
    setSaving(null);
  }

  async function onModelChange(taskKind: TaskKind, modelId: string) {
    const current = routing.find((r) => r.taskKind === taskKind);
    if (!current) return;
    setSaving(taskKind);
    await setRouting({ ...current, modelId });
    setRoutingState(await listRouting());
    setSaving(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
          AI Models
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Assign a provider per task. Worker tasks default to DeepSeek; writing to Claude.
        </p>
      </div>

      <div className="space-y-4">
        {routing.map((row) => {
          const provider = PROVIDERS.find((p) => p.id === row.providerId);
          const estimate = estimateCostPer1000(row.providerId, row.taskKind);
          const deepseekEst = estimateCostPer1000("deepseek", row.taskKind);
          const savings =
            estimate.cost > 0
              ? Math.round((1 - deepseekEst.cost / estimate.cost) * 100)
              : 0;

          return (
            <Card key={row.taskKind}>
              <CardHeader>
                <CardTitle className="text-base">
                  {TASK_KIND_LABELS[row.taskKind]}
                </CardTitle>
                <CardDescription>
                  Estimated {formatUsd(estimate.cost)} / 1,000 {estimate.unitLabel}
                  {row.providerId !== "deepseek" && savings > 0 && (
                    <span className="ml-2 text-[var(--color-primary)]">
                      · DeepSeek ~{savings}% cheaper
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-sm"
                    value={row.providerId}
                    disabled={saving === row.taskKind}
                    onChange={(e) =>
                      void onChange(row.taskKind, e.target.value as ProviderId)
                    }
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Model</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-sm"
                    value={row.modelId}
                    disabled={saving === row.taskKind}
                    onChange={(e) =>
                      void onModelChange(row.taskKind, e.target.value)
                    }
                  >
                    {(provider?.models ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
