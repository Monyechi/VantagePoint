import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProspectPage } from "@/features/prospect/ProspectPage";
import { LeadsPage } from "@/features/leads/LeadsPage";
import { OutreachPage } from "@/features/outreach/OutreachPage";
import { TasksPage } from "@/features/tasks/TasksPage";
import { AIModelsPage } from "@/features/ai-models/AIModelsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { getDb } from "@/lib/db/client";
import { ensureDefaultRouting } from "@/lib/ai/routing";
import { startJobRunner, stopJobRunner } from "@/lib/jobs/runner";

export default function App() {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getDb();
        await ensureDefaultRouting();
        startJobRunner();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      stopJobRunner();
    };
  }, []);

  if (bootError) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold">Failed to start</h1>
          <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">
            {bootError}
          </p>
          <p className="mt-4 text-xs text-[var(--color-muted-foreground)]">
            Run via <code>npm run tauri:dev</code> so SQLite and HTTP plugins are available.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Starting ClientPilot…
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/prospect" replace />} />
        <Route path="prospect" element={<ProspectPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="outreach" element={<OutreachPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="ai-models" element={<AIModelsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
