import { useCallback, useEffect, useRef, useState } from "react";
import {
  createJob,
  listAllOutreach,
  listLeads,
  listOutreachForLead,
  updateOutreachStatus,
  type Lead,
  type OutreachMessage,
} from "@/lib/db/queries";
import { subscribeJobs } from "@/lib/jobs/runner";
import { isResendConfigured, sendEmailViaResend } from "@/lib/connectors/email";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Channel = "email" | "linkedin" | "facebook";

export function OutreachPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [selected, setSelected] = useState<OutreachMessage | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedRef = useRef<OutreachMessage | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const refresh = useCallback(async () => {
    const l = await listLeads();
    setLeads(l);
    if (!leadId && l[0]) setLeadId(l[0].id);
    if (leadId) {
      const msgs = await listOutreachForLead(leadId);
      setMessages(msgs);
      const current = selectedRef.current;
      if (current) {
        const updated = msgs.find((m) => m.id === current.id);
        if (updated) {
          setSelected(updated);
          setDraftBody(updated.body);
        }
      }
    } else {
      const all = await listAllOutreach();
      setMessages(all);
    }
  }, [leadId]);

  useEffect(() => {
    void refresh();
    return subscribeJobs(() => {
      void refresh();
    });
  }, [refresh]);

  async function generate(overrideLeadId?: string, overrideChannel?: Channel) {
    const targetLeadId = overrideLeadId ?? leadId;
    const targetChannel = overrideChannel ?? channel;
    if (!targetLeadId) return;
    setBusy(true);
    setNotice(null);
    try {
      await createJob({
        type: "draft_outreach",
        payload: { leadId: targetLeadId, channel: targetChannel },
      });
      setNotice("Draft job queued — check Tasks, then return here to approve.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!selected) return;
    await updateOutreachStatus(selected.id, "approved", draftBody);
    setNotice("Message approved.");
    await refresh();
  }

  async function copyOrMailto() {
    if (!selected) return;
    const lead = leads.find((l) => l.id === selected.lead_id);
    if (selected.channel === "email" && lead?.email) {
      if (await isResendConfigured()) {
        try {
          await sendEmailViaResend({
            to: lead.email,
            subject: selected.subject || "Hello",
            text: draftBody,
          });
          await updateOutreachStatus(selected.id, "sent", draftBody);
          setNotice("Sent via Resend.");
        } catch (err) {
          setNotice(err instanceof Error ? err.message : String(err));
        }
        await refresh();
        return;
      }
      const subject = encodeURIComponent(selected.subject || "Hello");
      const body = encodeURIComponent(draftBody);
      window.open(`mailto:${lead.email}?subject=${subject}&body=${body}`);
      await updateOutreachStatus(selected.id, "sent", draftBody);
      setNotice("Opened mail client and marked as sent.");
    } else {
      await navigator.clipboard.writeText(draftBody);
      setNotice("Copied to clipboard.");
    }
    await refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight">
          Outreach
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Generate, regenerate, approve — send via mailto or clipboard for MVP
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate</CardTitle>
          <CardDescription>
            Uses your AI Models routing (Claude by default for writing)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label>Lead</Label>
            <select
              className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-sm"
              value={leadId}
              onChange={(e) => {
                setLeadId(e.target.value);
                setSelected(null);
              }}
            >
              {leads.length === 0 && <option value="">No leads yet</option>}
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.business || l.website) ?? l.id} · {l.score}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <select
              className="flex h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="email">Email</option>
              <option value="linkedin">LinkedIn</option>
              <option value="facebook">Facebook</option>
            </select>
          </div>
          <Button onClick={() => void generate()} disabled={!leadId || busy}>
            {busy ? "Queuing…" : "Generate"}
          </Button>
          {notice && (
            <p className="w-full text-sm text-[var(--color-muted-foreground)]">{notice}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Drafts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {messages.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                No outreach messages yet.
              </p>
            ) : (
              messages.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelected(m);
                    setDraftBody(m.body);
                  }}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selected?.id === m.id
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                      : "border-[var(--color-border)] hover:bg-[var(--color-muted)]"
                  }`}
                >
                  <span className="capitalize">
                    {m.channel}
                    {m.subject ? ` — ${m.subject}` : ""}
                  </span>
                  <Badge
                    variant={
                      m.status === "approved"
                        ? "success"
                        : m.status === "sent"
                          ? "default"
                          : "muted"
                    }
                  >
                    {m.status}
                  </Badge>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Editor</CardTitle>
            <CardDescription>
              {selected?.subject ? `Subject: ${selected.subject}` : "Select a draft"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={12}
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              disabled={!selected}
              placeholder="Generated copy appears here"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!selected}
                onClick={() =>
                  void generate(selected?.lead_id, selected?.channel as Channel | undefined)
                }
              >
                Regenerate
              </Button>
              <Button disabled={!selected} onClick={() => void approve()}>
                Approve
              </Button>
              <Button
                variant="outline"
                disabled={!selected}
                onClick={() => void copyOrMailto()}
              >
                Send / Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
