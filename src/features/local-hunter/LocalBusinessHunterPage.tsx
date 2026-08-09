import { useEffect, useMemo, useState } from "react";
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
import { DuplicateSearchNotice } from "@/components/search/DuplicateSearchNotice";
import {
  createJob,
  createProspectSearch,
  listJobEvents,
  getMarketSnapshotBySearchId,
  listMarketEntitiesBySnapshot,
  type JobEvent,
  type MarketEntity,
  type MarketSnapshot,
} from "@/lib/db/queries";
import { subscribeJobs } from "@/lib/jobs/runner";
import {
  BROAD_BUSINESS_TYPE,
  businessTypeLabel,
  DEFAULT_MAX_PLACES_CALLS,
  PLACES_CALL_COST_USD,
} from "@/lib/jobs/localBusinessPipeline";
import { geocodeLocation } from "@/lib/connectors/places";
import { checkLocalBusinessLedger, type LedgerMatch } from "@/lib/jobs/searchLedger";
import { computeMarketStats } from "@/lib/analysis/marketStats";
import { downloadCsv } from "@/lib/export/csv";
import { getAuditLens, type AuditLensAttribute } from "@/lib/settings/auditLens";

const BUSINESS_TYPE_SUGGESTIONS = [
  "Dentist",
  "Plumber",
  "Electrician",
  "Restaurant",
  "Hair salon",
  "Auto repair shop",
  "Roofing contractor",
  "Law firm",
  "Accounting firm",
  "Real estate agent",
  "HVAC contractor",
  "Landscaper",
  "Chiropractor",
  "Veterinarian",
  "General contractor",
  "Insurance agency",
];

const RADIUS_OPTIONS = [5, 10, 15, 25];
// Places calls this sweep is allowed to spend, tiling to cover the radius as
// thoroughly as the budget allows. See DEFAULT_MAX_PLACES_CALLS / PLACES_CALL_COST_USD.
const SEARCH_BUDGET_OPTIONS = [20, 40, 80, 150];

const DETERMINISTIC_FLAG_LABELS: Record<string, string> = {
  no_website: "No Website",
  outdated_builder: "Outdated Website",
  slow: "Slow Website",
  no_ssl: "No SSL",
  poor_accessibility: "Accessibility Issues",
  thin_site: "Thin / Sparse Site",
  ai_profiling_failed: "Needs Manual Review",
};

// Attribute questions that come back false read oddly with a blanket "No " prefix
// ("No Has contact form") — these two ship with the default lens, so give them a
// human label; anything from a custom lens falls back to "<label>: No".
const ATTRIBUTE_FALSE_LABELS: Record<string, string> = {
  has_contact_form: "No Contact Form",
  has_online_booking: "No Online Booking",
};

