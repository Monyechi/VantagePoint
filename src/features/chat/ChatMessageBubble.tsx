import { Button } from "@/components/ui/button";
import { DuplicateSearchNotice } from "@/components/search/DuplicateSearchNotice";
import type { LedgerMatch } from "@/lib/jobs/searchLedger";
import { businessTypeLabel } from "@/lib/jobs/localBusinessPipeline";
import { findService } from "@/lib/taxonomy";
import type { ChatMessage } from "@/lib/db/queries";
import type {
  ChatAgentAction,
  ChatLaunchLocalBusinessSearchAction,
  ChatLaunchProspectSearchAction,
} from "@/lib/ai/chatAgent";
import { SearchLaunchCard } from "./SearchLaunchCard";

function parseAction(message: ChatMessage): ChatAgentAction | null {
  if (message.role !== "assistant" || !message.response_json) return null;
  try {
    return JSON.parse(message.response_json) as ChatAgentAction;
  } catch {
    return null;
  }
}

function describeLaunch(
  action: ChatLaunchLocalBusinessSearchAction | ChatLaunchProspectSearchAction,
): string {
  if (action.kind === "launch_local_business_search") {
    return `${businessTypeLabel(action.params.businessType)} near ${action.params.location}`;
  }
  const resolved = findService(action.params.industryId, action.params.serviceId);
  const serviceLabel = resolved ? resolved.service.label : action.params.serviceId;
  return `${serviceLabel} leads${action.params.location ? ` near ${action.params.location}` : ""}`;
}

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  /** Only the latest message renders clickable clarify options — once superseded,
   * older clarify prompts render as inert text so there's never a dangling control
   * that no longer reflects the live conversation state. */
  isLatest: boolean;
  /** Set when this exact message proposed a launch that's blocked on a ledger match
   * (client-side-only state — not persisted, see ChatPage). */
  pendingMatch?: LedgerMatch;
  onOptionSelect: (value: string) => void;
  onSearchAgain: () => void;
  onViewLeads: () => void;
  onDismissMatch: () => void;
  busy?: boolean;
}

export function ChatMessageBubble({
  message,
  isLatest,
  pendingMatch,
  onOptionSelect,
  onSearchAgain,
  onViewLeads,
  onDismissMatch,
  busy,
}: ChatMessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm text-[var(--color-primary-foreground)]">
          {message.content}
        </div>
      </div>
    );
  }

  const action = parseAction(message);
  const isLaunch =
    action?.kind === "launch_local_business_search" || action?.kind === "launch_prospect_search";

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        <div className="rounded-lg bg-[var(--color-muted)] px-3.5 py-2 text-sm text-[var(--color-foreground)]">
          {message.content}
        </div>

        {action?.kind === "clarify" && isLatest && (
          <div className="flex flex-wrap gap-2">
            {action.options.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant="outline"
                onClick={() => onOptionSelect(opt.value)}
                disabled={busy}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}

        {isLaunch && pendingMatch && (
          <DuplicateSearchNotice
            match={pendingMatch}
            what={describeLaunch(action as ChatLaunchLocalBusinessSearchAction | ChatLaunchProspectSearchAction)}
            onSearchAgain={onSearchAgain}
            onViewLeads={onViewLeads}
            onDismiss={onDismissMatch}
            busy={busy}
          />
        )}

        {message.job_id && message.search_id && (
          <SearchLaunchCard jobId={message.job_id} searchId={message.search_id} />
        )}
      </div>
    </div>
  );
}
