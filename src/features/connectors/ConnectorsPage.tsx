import { useEffect, useState } from "react";
import { testSerpApiKey, type KeyTestResult } from "@/lib/ai/testKey";
import {
  testBraveKey,
  testGooglePlacesKey,
  testHunterKey,
  testPageSpeedKey,
  testRedditKey,
  testTavilyKey,
} from "@/lib/connectors/testConnector";
import { getFromAddress, setFromAddress } from "@/lib/connectors/email";
import { CONNECTOR_CATEGORY_LABELS } from "@/lib/connectors/types";
import { connectorsByCategory } from "@/lib/connectors/registry";
import { getApiKey, setApiKey } from "@/lib/db/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const KEYED_CONNECTOR_IDS = [
  "serp",
  "tavily",
  "brave",
  "resend",
  "google_places",
  "google_pagespeed",
  "hunter",
  "apollo",
  "people_data_labs",
  "snov",
  "reddit",
];

const EMAIL_PROVIDER_IDS = new Set(["resend"]);

const TESTERS: Record<string, () => Promise<KeyTestResult>> = {
  serp: testSerpApiKey,
  tavily: testTavilyKey,
  brave: testBraveKey,
  google_places: testGooglePlacesKey,
  google_pagespeed: testPageSpeedKey,
  hunter: testHunterKey,
  reddit: testRedditKey,
};

export function ConnectorsPage() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [fromAddresses, setFromAddresses] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, KeyTestResult>>({});

  useEffect(() => {
    void (async () => {
      const nextKeys: Record<string, string> = {};
      const nextSaved: Record<string, boolean> = {};
      for (const id of KEYED_CONNECTOR_IDS) {
        const v = await getApiKey(id);
        if (v) {
          nextKeys[id] = v;
          nextSaved[id] = true;
        }
      }
      setKeys(nextKeys);
      setSavedKeys(nextSaved);

      const nextFrom: Record<string, string> = {};
      for (const id of EMAIL_PROVIDER_IDS) {
        nextFrom[id] = await getFromAddress(id);
      }
      setFromAddresses(nextFrom);
    })();
  }, []);

  function clearTestResult(id: string) {
    setTestResults((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveKey(id: string) {
    const trimmed = keys[id]?.trim() ?? "";
    await setApiKey(id, trimmed);
    setSavedKeys((prev) => ({ ...prev, [id]: Boolean(trimmed) }));
    clearTestResult(id);
    setSaved(id);
    setTimeout(() => setSaved(null), 1500);
  }

  async function saveFromAddress(providerId: string) {
    await setFromAddress(providerId, fromAddresses[providerId] ?? "");
    setSaved(`${providerId}-from`);
    setTimeout(() => setSaved(null), 1500);
  }

  async function test(id: string) {
    const tester = TESTERS[id];
    if (!tester) return;
    setTesting(id);
    clearTestResult(id);
    try {
      // Persist the input value first so Test always exercises what's on screen,
      // not a previously saved (and possibly rejected) key.
      const trimmed = keys[id]?.trim() ?? "";
      await setApiKey(id, trimmed);
      setSavedKeys((prev) => ({ ...prev, [id]: Boolean(trimmed) }));
      const result = await tester();
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, message: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
          Connectors
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          AI is the brain — connectors are how work actually gets done. Add keys for the ones you
          use; free connectors work automatically.
        </p>
      </div>

      {connectorsByCategory()
        .filter(({ connectors }) => connectors.length > 0)
        .map(({ category, connectors }) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="text-base">{CONNECTOR_CATEGORY_LABELS[category]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {connectors.map((connector) => {
                const needsKey = connector.requiresKey !== false;
                const hasKey = savedKeys[connector.id];
                const isEmailProvider = EMAIL_PROVIDER_IDS.has(connector.id);
                return (
                  <div
                    key={connector.id}
                    className="space-y-1.5 border-b border-[var(--color-border)] pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{connector.name}</div>
                        <div className="text-xs text-[var(--color-muted-foreground)]">
                          {connector.description}
                        </div>
                      </div>
                      <Badge variant={needsKey && !hasKey ? "warning" : "success"}>
                        {needsKey ? (hasKey ? "Connected" : "Needs key") : "Active"}
                      </Badge>
                    </div>

                    {!needsKey && (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        No key needed — works automatically.
                      </p>
                    )}

                    {needsKey && (
                      <>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            autoComplete="off"
                            placeholder={
                              connector.id === "reddit" || connector.id === "snov"
                                ? "client_id:client_secret"
                                : `Enter ${connector.name} API key`
                            }
                            value={keys[connector.id] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setKeys((prev) => ({ ...prev, [connector.id]: value }));
                              clearTestResult(connector.id);
                            }}
                          />
                          <Button variant="secondary" onClick={() => void saveKey(connector.id)}>
                            {saved === connector.id ? "Saved" : "Save"}
                          </Button>
                          {TESTERS[connector.id] && (
                            <Button
                              variant="outline"
                              disabled={!keys[connector.id]?.trim() || testing === connector.id}
                              onClick={() => void test(connector.id)}
                            >
                              {testing === connector.id ? "Testing…" : "Test"}
                            </Button>
                          )}
                        </div>

                        {isEmailProvider && (
                          <div className="flex gap-2 pt-1">
                            <Input
                              placeholder='"From" address, e.g. you@yourdomain.com'
                              value={fromAddresses[connector.id] ?? ""}
                              onChange={(e) =>
                                setFromAddresses((prev) => ({
                                  ...prev,
                                  [connector.id]: e.target.value,
                                }))
                              }
                            />
                            <Button
                              variant="secondary"
                              onClick={() => void saveFromAddress(connector.id)}
                            >
                              {saved === `${connector.id}-from` ? "Saved" : "Save"}
                            </Button>
                          </div>
                        )}

                        {connector.testCaveat && (
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            {connector.testCaveat}
                          </p>
                        )}

                        {testResults[connector.id] && (
                          <p
                            className={`text-xs ${
                              testResults[connector.id]!.ok
                                ? "text-[var(--color-success)]"
                                : "text-[var(--color-destructive)]"
                            }`}
                          >
                            {testResults[connector.id]!.ok ? "✓ " : "✗ "}
                            {testResults[connector.id]!.message}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
