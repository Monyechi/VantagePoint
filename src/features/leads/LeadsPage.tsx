import { useCallback, useEffect, useRef, useState } from "react";
import {
  createJob,
  deleteLead,
  listLeads,
  updateLeadNotes,
  updateLeadStatus,
  type Lead,
} from "@/lib/db/queries";
import { subscribeJobs } from "@/lib/jobs/runner";
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
    await deleteLead(selected.id);
    setSelected(null);
    await refresh();
  }

  async function draftOutreach(channel: "email" | "linkedin" | "facebook") {
    if (!selected) return;
    await createJob({ type: "draft_outreach", payload: { leadId: selected.id, channel } });
    setNotice(`Draft ${channel} queued — check Tasks, then Outreach to approve.`);
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
            <a
              href={selected.website ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              {selected.website}
            </a>
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
            </div>
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
              <Button size="sm" variant="secondary" onClick={() => void saveNotes()}>
                Save notes
              </Button>
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
