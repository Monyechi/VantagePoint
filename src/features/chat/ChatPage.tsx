import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  clearAllChatThreads,
  createChatThread,
  deleteChatThread,
  listChatMessages,
  listChatThreads,
  type ChatMessage,
  type ChatThread,
} from "@/lib/db/queries";
import {
  confirmLaunchAnyway,
  deriveThreadTitle,
  sendChatMessage,
  type ChatLaunchLocalBusinessSearchAction,
  type ChatLaunchProspectSearchAction,
} from "@/lib/ai/chatAgent";
import type { LedgerMatch } from "@/lib/jobs/searchLedger";
import { getChatDefaults, setChatDefaults, type ChatDefaults } from "@/lib/settings/chatDefaults";
import { INDUSTRIES } from "@/lib/taxonomy";
import { ChatComposer } from "./ChatComposer";
import { ChatDefaultsBar } from "./ChatDefaultsBar";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { ChatThreadList } from "./ChatThreadList";

/** Personalizes the empty-state prompts to whatever offer/location the user has
 * configured in ChatDefaultsBar, instead of showing the same generic examples to
 * everyone regardless of what they actually sell. */
function buildExamplePrompts(defaults: ChatDefaults): string[] {
  const industry = defaults.industryId ? INDUSTRIES.find((i) => i.id === defaults.industryId) : undefined;
  const service = industry?.services.find((s) => s.id === defaults.serviceId);
  const location = defaults.location?.trim();
  const businessType = defaults.businessType?.trim();

  const prospectExample = service
    ? `Find me leads for ${service.label.toLowerCase()}${location ? ` near ${location}` : ""}`
    : "Find me some leads for my business";

  const localExample =
    businessType || location
      ? `Find ${businessType || "local businesses"} near ${location || "your city"}`
      : "Find dentists near Orlando, FL";

  const thirdExample = location
    ? `What local businesses near ${location} have no website?`
    : "Plumbers within 15 miles of Denver, CO";

  return [prospectExample, localExample, thirdExample];
}

interface PendingConfirm {
  messageId: string;
  action: ChatLaunchLocalBusinessSearchAction | ChatLaunchProspectSearchAction;
  match: LedgerMatch;
}

const SIDEBAR_COLLAPSED_KEY = "vantagepoint.chat.sidebarCollapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [chatDefaults, setChatDefaultsState] = useState<ChatDefaults>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const navigate = useNavigate();
  const bottomRef = useRef<HTMLDivElement>(null);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }

  const examplePrompts = useMemo(() => buildExamplePrompts(chatDefaults), [chatDefaults]);

  async function refreshThreads() {
    setThreads(await listChatThreads());
  }

  useEffect(() => {
    void (async () => {
      const [rows, defaults] = await Promise.all([listChatThreads(), getChatDefaults()]);
      setThreads(rows);
      setChatDefaultsState(defaults);
      // Most-recent thread opens by default (listChatThreads sorts by updated_at
      // desc); an empty roster just shows the example-prompt empty state below.
      if (rows.length > 0) {
        setActiveThreadId(rows[0]!.id);
        setMessages(await listChatMessages(rows[0]!.id));
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function handleDefaultsChange(next: ChatDefaults) {
    setChatDefaultsState(next);
    await setChatDefaults(next);
  }

  function resetToEmptyThread() {
    setActiveThreadId(null);
    setMessages([]);
    setPendingConfirm(null);
    setError(null);
  }

  async function selectThread(id: string) {
    if (id === activeThreadId) return;
    setPendingConfirm(null);
    setError(null);
    setActiveThreadId(id);
    setMessages(await listChatMessages(id));
  }

  async function handleDeleteThread(id: string) {
    const confirmed = await confirmDialog({
      title: "Delete this conversation?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    await deleteChatThread(id);
    await refreshThreads();
    if (id === activeThreadId) resetToEmptyThread();
  }

  async function handleClearAll() {
    const confirmed = await confirmDialog({
      title: "Delete all chat history?",
      description: "Every conversation will be permanently removed. This can't be undone.",
      confirmLabel: "Delete all",
      destructive: true,
    });
    if (!confirmed) return;
    await clearAllChatThreads();
    setThreads([]);
    resetToEmptyThread();
  }

  async function handleSend(text: string) {
    setError(null);
    setThinking(true);
    try {
      // A thread only gets created once there's actually something to say — an
      // empty "New chat" never clutters the sidebar.
      let threadId = activeThreadId;
      if (!threadId) {
        const thread = await createChatThread(deriveThreadTitle(text));
        threadId = thread.id;
        setActiveThreadId(threadId);
      }

      const { userMessage, assistantMessage, result } = await sendChatMessage(threadId, text);
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      await refreshThreads();
      if (
        result.ledgerMatch &&
        (result.action.kind === "launch_local_business_search" ||
          result.action.kind === "launch_prospect_search")
      ) {
        setPendingConfirm({
          messageId: assistantMessage.id,
          action: result.action,
          match: result.ledgerMatch,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setThinking(false);
    }
  }

  async function handleSearchAgain() {
    if (!pendingConfirm || !activeThreadId) return;
    setThinking(true);
    try {
      const { assistantMessage } = await confirmLaunchAnyway(activeThreadId, pendingConfirm.action);
      setMessages((prev) => [...prev, assistantMessage]);
      setPendingConfirm(null);
      await refreshThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setThinking(false);
    }
  }

  function handleViewLeads() {
    setPendingConfirm(null);
    navigate("/leads");
  }

  function handleDismissMatch() {
    setPendingConfirm(null);
  }

  return (
    <div className="flex h-full min-h-0">
      <ChatThreadList
        threads={threads}
        activeThreadId={activeThreadId}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
        onSelect={(id) => void selectThread(id)}
        onNewChat={resetToEmptyThread}
        onDelete={(id) => void handleDeleteThread(id)}
        onClearAll={() => void handleClearAll()}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b border-[var(--color-border)] px-8 py-5">
          <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">Chat</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Tell it what leads you're after — it'll ask if it needs more, then run the search.
          </p>
        </div>

        <ChatDefaultsBar defaults={chatDefaults} onChange={(next) => void handleDefaultsChange(next)} />

        <div className="min-h-0 flex-1 overflow-auto px-8 py-6">
          <div
            className={
              sidebarCollapsed
                ? "mx-auto w-full max-w-5xl space-y-4"
                : "mx-auto max-w-3xl space-y-4"
            }
          >
            {!loaded ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
            ) : messages.length === 0 ? (
              <Card className="p-6">
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Try one of these, or type your own:
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {examplePrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void handleSend(p)}
                      className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Card>
            ) : (
              messages.map((m, i) => (
                <ChatMessageBubble
                  key={m.id}
                  message={m}
                  isLatest={i === messages.length - 1}
                  pendingMatch={pendingConfirm?.messageId === m.id ? pendingConfirm.match : undefined}
                  onOptionSelect={(value) => void handleSend(value)}
                  onSearchAgain={() => void handleSearchAgain()}
                  onViewLeads={handleViewLeads}
                  onDismissMatch={handleDismissMatch}
                  busy={thinking}
                />
              ))
            )}
            {thinking && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-[var(--color-muted)] px-3.5 py-2 text-sm text-[var(--color-muted-foreground)]">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] px-8 py-4">
          <div
            className={
              sidebarCollapsed
                ? "mx-auto w-full max-w-5xl space-y-2"
                : "mx-auto max-w-3xl space-y-2"
            }
          >
            {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
            <ChatComposer onSend={(text) => void handleSend(text)} disabled={thinking} />
          </div>
        </div>
      </div>
    </div>
  );
}
