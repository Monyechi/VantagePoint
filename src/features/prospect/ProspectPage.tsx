import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  type JobEvent,
} from "@/lib/db/queries";
import { subscribeJobs } from "@/lib/jobs/runner";

const SOURCE_OPTIONS = [
  { id: "google", label: "Google", ready: true },
  { id: "linkedin", label: "LinkedIn", ready: false },
  { id: "facebook", label: "Facebook", ready: false },
  { id: "reddit", label: "Reddit", ready: false },
  { id: "podcasts", label: "Podcasts", ready: false },
  { id: "blogs", label: "Blogs", ready: false },
];

export function ProspectPage() {
  // "niche" in the DB = what YOU sell / offer (not who your peers are)
  const [offer, setOffer] = useState(
    "Website, mobile app, and desktop app development",
  );
  const [location, setLocation] = useState("United States");
  const [audience, setAudience] = useState(
    "Small businesses and startups that need software built",
  );
  const [ticketSize, setTicketSize] = useState("Mid to high ticket projects");
  const [sources, setSources] = useState<string[]>(["google"]);
  const [extraUrls, setExtraUrls] = useState("");
  const [maxResults, setMaxResults] = useState(8);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function toggleSource(id: string, ready: boolean) {
    if (!ready) return;
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function startSearch() {
    setError(null);
    setBusy(true);
    try {
      const queryText = [offer, location, audience, ticketSize]
        .filter(Boolean)
        .join(" · ");
      const search = await createProspectSearch({
        queryText,
        niche: offer,
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
          niche: offer,
          location,
          audience,
          ticketSize,
          sources,
          extraUrls,
          maxResults,
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
          Tell us what you sell. The AI BDR finds people and businesses who may need it —
          not competitors in your niche.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Who are you looking for?</CardTitle>
          <CardDescription>
            Example: if you sell relationship coaching, we hunt for people who want a
            coach — not other coaches. If you build software, we hunt for clients who need
            websites or apps.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>What you sell / offer</Label>
            <Input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="e.g. Relationship coaching · Website & app development"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ideal buyer (who needs your offer)</Label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. Couples struggling with communication · Local businesses without a modern website"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="United States"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Client budget / ticket size</Label>
            <Input
              value={ticketSize}
              onChange={(e) => setTicketSize(e.target.value)}
              placeholder="What they can typically afford to pay you"
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Rough budget of the buyer (not your competitors&apos; pricing).
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Sources</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {SOURCE_OPTIONS.map((s) => {
                const on = sources.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!s.ready}
                    onClick={() => toggleSource(s.id, s.ready)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      on
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                    } ${!s.ready ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    {s.label}
                    {!s.ready && " · soon"}
                  </button>
                );
              })}
            </div>
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
          <div className="space-y-1.5">
            <Label>Max results</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value) || 8)}
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
              No events yet. Building buyer-intent queries… Searching… Scoring leads…
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
