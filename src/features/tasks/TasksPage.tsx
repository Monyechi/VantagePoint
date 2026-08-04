import { useEffect, useState } from "react";
import {
  listJobs,
  listJobEvents,
  updateJob,
  type JobEvent,
  type JobRow,
} from "@/lib/db/queries";
import { subscribeJobs } from "@/lib/jobs/runner";
import { nowIso } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";

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

export function TasksPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selected, setSelected] = useState<JobRow | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);

  async function refresh() {
    const rows = await listJobs();
    setJobs(rows);
    if (selected) {
      const updated = rows.find((j) => j.id === selected.id) ?? null;
      setSelected(updated);
      if (updated) setEvents(await listJobEvents(updated.id));
    }
  }

  useEffect(() => {
    void refresh();
    return subscribeJobs(() => {
      void refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectJob(job: JobRow) {
    setSelected(job);
    setEvents(await listJobEvents(job.id));
  }

  async function cancelJob(job: JobRow) {
    if (job.state !== "queued" && job.state !== "running") return;
    await updateJob(job.id, {
      state: "cancelled",
      error: "Cancelled by user",
      completed_at: nowIso(),
    });
    await refresh();
  }

  async function retryJob(job: JobRow) {
    if (job.state !== "failed" && job.state !== "cancelled") return;
    await updateJob(job.id, {
      state: "queued",
      progress: 0,
      error: null,
      completed_at: null,
    });
    await refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
          Tasks
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Background queue — like a download manager for AI jobs
        </p>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
            No tasks yet. Start a prospect search or generate outreach.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {jobs.map((job) => (
              <Card
                key={job.id}
                className={`cursor-pointer transition-colors ${
                  selected?.id === job.id ? "ring-1 ring-[var(--color-primary)]" : ""
                }`}
                onClick={() => void selectJob(job)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base capitalize">
                      {job.type.replace("_", " ")}
                    </CardTitle>
                    <Badge variant={stateVariant(job.state)}>{job.state}</Badge>
                  </div>
                  <CardDescription>
                    {formatRelativeTime(job.created_at)} · {job.id.slice(0, 8)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Progress value={job.progress} />
                  <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
                    <span>{job.progress}%</span>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {(job.state === "queued" || job.state === "running") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void cancelJob(job)}
                        >
                          Cancel
                        </Button>
                      )}
                      {(job.state === "failed" || job.state === "cancelled") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void retryJob(job)}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                  {job.error && (
                    <p className="text-xs text-[var(--color-destructive)]">{job.error}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Activity log</CardTitle>
              <CardDescription>
                {selected ? selected.id.slice(0, 8) : "Select a task"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selected ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Pick a job to inspect events.
                </p>
              ) : events.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">No events.</p>
              ) : (
                <ul className="max-h-[28rem] space-y-1.5 overflow-auto font-mono text-xs">
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
                      {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
