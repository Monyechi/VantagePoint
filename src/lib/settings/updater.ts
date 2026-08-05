import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string;
}

/** Resolves to null when running under plain `npm run dev` (no Tauri backend) or when
 * already up to date. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const update = await check();
  if (!update) return null;
  return { version: update.version, currentVersion: update.currentVersion, notes: update.body };
}

/** Downloads and installs the latest update, then relaunches the app. `onProgress` receives
 * a 0-100 percentage, or null if the server didn't report a content length. */
export async function downloadAndInstallUpdate(
  onProgress?: (percent: number | null) => void,
): Promise<void> {
  const update = await check();
  if (!update) throw new Error("No update available.");

  let downloaded = 0;
  let total: number | undefined;
  const handleEvent = (event: DownloadEvent) => {
    if (event.event === "Started") {
      total = event.data.contentLength;
      onProgress?.(total ? 0 : null);
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.(total ? Math.min(100, Math.round((downloaded / total) * 100)) : null);
    } else if (event.event === "Finished") {
      onProgress?.(100);
    }
  };

  await update.downloadAndInstall(handleEvent);
  await relaunch();
}
