import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDUSTRIES } from "@/lib/taxonomy";
import type { ChatDefaults } from "@/lib/settings/chatDefaults";

export interface ChatDefaultsBarProps {
  defaults: ChatDefaults;
  onChange: (next: ChatDefaults) => void;
}

/** Controlled by ChatPage (single source of truth) so the example prompts shown in
 * the empty state can react to changes here immediately. */
export function ChatDefaultsBar({ defaults, onChange }: ChatDefaultsBarProps) {
  const [open, setOpen] = useState(false);

  const industry = INDUSTRIES.find((i) => i.id === defaults.industryId);
  const service = industry?.services.find((s) => s.id === defaults.serviceId);
  const summary = [
    industry && service ? `${industry.label} — ${service.label}` : null,
    defaults.location,
    defaults.businessType,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="border-b border-[var(--color-border)] px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Chat defaults
        {summary && !open && <span className="text-[var(--color-foreground)]">{summary}</span>}
      </button>

      {open && (
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Default offer — industry</Label>
            <Select
              value={defaults.industryId ?? ""}
              onValueChange={(industryId) => {
                const nextIndustry = INDUSTRIES.find((i) => i.id === industryId);
                onChange({ ...defaults, industryId, serviceId: nextIndustry?.services[0]?.id });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default offer — service</Label>
            <Select
              value={defaults.serviceId ?? ""}
              onValueChange={(serviceId) => onChange({ ...defaults, serviceId })}
            >
              <SelectTrigger disabled={!industry}>
                <SelectValue placeholder={industry ? "Pick a service" : "Pick an industry first"} />
              </SelectTrigger>
              <SelectContent>
                {(industry?.services ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default location</Label>
            <Input
              value={defaults.location ?? ""}
              onChange={(e) => onChange({ ...defaults, location: e.target.value })}
              placeholder="Orlando, FL"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default local-business type</Label>
            <Input
              value={defaults.businessType ?? ""}
              onChange={(e) => onChange({ ...defaults, businessType: e.target.value })}
              placeholder="Dentist"
            />
          </div>
        </div>
      )}
    </div>
  );
}
