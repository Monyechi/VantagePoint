import { useEffect, useState } from "react";
import { PROVIDERS } from "@/lib/ai/types";
import { getApiKey, listApiKeys, setApiKey } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const EXTRA = [
  {
    id: "serp" as const,
    name: "SerpAPI",
    hint: "Required for Google prospect search (or paste Extra URLs instead)",
  },
];

export function SettingsPage() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ provider: string; hasKey: boolean }[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setStatus(await listApiKeys());
      const next: Record<string, string> = {};
      for (const p of [...PROVIDERS.map((x) => x.id), "serp"]) {
        const v = await getApiKey(p);
        if (v) next[p] = v;
      }
      setKeys(next);
    })();
  }, []);

  async function save(provider: string) {
    await setApiKey(provider, keys[provider]?.trim() ?? "");
    setStatus(await listApiKeys());
    setSaved(provider);
    setTimeout(() => setSaved(null), 1500);
  }

  const rows: { id: string; name: string; hint?: string }[] = [
    ...PROVIDERS.map((p) => ({ id: p.id, name: p.name })),
    ...EXTRA,
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Bring your own keys (BYOK). Stored locally in SQLite on this machine.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            DeepSeek for volume work, Claude for outreach writing, SerpAPI for Google search
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {rows.map((row) => {
            const has = status.find((s) => s.provider === row.id)?.hasKey;
            return (
              <div key={row.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={row.id}>{row.name}</Label>
                  <Badge variant={has ? "success" : "muted"}>
                    {has ? "Saved" : "Missing"}
                  </Badge>
                </div>
                {row.hint && (
                  <p className="text-xs text-[var(--color-muted-foreground)]">{row.hint}</p>
                )}
                <div className="flex gap-2">
                  <Input
                    id={row.id}
                    type="password"
                    autoComplete="off"
                    placeholder={`Enter ${row.name} API key`}
                    value={keys[row.id] ?? ""}
                    onChange={(e) =>
                      setKeys((prev) => ({ ...prev, [row.id]: e.target.value }))
                    }
                  />
                  <Button variant="secondary" onClick={() => void save(row.id)}>
                    {saved === row.id ? "Saved" : "Save"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--color-muted-foreground)]">
          <p>
            Without SerpAPI, paste target websites into Prospect Search → Extra URLs to
            still run analyze + score.
          </p>
          <p>
            Change per-task providers on the AI Models page without touching code.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
