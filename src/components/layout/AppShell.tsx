import { NavLink, Outlet } from "react-router-dom";
import {
  Search,
  Users,
  MessageSquare,
  ListTodo,
  Bot,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/prospect", label: "Prospect Search", icon: Search },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/outreach", label: "Outreach", icon: MessageSquare },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/ai-models", label: "AI Models", icon: Bot },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-sidebar)]/95">
        <div className="border-b border-[var(--color-border)] px-4 py-5">
          <div className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-[var(--color-foreground)]">
            ClientPilot
          </div>
          <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
            Find clients · AI BDR
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-[var(--color-border)] p-3 text-[10px] text-[var(--color-muted-foreground)]">
          Desktop MVP · Local SQLite
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
