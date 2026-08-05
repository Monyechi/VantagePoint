import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createJob,
  createProspectSearch,
  deleteSearchPreset,
  listJobEvents,
  listSearchPresets,
  saveSearchPreset,
  type JobEvent,
  type SearchPreset,
} from "@/lib/db/queries";
import { subscribeJobs } from "@/lib/jobs/runner";
import {
  BUDGET_BANDS,
  BUYER_TYPES,
  COMPANY_SIZES,
  COUNTRIES,
  INDUSTRIES,
  INTENT_SIGNALS,
  MAJOR_US_CITIES,
  US_STATES,
  COUNTRYWIDE_STATE_ID,
  budgetBandLabel,
  buyerTypeLabel,
  buildDeterministicQueries,
  companySizeLabel,
  findService,
  isCountrywideState,
  stateLabel,
  type PresetConfig,
} from "@/lib/taxonomy";

const DEFAULT_INDUSTRY = INDUSTRIES[0]!;
const DEFAULT_SERVICE = DEFAULT_INDUSTRY.services[0]!;
const RESULT_COUNT_OPTIONS = [10, 25, 50];

function serviceDefaults(industryId: string, serviceId: string) {
  const found = findService(industryId, serviceId);
  return {
    buyerTypeId: found?.service.defaultBuyers[0] ?? "individual",
    intentSignalIds: found?.service.intentSignals ?? [],
  };
}

