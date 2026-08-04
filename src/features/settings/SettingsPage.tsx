import { useEffect, useState } from "react";
import { PROVIDERS, type ProviderId } from "@/lib/ai/types";
import { testProviderKey, type KeyTestResult } from "@/lib/ai/testKey";
import { getApiKey, listApiKeys, setApiKey } from "@/lib/db/queries";
import {
  DEFAULT_SELLER_PROFILE,
  SELLER_TONE_OPTIONS,
  getSellerProfile,
  isSellerProfileComplete,
  setSellerProfile,
  type SellerProfile,
  type SellerTone,
} from "@/lib/settings/sellerProfile";
import { getTheme, setTheme, type Theme } from "@/lib/settings/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsPage() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ provider: string; hasKey: boolean }[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, KeyTestResult>>({});

  const [profile, setProfile] = useState<SellerProfile>(DEFAULT_SELLER_PROFILE);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileWasComplete, setProfileWasComplete] = useState(true);

  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    void (async () => {
      setStatus(await listApiKeys());
      const next: Record<string, string> = {};
      for (const p of PROVIDERS.map((x) => x.id)) {
        const v = await getApiKey(p);
        if (v) next[p] = v;
      }
      setKeys(next);

      const loadedProfile = await getSellerProfile();
      setProfile(loadedProfile);
      setProfileWasComplete(isSellerProfileComplete(loadedProfile));

      setThemeState(await getTheme());
    })();
  }, []);

  async function changeTheme(next: Theme) {
    setThemeState(next);
    await setTheme(next);
  }

  async function save(provider: string) {
    await setApiKey(provider, keys[provider]?.trim() ?? "");
    setStatus(await listApiKeys());
    setSaved(provider);
    setTimeout(() => setSaved(null), 1500);
  }

  async function testKey(provider: string) {
    setTesting(provider);
    try {
      const result = await testProviderKey(provider as ProviderId);
      setTestResults((prev) => ({ ...prev, [provider]: result }));
    } finally {
      setTesting(null);
    }
  }

  function updateProfile<K extends keyof SellerProfile>(key: K, value: SellerProfile[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  async function saveProfile() {
    await setSellerProfile(profile);
    setProfileWasComplete(isSellerProfileComplete(profile));
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1500);
  }

  const rows: { id: string; name: string; hint?: string }[] = PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Bring your own keys (BYOK). Stored securely in your OS keychain.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose a color theme, or follow your system setting.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={(v) => void changeTheme(v as Theme)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!profileWasComplete && (
        <Card className="border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5">
          <CardContent className="py-4 text-sm">
            <span className="font-medium">Welcome to ClientPilot.</span> Fill in your Seller
            Profile below so outreach and lead scoring know who you are — otherwise your drafts
            will read like they came from nobody in particular.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Seller Profile</CardTitle>
          <CardDescription>
            Who you are, what you sell, and how outreach should sound. Used in every draft and
            in lead scoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Your name</Label>
            <Input
              id="profile-name"
              value={profile.name}
              onChange={(e) => updateProfile("name", e.target.value)}
              placeholder="Jordan Smith"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-company">Company</Label>
            <Input
              id="profile-company"
              value={profile.company}
              onChange={(e) => updateProfile("company", e.target.value)}
              placeholder="Acme Studio"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="profile-offer">What you sell / offer</Label>
            <Input
              id="profile-offer"
              value={profile.offer}
              onChange={(e) => updateProfile("offer", e.target.value)}
              placeholder="e.g. Relationship coaching, Website & app development"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="profile-proof">Proof points / credentials</Label>
            <Textarea
              id="profile-proof"
              rows={3}
              value={profile.proofPoints}
              onChange={(e) => updateProfile("proofPoints", e.target.value)}
              placeholder="Case studies, years of experience, notable clients, certifications..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-tone">Tone</Label>
            <select
              id="profile-tone"
              className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-sm"
              value={profile.tone}
              onChange={(e) => updateProfile("tone", e.target.value as SellerTone)}
            >
              {SELLER_TONE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-cta">Call to action</Label>
            <Input
              id="profile-cta"
              value={profile.cta}
              onChange={(e) => updateProfile("cta", e.target.value)}
              placeholder="Reply to schedule a quick call"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="profile-booking">Booking link (optional)</Label>
            <Input
              id="profile-booking"
              value={profile.bookingLink}
              onChange={(e) => updateProfile("bookingLink", e.target.value)}
              placeholder="https://cal.com/you"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="profile-signature">Signature</Label>
            <Textarea
              id="profile-signature"
              rows={3}
              value={profile.signature}
              onChange={(e) => updateProfile("signature", e.target.value)}
              placeholder={"Jordan Smith\nAcme Studio\nyou@acme.com"}
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => void saveProfile()}>
              {profileSaved ? "Saved" : "Save Seller Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI provider keys</CardTitle>
          <CardDescription>
            DeepSeek for volume work, Claude for outreach writing. Search and email keys
            (SerpAPI, Tavily, Brave, Resend) live on the Connectors page.
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
                  <Button
                    variant="outline"
                    disabled={!has || testing === row.id}
                    onClick={() => void testKey(row.id)}
                  >
                    {testing === row.id ? "Testing…" : "Test"}
                  </Button>
                </div>
                {testResults[row.id] && (
                  <p
                    className={`text-xs ${
                      testResults[row.id]!.ok
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-destructive)]"
                    }`}
                  >
                    {testResults[row.id]!.ok ? "✓ " : "✗ "}
                    {testResults[row.id]!.message}
                  </p>
                )}
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
            No search connector configured? Paste target websites into Prospect Search →
            Extra URLs to still run analyze + score.
          </p>
          <p>
            Change per-task providers on the AI Models page without touching code.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
