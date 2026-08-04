import { useEffect, useState } from "react";
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
import {
  createJob,
  createProspectSearch,
  listJobEvents,
  listLeadsBySearchId,
  type JobEvent,
  type Lead,
} from "@/lib/db/queries";
import { subscribeJobs } from "@/lib/jobs/runner";

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
const RESULT_COUNT_OPTIONS = [10, 20, 30];

const FLAG_LABELS: { id: string; label: string }[] = [
  { id: "no_website", label: "No Website" },
  { id: "outdated_builder", label: "Outdated Website" },
  { id: "slow", label: "Slow Website" },
  { id: "no_ssl", label: "No SSL" },
  { id: "no_contact_form", label: "No Contact Form" },
  { id: "poor_accessibility", label: "Accessibility Issues" },
];

function parseFlags(lead: Lead): string[] {
  if (!lead.opportunity_flags) return [];
  try {
    return JSON.parse(lead.opportunity_flags) as string[];
  } catch {
    return [];
  }
}

export function LocalBusinessHunterPage() {
  const [location, setLocation] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(10);
  const [maxResults, setMaxResults] = useState(20);
  const [avgProjectValue, setAvgProjectValue] = useState("");

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [resultLeads, setResultLeads] = useState<Lead[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeJobId || !activeSearchId) return;
    const refresh = async () => {
      setEvents(await listJobEvents(activeJobId));
      setResultLeads(await listLeadsBySearchId(activeSearchId));
    };
    void refresh();
    return subscribeJobs(() => {
      void refresh();
    });
  }, [activeJobId, activeSearchId]);

  async function startSearch() {
    setError(null);
    if (!location.trim() || !businessType.trim()) {
      setError("Enter both a location and a business type.");
      return;
    }
    setBusy(true);
    try {
      const queryText = `${businessType} near ${location}`;
      const search = await createProspectSearch({
        queryText,
        niche: businessType,
        location,
        audience: `${radiusMiles} mile radius`,
        ticketSize: avgProjectValue.trim() || undefined,
        sources: ["google_places"],
      });
      const job = await createJob({
        type: "local_business_search",
        searchId: search.id,
        payload: {
          searchId: search.id,
          queryText,
          location,
          businessType,
          radiusMiles,
          maxResults,
        },
      });
      setActiveJobId(job.id);
      setActiveSearchId(search.id);
      setEvents([]);
      setResultLeads([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const avgValueNumber = Number(avgProjectValue);
  const hasAvgValue = avgProjectValue.trim() !== "" && !Number.isNaN(avgValueNumber);
  const estimatedRevenue = hasAvgValue ? resultLeads.length * avgValueNumber : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
          Local Business Hunter
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Find local businesses via Google Places, spot the ones with no website or a
          website that's underperforming, and get a ranked opportunity list.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
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
            <Input
              list="business-type-suggestions"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="Dentist"
            />
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
            <Label>Max results</Label>
            <div className="flex gap-2 pt-1">
              {RESULT_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxResults(n)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    maxResults === n
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
            <Label>Average project value (optional, for a revenue estimate)</Label>
            <Input
              type="number"
              min={0}
              value={avgProjectValue}
              onChange={(e) => setAvgProjectValue(e.target.value)}
              placeholder="2000"
            />
          </div>

          <div className="flex items-end">
            <Button onClick={() => void startSearch()} disabled={busy}>
              {busy ? "Queuing…" : "Find Businesses"}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-[var(--color-destructive)] sm:col-span-2">{error}</p>
          )}
        </CardContent>
      </Card>

      {resultLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Opportunities found</CardTitle>
            <CardDescription>{resultLeads.length} business(es) so far</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {FLAG_LABELS.map((flag) => {
                const count = resultLeads.filter((l) => parseFlags(l).includes(flag.id)).length;
                if (count === 0) return null;
                return (
                  <Badge key={flag.id} variant="warning">
                    {count} {flag.label}
                  </Badge>
                );
              })}
            </div>
            {estimatedRevenue !== null && (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Estimated potential revenue:{" "}
                <span className="font-semibold text-[var(--color-foreground)]">
                  ${estimatedRevenue.toLocaleString()}
                </span>{" "}
                ({resultLeads.length} leads × ${avgValueNumber.toLocaleString()}) — a
                prioritization aid, not a forecast of what you'll actually close.
              </p>
            )}
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-muted)]/60 text-xs text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Business</th>
                    <th className="px-3 py-2 font-medium">Rating</th>
                    <th className="px-3 py-2 font-medium">Score</th>
                    <th className="px-3 py-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {resultLeads.map((lead) => (
                    <tr key={lead.id} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{lead.business || "—"}</div>
                        <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                          {lead.website || lead.phone || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-muted-foreground)]">
                        {lead.rating ? `${lead.rating}★ (${lead.review_count ?? 0})` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant={
                            lead.score >= 70 ? "success" : lead.score >= 40 ? "warning" : "muted"
                          }
                        >
                          {lead.score}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted-foreground)]">
                        {parseFlags(lead)
                          .map((f) => FLAG_LABELS.find((l) => l.id === f)?.label ?? f)
                          .join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Full details, notes, and outreach for these leads are on the Leads page.
            </p>
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
              "Start a search to see progress"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No events yet. Geocoding… Searching Google Places… Analyzing websites…
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