export function ProspectPage() {
  const [industryId, setIndustryId] = useState(DEFAULT_INDUSTRY.id);
  const [serviceId, setServiceId] = useState(DEFAULT_SERVICE.id);
  const [buyerTypeId, setBuyerTypeId] = useState(
    serviceDefaults(DEFAULT_INDUSTRY.id, DEFAULT_SERVICE.id).buyerTypeId,
  );
  const [intentSignalIds, setIntentSignalIds] = useState<string[]>(
    serviceDefaults(DEFAULT_INDUSTRY.id, DEFAULT_SERVICE.id).intentSignalIds,
  );
  const [customIntentSignals, setCustomIntentSignals] = useState<string[]>([]);
  const [customSignalInput, setCustomSignalInput] = useState("");
  const [countryId, setCountryId] = useState("US");
  const [stateId, setStateId] = useState("");
  const [customRegion, setCustomRegion] = useState("");
  const [city, setCity] = useState("");
  const [budgetBandId, setBudgetBandId] = useState(BUDGET_BANDS[0]!.id);
  const [companySizeId, setCompanySizeId] = useState("any");
  const [resultCount, setResultCount] = useState(10);
  const [extraUrls, setExtraUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [sources, setSources] = useState<string[]>(["google"]);

  const [presets, setPresets] = useState<SearchPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listSearchPresets().then(setPresets);
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    const refresh = async () => {
      const ev = await listJobEvents(activeJobId);
      setEvents(ev);
    };
    void refresh();
    return subscribeJobs(() => {
      void refresh();
    });
  }, [activeJobId]);

  const industry = INDUSTRIES.find((i) => i.id === industryId) ?? DEFAULT_INDUSTRY;
  const service = industry.services.find((s) => s.id === serviceId) ?? industry.services[0]!;
  const country = COUNTRIES.find((c) => c.id === countryId) ?? COUNTRIES[0]!;

  function applyServiceDefaults(newIndustryId: string, newServiceId: string) {
    const defaults = serviceDefaults(newIndustryId, newServiceId);
    setServiceId(newServiceId);
    setBuyerTypeId(defaults.buyerTypeId);
    setIntentSignalIds(defaults.intentSignalIds);
  }

  function onIndustryChange(newIndustryId: string) {
    setIndustryId(newIndustryId);
    const firstService = INDUSTRIES.find((i) => i.id === newIndustryId)?.services[0]?.id;
    if (firstService) applyServiceDefaults(newIndustryId, firstService);
  }

  function toggleSource(id: string) {
    setSources((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function toggleIntentSignal(id: string) {
    setIntentSignalIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function addCustomIntentSignal() {
    const trimmed = customSignalInput.trim();
    if (!trimmed) return;
    const exists = customIntentSignals.some(
      (s) => s.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      setCustomSignalInput("");
      return;
    }
    setCustomIntentSignals((prev) => [...prev, trimmed]);
    setCustomSignalInput("");
  }

  function removeCustomIntentSignal(label: string) {
    setCustomIntentSignals((prev) => prev.filter((s) => s !== label));
  }

  function onStateChange(nextStateId: string) {
    setStateId(nextStateId);
    if (isCountrywideState(nextStateId)) setCity("");
  }

  function currentConfig(): PresetConfig {
    return {
      industryId,
      serviceId,
      buyerTypeId,
      intentSignalIds,
      countryId,
      stateId,
      customRegion,
      city,
      customIntentSignals,
      budgetBandId,
      companySizeId,
      resultCount,
      extraUrls,
      notes,
    };
  }

  function applyConfig(config: Partial<PresetConfig>) {
    if (config.industryId) setIndustryId(config.industryId);
    if (config.serviceId) setServiceId(config.serviceId);
    if (config.buyerTypeId) setBuyerTypeId(config.buyerTypeId);
    if (config.intentSignalIds) setIntentSignalIds(config.intentSignalIds);
    setCustomIntentSignals(config.customIntentSignals ?? []);
    setCountryId(config.countryId ?? "US");
    setStateId(config.stateId ?? "");
    setCustomRegion(config.customRegion ?? "");
    setCity(config.city ?? "");
    if (config.budgetBandId) setBudgetBandId(config.budgetBandId);
    setCompanySizeId(config.companySizeId ?? "any");
    setResultCount(config.resultCount ?? 10);
    setExtraUrls(config.extraUrls ?? "");
    setNotes(config.notes ?? "");
  }

  function loadPreset(id: string) {
    setSelectedPresetId(id);
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    try {
      applyConfig(JSON.parse(preset.config_json) as Partial<PresetConfig>);
      setPresetName(preset.name);
    } catch {
      // ignore malformed preset config
    }
  }

  async function savePreset() {
    const name = presetName.trim();
    if (!name) return;
    const existing = presets.find((p) => p.name === name);
    const saved = await saveSearchPreset({ id: existing?.id, name, config: currentConfig() });
    setPresets(await listSearchPresets());
    setSelectedPresetId(saved.id);
  }

  async function removePreset() {
    if (!selectedPresetId) return;
    await deleteSearchPreset(selectedPresetId);
    setSelectedPresetId("");
    setPresetName("");
    setPresets(await listSearchPresets());
  }

  async function startSearch() {
    setError(null);
    if (country.hasStates && !stateId) {
      setError("Pick a state, Country-wide, or choose Global if you don't want to filter by location.");
      return;
    }
    if (intentSignalIds.length === 0 && customIntentSignals.length === 0) {
      setError("Select at least one buying signal, or add a custom one.");
      return;
    }
    setBusy(true);
    try {
      const buyerLabel = buyerTypeLabel(buyerTypeId);
      const niche = `${industry.label} — ${service.label}`;
      const sizeSuffix =
        companySizeId !== "any" ? ` (company size: ${companySizeLabel(companySizeId)})` : "";
      const audience = `${buyerLabel}${sizeSuffix} needing ${service.label}`;
      const ticketSize = budgetBandLabel(budgetBandId);

      const regionLabel = country.hasStates
        ? isCountrywideState(stateId)
          ? ""
          : stateLabel(stateId)
        : customRegion;
      const location =
        countryId === "GLOBAL"
          ? ""
          : [city, regionLabel, country.label].filter(Boolean).join(", ");

      const queries = buildDeterministicQueries(
        intentSignalIds,
        {
          vertical: service.label,
          buyerType: buyerLabel,
          city: isCountrywideState(stateId) ? "" : city,
          state: regionLabel,
          country: country.label,
        },
        customIntentSignals,
      );

      const queryText = [niche, location, audience, ticketSize].filter(Boolean).join(" · ");

      const search = await createProspectSearch({
        queryText,
        niche,
        location,
        audience,
        ticketSize,
        sources,
        extraUrls,
      });
      const job = await createJob({
        type: "prospect_search",
        searchId: search.id,
        payload: {
          searchId: search.id,
          queryText,
          niche,
          location,
          audience,
          ticketSize,
          sources,
          extraUrls,
          maxResults: resultCount,
          queries,
          notes,
        },
      });
      setActiveJobId(job.id);
      setEvents([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
          Prospect Search
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Pick who you're looking for. The AI BDR finds buyers who may need it — not
          competitors in your niche.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saved searches</CardTitle>
          <CardDescription>Load a preset, or save the current setup for next time.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label>Preset</Label>
            <Select value={selectedPresetId} onValueChange={loadPreset}>
              <SelectTrigger>
                <SelectValue placeholder={presets.length ? "Load a saved search…" : "No saved searches yet"} />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px] flex-1 space-y-1.5">
            <Label>Save as</Label>
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g. Austin web dev leads"
            />
          </div>
          <Button variant="secondary" onClick={() => void savePreset()} disabled={!presetName.trim()}>
            Save preset
          </Button>
          <Button variant="ghost" onClick={() => void removePreset()} disabled={!selectedPresetId}>
            Delete
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who are you looking for?</CardTitle>
          <CardDescription>
            Example: pick relationship coaching + individuals to hunt for people who want a
            coach — not other coaches.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Industry</Label>
            <Select value={industryId} onValueChange={onIndustryChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select value={serviceId} onValueChange={(v) => applyServiceDefaults(industryId, v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {industry.services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Buyer type</Label>
            <Select value={buyerTypeId} onValueChange={setBuyerTypeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUYER_TYPES.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Company size</Label>
            <Select value={companySizeId} onValueChange={setCompanySizeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_SIZES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Buying signals to search for</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {service.intentSignals.map((signalId) => {
                const signal = INTENT_SIGNALS[signalId];
                if (!signal) return null;
                const on = intentSignalIds.includes(signalId);
                return (
                  <button
                    key={signalId}
                    type="button"
                    title={signal.description}
                    onClick={() => toggleIntentSignal(signalId)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      on
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                    }`}
                  >
                    {signal.label}
                  </button>
                );
              })}
              {customIntentSignals.map((label) => (
                <button
                  key={label}
                  type="button"
                  title="Custom buying signal — click to remove"
                  onClick={() => removeCustomIntentSignal(label)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-primary)] bg-[var(--color-primary)]/15 px-3 py-1.5 text-xs text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/25"
                >
                  {label}
                  <span aria-hidden className="opacity-70">
                    ×
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Input
                value={customSignalInput}
                onChange={(e) => setCustomSignalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomIntentSignal();
                  }
                }}
                placeholder="Add a custom signal, e.g. recently rebranded"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addCustomIntentSignal}
                disabled={!customSignalInput.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Country</Label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {countryId !== "GLOBAL" && (
            <>
              <div className="space-y-1.5">
                <Label>{country.hasStates ? "State" : "Region"}</Label>
                {country.hasStates ? (
                  <Select value={stateId} onValueChange={onStateChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a state" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={COUNTRYWIDE_STATE_ID}>Country-wide</SelectItem>
                      {US_STATES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={customRegion}
                    onChange={(e) => setCustomRegion(e.target.value)}
                    placeholder={`Region within ${country.label} (optional)`}
                  />
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className={isCountrywideState(stateId) ? "text-[var(--color-muted-foreground)]" : undefined}>
                  City (optional)
                </Label>
                <Input
                  list="major-us-cities"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={country.hasStates && isCountrywideState(stateId)}
                  placeholder={
                    country.hasStates && isCountrywideState(stateId)
                      ? "Not used for country-wide searches"
                      : "Leave blank to search the whole state/region"
                  }
                />
                <datalist id="major-us-cities">
                  {MAJOR_US_CITIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Client budget</Label>
            <Select value={budgetBandId} onValueChange={setBudgetBandId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUDGET_BANDS.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Result count</Label>
            <div className="flex gap-2 pt-1">
              {RESULT_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setResultCount(n)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    resultCount === n
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Sources</Label>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="success">Google</Badge>
              <button
                type="button"
                onClick={() => toggleSource("reddit")}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  sources.includes("reddit")
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                }`}
              >
                Reddit
              </button>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                LinkedIn, Facebook — coming soon
              </span>
            </div>
            {sources.includes("reddit") && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Needs a Reddit key in Connectors — searches public posts for buyer-intent
                language ("looking for", "need", "recommend").
              </p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Extra prospect URLs (optional, one per line)</Label>
            <Textarea
              rows={3}
              placeholder="Paste specific company or person pages to score as potential clients"
              value={extraUrls}
              onChange={(e) => setExtraUrls(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Anything else? (optional)</Label>
            <Textarea
              rows={2}
              placeholder="Any detail the dropdowns above don't capture"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <Button onClick={() => void startSearch()} disabled={busy}>
              {busy ? "Queuing…" : "Find Leads"}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-[var(--color-destructive)] sm:col-span-2">{error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live activity</CardTitle>
          <CardDescription>
            {activeJobId ? (
              <span className="inline-flex items-center gap-2">
                Job <Badge variant="muted">{activeJobId.slice(0, 8)}</Badge>
              </span>
            ) : (
              "Start a search to see progress"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No events yet. Searching… Analyzing… Scoring leads…
            </p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-auto font-mono text-xs">
              {events.map((e) => (
                <li
                  key={e.id}
                  className={
                    e.level === "error"
                      ? "text-[var(--color-destructive)]"
                      : e.level === "warn"
                        ? "text-[var(--color-warning)]"
                        : "text-[var(--color-muted-foreground)]"
                  }
                >
                  <span className="opacity-60">
                    {new Date(e.created_at).toLocaleTimeString()}
                  </span>{" "}
                  {e.message}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