interface LaunchInput {
  effectiveBusinessType: string;
  typeLabel: string;
  queryText: string;
  center: { lat: number; lng: number };
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseAttributes(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

function entityFlagLabels(entity: MarketEntity, lensAttributes: AuditLensAttribute[]): string[] {
  const deterministic = parseStringArray(entity.deterministic_flags).map(
    (id) => DETERMINISTIC_FLAG_LABELS[id] ?? id,
  );
  const attrs = parseAttributes(entity.attributes_json);
  const attributeFlags = Object.entries(attrs)
    .filter(([, value]) => value === false)
    .map(
      ([id]) =>
        ATTRIBUTE_FALSE_LABELS[id] ?? `${lensAttributes.find((a) => a.id === id)?.label ?? id}: No`,
    );
  return [...deterministic, ...attributeFlags];
}

function maturityVariant(score: number | null): "success" | "warning" | "muted" {
  if (score === null) return "muted";
  if (score >= 70) return "success";
  if (score >= 40) return "warning";
  return "muted";
}

export function LocalBusinessHunterPage() {
  const [location, setLocation] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [broadBusinessType, setBroadBusinessType] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(10);
  const [maxPlacesCalls, setMaxPlacesCalls] = useState(DEFAULT_MAX_PLACES_CALLS);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [entities, setEntities] = useState<MarketEntity[]>([]);
  const [lensAttributes, setLensAttributes] = useState<AuditLensAttribute[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingMatch, setPendingMatch] = useState<LedgerMatch | null>(null);
  const [pendingLaunch, setPendingLaunch] = useState<LaunchInput | null>(null);

  useEffect(() => {
    void getAuditLens().then((lens) => setLensAttributes(lens.attributes));
  }, []);

  useEffect(() => {
    if (!activeJobId) {
      setEvents([]);
      return;
    }
    const refresh = async () => setEvents(await listJobEvents(activeJobId));
    void refresh();
    return subscribeJobs(() => {
      void refresh();
    });
  }, [activeJobId]);

  useEffect(() => {
    if (!activeSearchId) {
      setSnapshot(null);
      setEntities([]);
      return;
    }
    const refresh = async () => {
      const snap = await getMarketSnapshotBySearchId(activeSearchId);
      setSnapshot(snap);
      setEntities(snap ? await listMarketEntitiesBySnapshot(snap.id) : []);
    };
    void refresh();
    return subscribeJobs(() => {
      void refresh();
    });
  }, [activeSearchId]);

  const stats = useMemo(() => computeMarketStats(entities), [entities]);
  const maxMaturityBucket = Math.max(1, ...stats.digitalMaturityBuckets.map((b) => b.count));

  async function launchSearch(input: LaunchInput) {
    const search = await createProspectSearch({
      queryText: input.queryText,
      jobType: "local_business_search",
      niche: input.typeLabel,
      location,
      sources: ["google_places"],
      lat: input.center.lat,
      lng: input.center.lng,
      radiusMiles,
    });
    const job = await createJob({
      type: "local_business_search",
      searchId: search.id,
      payload: {
        searchId: search.id,
        queryText: input.queryText,
        location,
        businessType: input.effectiveBusinessType,
        radiusMiles,
        maxPlacesCalls,
        center: input.center,
      },
    });
    setActiveJobId(job.id);
    setActiveSearchId(search.id);
    setPendingMatch(null);
    setPendingLaunch(null);
  }

  async function startSearch() {
    setError(null);
    if (!location.trim()) {
      setError("Enter a city or location.");
      return;
    }
    if (!broadBusinessType && !businessType.trim()) {
      setError("Enter a business type, or choose All business types.");
      return;
    }
    setBusy(true);
    try {
      const effectiveBusinessType = broadBusinessType
        ? BROAD_BUSINESS_TYPE
        : businessType.trim();
      const typeLabel = businessTypeLabel(effectiveBusinessType);
      const queryText = `${typeLabel} near ${location}`;

      // Geocode client-side (rather than letting the job do it) so an unfindable
      // location fails fast in the form, and so we have a center point to run the
      // ledger check against before spinning up a job at all.
      const center = await geocodeLocation(location);
      const launchInput: LaunchInput = { effectiveBusinessType, typeLabel, queryText, center };

      const match = await checkLocalBusinessLedger({ businessTypeLabel: typeLabel, center, radiusMiles });
      if (match) {
        setPendingMatch(match);
        setPendingLaunch(launchInput);
        return;
      }

      await launchSearch(launchInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSearchAgain() {
    if (!pendingLaunch) return;
    setError(null);
    setBusy(true);
    try {
      await launchSearch(pendingLaunch);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleDismissMatch() {
    setPendingMatch(null);
    setPendingLaunch(null);
  }

  function handleViewExisting() {
    if (!pendingMatch) return;
    setPendingMatch(null);
    setPendingLaunch(null);
    setActiveJobId(null);
    setActiveSearchId(pendingMatch.search.id);
  }

  function handleExportCsv() {
    const columns = [
      { key: "name", label: "Business" },
      { key: "address", label: "Address" },
      { key: "phone", label: "Phone" },
      { key: "website", label: "Website" },
      { key: "rating", label: "Rating" },
      { key: "reviewCount", label: "Reviews" },
      { key: "locationCount", label: "Locations" },
      { key: "domainAgeYears", label: "Domain Age (yrs)" },
      { key: "digitalMaturityScore", label: "Digital Maturity (0-100)" },
      { key: "techStack", label: "Technology" },
      { key: "flags", label: "Flags" },
      { key: "contactName", label: "Contact" },
      { key: "email", label: "Email" },
      { key: "summary", label: "Summary" },
    ];
    const rows = entities.map((e) => ({
      name: e.name,
      address: e.address ?? "",
      phone: e.phone ?? "",
      website: e.website ?? "",
      rating: e.rating ?? "",
      reviewCount: e.review_count ?? "",
      locationCount: e.location_count,
      domainAgeYears: e.domain_age_years ?? "",
      digitalMaturityScore: e.digital_maturity_score ?? "",
      techStack: parseStringArray(e.tech_stack).join("; "),
      flags: entityFlagLabels(e, lensAttributes).join("; "),
      contactName: e.contact_name ?? "",
      email: e.email ?? "",
      summary: e.summary ?? "",
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`market-sweep-${stamp}.csv`, columns, rows);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
          Market Sweep
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Enumerate every business of a type within a radius via Google Places, and profile
          each one's digital presence and maturity — a market dataset, not a sales list.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sweep</CardTitle>
          <CardDescription>
            Uses Google Places + PageSpeed — add keys in Connectors first.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>City / location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Dallas, TX"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Business type</Label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setBroadBusinessType((prev) => !prev);
                  if (!broadBusinessType) setBusinessType("");
                }}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  broadBusinessType
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                }`}
              >
                All types
              </button>
              <Input
                list="business-type-suggestions"
                value={businessType}
                onChange={(e) => {
                  setBusinessType(e.target.value);
                  if (e.target.value.trim()) setBroadBusinessType(false);
                }}
                disabled={broadBusinessType}
                placeholder={broadBusinessType ? "Searching all business types" : "Dentist"}
                className="flex-1"
              />
            </div>
            <datalist id="business-type-suggestions">
              {BUSINESS_TYPE_SUGGESTIONS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label>Radius</Label>
            <div className="flex gap-2 pt-1">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadiusMiles(r)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    radiusMiles === r
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {r} mi
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Search budget</Label>
            <div className="flex gap-2 pt-1">
              {SEARCH_BUDGET_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxPlacesCalls(n)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    maxPlacesCalls === n
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Tiles the radius across up to {maxPlacesCalls} Google Places calls (~$
              {(maxPlacesCalls * PLACES_CALL_COST_USD).toFixed(2)}) to cover dense areas that a
              single search would miss. Raise this if results come back marked partial coverage.
            </p>
          </div>

          <div className="flex items-end sm:col-span-2">
            <Button onClick={() => void startSearch()} disabled={busy}>
              {busy ? "Queuing…" : "Sweep Market"}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-[var(--color-destructive)] sm:col-span-2">{error}</p>
          )}
          {pendingMatch && pendingLaunch && (
            <div className="sm:col-span-2">
              <DuplicateSearchNotice
                match={pendingMatch}
                what={`${pendingLaunch.typeLabel} near ${location}`}
                onSearchAgain={() => void handleSearchAgain()}
                onViewLeads={handleViewExisting}
                onDismiss={handleDismissMatch}
                busy={busy}
                entityLabel="business"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {entities.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Market snapshot</CardTitle>
                <CardDescription>
                  {stats.totalCount} business{stats.totalCount === 1 ? "" : "es"}
                  {stats.totalLocationCount !== stats.totalCount
                    ? ` (${stats.totalLocationCount} locations)`
                    : ""}
                  {snapshot && (
                    <>
                      {" "}
                      ·{" "}
                      <span
                        className={
                          snapshot.coverage_complete
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-warning)]"
                        }
                      >
                        {snapshot.coverage_complete ? "coverage complete" : "coverage partial"}
                      </span>{" "}
                      · {snapshot.places_call_count ?? 0} Places call(s)
                    </>
                  )}
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={handleExportCsv}>
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="text-xs text-[var(--color-muted-foreground)]">No website</div>
                <div className="text-lg font-semibold">{stats.pctNoWebsite}%</div>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="text-xs text-[var(--color-muted-foreground)]">Avg rating</div>
                <div className="text-lg font-semibold">{stats.avgRating ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="text-xs text-[var(--color-muted-foreground)]">Avg reviews</div>
                <div className="text-lg font-semibold">{stats.avgReviewCount ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="text-xs text-[var(--color-muted-foreground)]">Multi-location</div>
                <div className="text-lg font-semibold">{stats.chainCount}</div>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
                Digital maturity distribution
              </div>
              <div className="space-y-1">
                {stats.digitalMaturityBuckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-[var(--color-muted-foreground)]">{b.label}</span>
                    <div className="h-3 flex-1 rounded bg-[var(--color-muted)]/60">
                      <div
                        className="h-3 rounded bg-[var(--color-primary)]"
                        style={{ width: `${(b.count / maxMaturityBucket) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.deterministicFlagCounts).map(([id, count]) => (
                <Badge key={id} variant="warning">
                  {count} {DETERMINISTIC_FLAG_LABELS[id] ?? id}
                </Badge>
              ))}
              {Object.entries(stats.attributeFalseCounts).map(([id, count]) => (
                <Badge key={id} variant="warning">
                  {count} {ATTRIBUTE_FALSE_LABELS[id] ?? `${lensAttributes.find((a) => a.id === id)?.label ?? id}: No`}
                </Badge>
              ))}
            </div>

            <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-muted)]/60 text-xs text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Business</th>
                    <th className="px-3 py-2 font-medium">Rating</th>
                    <th className="px-3 py-2 font-medium">Digital maturity</th>
                    <th className="px-3 py-2 font-medium">Domain age</th>
                    <th className="px-3 py-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map((entity) => (
                    <tr key={entity.id} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2.5">
                        <div className="font-medium">
                          {entity.name || "—"}
                          {entity.location_count > 1 ? ` (${entity.location_count} locations)` : ""}
                        </div>
                        <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                          {entity.website || entity.phone || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-muted-foreground)]">
                        {entity.rating ? `${entity.rating}★ (${entity.review_count ?? 0})` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={maturityVariant(entity.digital_maturity_score)}>
                          {entity.digital_maturity_score ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-muted-foreground)]">
                        {entity.domain_age_years !== null ? `${entity.domain_age_years} yr(s)` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted-foreground)]">
                        {entityFlagLabels(entity, lensAttributes).join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Live activity</CardTitle>
          <CardDescription>
            {activeJobId ? (
              <span className="inline-flex items-center gap-2">
                Job <Badge variant="muted">{activeJobId.slice(0, 8)}</Badge>
              </span>
            ) : (
              "Start a sweep to see progress"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No events yet. Geocoding… Searching Google Places… Profiling websites…
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
