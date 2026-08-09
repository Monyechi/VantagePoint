import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { nowIso } from "@/lib/db/client";
import {
  getJob,
  listJobEvents,
  listLeadsBySearchId,
  updateJob,
  type JobEvent,
  type JobRow,
  type Lead,
} from "@/lib/db/queries";
import { subscribeJobs } from "@/lib/jobs/runner";

function stateVariant(
  state: string,
): "default" | "success" | "warning" | "muted" | "destructive" {
  switch (state) {
    case "running":
      return "default";
    case "completed":
    case "waiting_approval":
      return "success";
    case "queued":
      return "muted";
    case "failed":
    case "cancelled":
      return "destructive";
    default:
      return "warning";
  }
}

export interface SearchLaunchCardProps {
  jobId: string;
  searchId: string;
}

/** Live-updating progress card for a search launched from chat — same
 * subscribeJobs()-polling idiom LocalBusinessHunterPage/TasksPage already use,
 * scoped to one specific job instead of listing every job. */
export function SearchLaunchCard({ jobId, searchId }: SearchLaunchCardProps) {
  const [job, setJob] = useState<JobRow | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [j, e, l] = await Promise.all([
        getJob(jobId),
        listJobEvents(jobId),
        listLeadsBySearchId(searchId),
      ]);
      if (cancelled) return;
      setJob(j);
      setEvents(e);
      setLeads(l);
    };
    void refresh();
    const unsubscribe = subscribeJobs(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [jobId, searchId]);

  if (!job) {
    return <Card className="p-4 text-sm text-[var(--color-muted-foreground)]">Loading search…</Card>;
  }

  const lastEvent = events[events.length - 1];
  const isActive = job.state === "queued" || job.state === "running";

  async function cancel() {
    await updateJob(jobId, {
      state: "cancelled",
      error: "Cancelled by user",
      completed_at: nowIso(),
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={stateVariant(job.state)}>{job.state.replace("_", " ")}</Badge>
        {isActive && (
          <Button size="sm" variant="ghost" onClick={() => void cancel()}>
            Cancel
          </Button>
        )}
      </div>
      <Progress value={job.progress} className="mt-2" />
      {isActive && lastEvent && (
        <p className="mt-2 truncate text-xs text-[var(--color-muted-foreground)]">
          {lastEvent.message}
        </p>
      )}
      {job.state === "completed" && (
        <p className="mt-2 text-sm">
          {leads.length} lead{leads.length === 1 ? "" : "s"} found —{" "}
          <Link to="/leads" className="text-[var(--color-primary)] underline">
            View in Leads
          </Link>
        </p>
      )}
      {job.state === "failed" && job.error && (
        <p className="mt-2 text-sm text-[var(--color-destructive)]">{job.error}</p>
      )}
    </Card>
  );
}
