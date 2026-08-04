import { useEffect, useState } from "react";
import { listLeads, type Lead } from "@/lib/db/queries";
import { subscribeJobs } from "@/lib/jobs/runner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);

  async function refresh() {
    const rows = await listLeads();
    setLeads(rows);
    if (selected) {
      const updated = rows.find((l) => l.id === selected.id) ?? null;
      setSelected(updated);
    }
  }

  useEffect(() => {
    void refresh();
    return subscribeJobs(() => {
      void refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 space-y-4 overflow-auto p-8">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
            Leads
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            CRM for prospects discovered by your AI BDR
          </p>
        </div>

        {leads.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              No leads yet. Run a Prospect Search to populate this list.
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
                {leads.map((lead) => (
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
          </div>
        </aside>
      )}
    </div>
  );
}
