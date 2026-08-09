import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LedgerMatch } from "@/lib/jobs/searchLedger";
import { formatRelativeTime } from "@/lib/utils";

export interface DuplicateSearchNoticeProps {
  match: LedgerMatch;
  /** Human description of what's about to be searched, e.g. "Dentist near Orlando, FL". */
  what: string;
  onSearchAgain: () => void;
  onViewLeads: () => void;
  onDismiss: () => void;
  busy?: boolean;
  /** Noun for what this search produces — "lead" for Prospect Search, "business" for
   * a market sweep, where the results aren't sales leads at all. */
  entityLabel?: string;
}

export function DuplicateSearchNotice({
  match,
  what,
  onSearchAgain,
  onViewLeads,
  onDismiss,
  busy,
  entityLabel = "lead",
}: DuplicateSearchNoticeProps) {
  return (
    <Card className="border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Badge variant="warning">Already searched</Badge>
          <p className="text-sm text-[var(--color-foreground)]">
            You searched <span className="font-medium">{what}</span>{" "}
            {formatRelativeTime(match.search.created_at)}
            {match.distanceMiles !== undefined && match.distanceMiles > 0.5
              ? ` (${match.distanceMiles} mi away)`
              : ""}{" "}
            — {match.leadCount} {entityLabel}{match.leadCount === 1 ? "" : "s"} found.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onSearchAgain} disabled={busy}>
          Search again anyway
        </Button>
        <Button size="sm" variant="secondary" onClick={onViewLeads} disabled={busy}>
          View existing results
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
