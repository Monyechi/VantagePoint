import { getSetting, setSetting } from "@/lib/db/queries";

export type Theme = "light" | "dark" | "system";

const SETTING_KEY = "theme";

export async function getTheme(): Promise<Theme> {
  const raw = await getSetting(SETTING_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function applyResolvedTheme(theme: Theme): void {
  document.documentElement.dataset.theme = resolveTheme(theme);
}

export async function setTheme(theme: Theme): Promise<void> {
  await setSetting(SETTING_KEY, theme);
  applyResolvedTheme(theme);
}

let systemListenerAttached = false;

/** Call once at boot: applies the saved preference and keeps it synced with OS
 * changes for as long as the user's preference stays "system". */
export async function initTheme(): Promise<void> {
  const theme = await getTheme();
  applyResolvedTheme(theme);

  if (!systemListenerAttached) {
    systemListenerAttached = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      void getTheme().then((current) => {
        if (current === "system") applyResolvedTheme("system");
      });
    });
  }
}
