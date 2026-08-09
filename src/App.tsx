import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ChatPage } from "@/features/chat/ChatPage";
import { ProspectPage } from "@/features/prospect/ProspectPage";
import { LocalBusinessHunterPage } from "@/features/local-hunter/LocalBusinessHunterPage";
import { LeadsPage } from "@/features/leads/LeadsPage";
import { OutreachPage } from "@/features/outreach/OutreachPage";
import { TasksPage } from "@/features/tasks/TasksPage";
import { AIModelsPage } from "@/features/ai-models/AIModelsPage";
import { ConnectorsPage } from "@/features/connectors/ConnectorsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { getDb } from "@/lib/db/client";
import { resetOrphanedJobs } from "@/lib/db/queries";
import { ensureDefaultRouting } from "@/lib/ai/routing";
import { startJobRunner, stopJobRunner } from "@/lib/jobs/runner";
import { getSellerProfile, isSellerProfileComplete } from "@/lib/settings/sellerProfile";
import { initTheme } from "@/lib/settings/theme";
import { ensureDefaultSearchPresets } from "@/lib/taxonomy";

export default function App() {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getDb();
        await initTheme();
        await ensureDefaultRouting();
        await ensureDefaultSearchPresets();
        await resetOrphanedJobs();
        startJobRunner();
        const profile = await getSellerProfile();
        if (!cancelled) {
          setNeedsOnboarding(!isSellerProfileComplete(profile));
          setReady(true);
        }
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
        Starting VantagePoint…
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          index
          element={<Navigate to={needsOnboarding ? "/settings" : "/chat"} replace />}
        />
        <Route path="chat" element={<ChatPage />} />
        <Route path="prospect" element={<ProspectPage />} />
        <Route path="local-hunter" element={<LocalBusinessHunterPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="outreach" element={<OutreachPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="ai-models" element={<AIModelsPage />} />
        <Route path="connectors" element={<ConnectorsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
