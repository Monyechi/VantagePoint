import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  createJob,
  deleteLead,
  deleteLeads,
  listLeads,
  updateLeadEmail,
  updateLeadNotes,
  updateLeadPlaceFields,
  updateLeadStatus,
  updateLeadsStatus,
  type Lead,
} from "@/lib/db/queries";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { subscribeJobs } from "@/lib/jobs/runner";
import { getPlaceDetails } from "@/lib/connectors/places";
import { enrichDomain } from "@/lib/connectors/enrichment";
import { domainAgeYears, lookupDomain } from "@/lib/connectors/domain";
import { downloadPdf, generateProposalPdf } from "@/lib/pdf/proposal";
import { getSellerProfile } from "@/lib/settings/sellerProfile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";

const LEAD_STATUSES = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "unqualified", label: "Unqualified" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [notesDraft, setNotesDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshingPlace, setRefreshingPlace] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusValue, setBulkStatusValue] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const selectedRef = useRef<Lead | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const refresh = useCallback(async () => {
    const rows = await listLeads();
    setLeads(rows);
    const current = selectedRef.current;
    if (current) {
      const updated = rows.find((l) => l.id === current.id) ?? null;
      setSelected(updated);
    }
    // Drop any selected ids that no longer exist (e.g. deleted from the detail
    // panel) so the bulk-action count never lags behind reality.
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(rows.map((l) => l.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeJobs(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    // Reset the draft only when switching leads, not on every background refresh —
    // otherwise an in-progress edit gets clobbered by the next poll.
    setNotesDraft(selected?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const filteredLeads = leads.filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (lead.business ?? "").toLowerCase().includes(q) ||
      (lead.website ?? "").toLowerCase().includes(q) ||
      (lead.email ?? "").toLowerCase().includes(q)
    );
  });

  async function changeStatus(id: string, status: string) {
    await updateLeadStatus(id, status);
    await refresh();
  }

  async function saveNotes() {
    if (!selected) return;
    await updateLeadNotes(selected.id, notesDraft);
    setNotice("Notes saved.");
    await refresh();
  }

  async function removeLead() {
    if (!selected) return;
    const confirmed = await confirmDialog({
      title: "Delete this lead?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    await deleteLead(selected.id);
    setSelected(null);
    await refresh();
  }

  function toggleSelectAll() {
    const allFilteredSelected =
      filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(l.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const lead of filteredLeads) {
        if (allFilteredSelected) next.delete(lead.id);
        else next.add(lead.id);
      }
      return next;
    });
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkChangeStatus(status: string) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      await updateLeadsStatus(ids, status);
      setNotice(`Marked ${ids.length} lead(s) as ${status}.`);
      await refresh();
    } finally {
      setBulkStatusValue("");
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const confirmed = await confirmDialog({
      title: `Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    setBulkBusy(true);
    try {
      await deleteLeads(ids);
      if (selected && selectedIds.has(selected.id)) setSelected(null);
      setSelectedIds(new Set());
      setNotice(`Deleted ${ids.length} lead(s).`);
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  async function draftOutreach(channel: "email" | "linkedin" | "facebook") {
    if (!selected) return;
    await createJob({ type: "draft_outreach", payload: { leadId: selected.id, channel } });
    setNotice(`Draft ${channel} queued — check Tasks, then Outreach to approve.`);
  }

  async function generateProposal() {
    if (!selected) return;
    setGeneratingPdf(true);
    try {
      const profile = await getSellerProfile();
      const bytes = await generateProposalPdf(selected, profile);
      const safeName = (selected.business || "proposal").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      downloadPdf(bytes, `${safeName}-proposal.pdf`);
      setNotice("Proposal PDF downloaded.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingPdf(false);
    }
  }

  function websiteDomain(website: string): string {
    try {
      const host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
      return host.startsWith("www.") ? host.slice(4) : host;
    } catch {
      return website;
    }
  }

  async function enrichLead() {
    if (!selected?.website) {
      setNotice("This lead has no website to enrich from.");
      return;
    }
    setEnriching(true);
    const domain = websiteDomain(selected.website);
    const findings: string[] = [];
    let newEmail: string | undefined;

    try {
      const enrichment = await enrichDomain(domain);
      if (enrichment.emails.length > 0) {
        findings.push(`Found email(s) via ${enrichment.provider}: ${enrichment.emails.join(", ")}`);
        if (!selected.email) newEmail = enrichment.emails[0];
      }
      if (enrichment.companyName) findings.push(`Company: ${enrichment.companyName}`);
      if (enrichment.companySummary) findings.push(enrichment.companySummary);
    } catch (err) {
      findings.push(
        `Company enrichment: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      const info = await lookupDomain(domain);
      const age = domainAgeYears(info);
      if (age !== null) {
        findings.push(
          `Domain registered ~${age} year${age === 1 ? "" : "s"} ago${info.registrar ? ` via ${info.registrar}` : ""}.`,
        );
      }
    } catch (err) {
      findings.push(`Domain lookup: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const stamp = new Date().toLocaleString();
      const appended = [notesDraft, `[Enriched ${stamp}]`, ...findings].filter(Boolean).join("\n");
      await updateLeadNotes(selected.id, appended);
      if (newEmail) await updateLeadEmail(selected.id, newEmail);
      setNotesDraft(appended);
      setNotice("Enrichment complete — see notes.");
      await refresh();
    } finally {
      setEnriching(false);
    }
  }

  async function refreshFromGoogle() {
    if (!selected?.place_id) return;
    setRefreshingPlace(true);
    try {
      const details = await getPlaceDetails(selected.place_id);
      await updateLeadPlaceFields(selected.id, {
        business: details.name,
        website: details.website,
        phone: details.phone,
        rating: details.rating,
        reviewCount: details.reviewCount,
      });
      setNotice("Refreshed from Google.");
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingPlace(false);
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 space-y-4 overflow-auto p-8">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
            Leads
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Potential clients who may need what you sell
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search business, website, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/50 px-3 py-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Select
              value={bulkStatusValue}
              onValueChange={(status) => {
                setBulkStatusValue(status);
                void bulkChangeStatus(status);
              }}
            >
              <SelectTrigger className="h-8 w-40 text-xs" disabled={bulkBusy}>
                <SelectValue placeholder="Mark as…" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="destructive" disabled={bulkBusy} onClick={() => void bulkDelete()}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={clearSelection}>
              Clear selection
            </Button>
          </div>
        )}

        {leads.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              No leads yet. Run a Prospect Search to populate this list.
            </CardContent>
          </Card>
        ) : filteredLeads.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              No leads match your filters.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-muted)]/60 text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-primary)]"
                      checked={filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(l.id))}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Business</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelected(lead)}
                    className={`cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-muted)]/40 ${
                      selected?.id === lead.id ? "bg-[var(--color-primary)]/10" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-primary)]"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelectOne(lead.id)}
                        aria-label={`Select ${lead.business || "lead"}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{lead.business || "—"}</div>
                      <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {lead.website}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-muted-foreground)]">
                      {lead.email || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={
                          lead.score >= 70
                            ? "success"
                            : lead.score >= 40
                              ? "warning"
                              : "muted"
                        }
                      >
                        {lead.score}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 capitalize">{lead.status}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted-foreground)]">
                      {formatRelativeTime(lead.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <aside className="w-96 shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-card)]/50 p-6">
          <CardHeader className="p-0 pb-4">
            <CardTitle>{selected.business || "Lead"}</CardTitle>
            {selected.website ? (
              <button
                type="button"
                onClick={() => void openUrl(selected.website!).catch((err) => setNotice(String(err)))}
                className="text-left text-xs text-[var(--color-primary)] hover:underline"
              >
                {selected.website}
              </button>
            ) : (
              <p className="text-xs text-[var(--color-muted-foreground)]">No website on file</p>
            )}
          </CardHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={selected.status} onValueChange={(v) => void changeStatus(selected.id, v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted-foreground)]">Contact</div>
              <div>{selected.name || "—"}</div>
              <div className="text-[var(--color-muted-foreground)]">
                {selected.email || "No email found"}
              </div>
              {selected.phone && (
                <div className="text-[var(--color-muted-foreground)]">{selected.phone}</div>
              )}
            </div>
            {selected.rating != null && (
              <div>
                <div className="text-xs text-[var(--color-muted-foreground)]">Google rating</div>
                <div>
                  {selected.rating}★ ({selected.review_count ?? 0} reviews)
                </div>
              </div>
            )}
            {selected.place_id && (
              <div className="space-y-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={refreshingPlace}
                  onClick={() => void refreshFromGoogle()}
                >
                  {refreshingPlace ? "Refreshing…" : "Refresh from Google"}
                </Button>
                {selected.place_synced_at && (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Last synced {formatRelativeTime(selected.place_synced_at)}
                  </p>
                )}
              </div>
            )}
            <div>
              <div className="text-xs text-[var(--color-muted-foreground)]">Score</div>
              <div className="font-semibold">{selected.score}/100</div>
              <pre className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-muted-foreground)]">
                {selected.score_reasons || "—"}
              </pre>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted-foreground)]">AI Summary</div>
              <p className="mt-1 text-[var(--color-foreground)]/90">
                {selected.summary || "—"}
              </p>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted-foreground)]">Pain points</div>
              <pre className="mt-1 whitespace-pre-wrap text-xs">
                {selected.pain_points || "—"}
              </pre>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted-foreground)]">Campaign</div>
              <div>{selected.campaign || "—"}</div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Private notes about this lead"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void saveNotes()}>
                  Save notes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={enriching || !selected.website}
                  onClick={() => void enrichLead()}
                >
                  {enriching ? "Enriching…" : "Enrich"}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Draft outreach</Label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void draftOutreach("email")}>
                  Email
                </Button>
                <Button size="sm" variant="outline" onClick={() => void draftOutreach("linkedin")}>
                  LinkedIn
                </Button>
                <Button size="sm" variant="outline" onClick={() => void draftOutreach("facebook")}>
                  Facebook
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Documents</Label>
              <Button
                size="sm"
                variant="outline"
                disabled={generatingPdf}
                onClick={() => void generateProposal()}
              >
                {generatingPdf ? "Generating…" : "Generate Proposal PDF"}
              </Button>
            </div>

            {notice && <p className="text-xs text-[var(--color-primary)]">{notice}</p>}

            <div className="border-t border-[var(--color-border)] pt-4">
              <Button size="sm" variant="destructive" onClick={() => void removeLead()}>
                Delete lead
              </Button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
