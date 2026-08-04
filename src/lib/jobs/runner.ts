import {
  claimNextJob,
  appendJobEvent,
  updateJob,
  type JobRow,
} from "@/lib/db/queries";
import { nowIso } from "@/lib/db/client";
import { runProspectSearchJob } from "./pipeline";
import { completeWithRouting } from "@/lib/ai/complete";
import {
  createOutreachMessage,
  getLead,
} from "@/lib/db/queries";
import { getSellerProfile, sellerProfileBrief } from "@/lib/settings/sellerProfile";
import { notifyJobs, subscribeJobs } from "./events";

export { subscribeJobs };

export interface DraftOutreachPayload {
  leadId: string;
  channel: "email" | "linkedin" | "facebook";
}

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

async function runDraftOutreach(job: JobRow): Promise<void> {
  const payload = JSON.parse(job.payload_json) as DraftOutreachPayload;
  const lead = await getLead(payload.leadId);
  if (!lead) throw new Error("Lead not found");
  const profile = await getSellerProfile();

  const taskKind =
    payload.channel === "email"
      ? "email_writing"
      : payload.channel === "linkedin"
        ? "linkedin_writing"
        : "facebook_writing";

  await appendJobEvent(job.id, `Drafting ${payload.channel} for ${lead.business || lead.website}`);
  await updateJob(job.id, { progress: 30 });

  const channelLabel =
    payload.channel === "email"
      ? "cold email"
      : payload.channel === "linkedin"
        ? "LinkedIn connection/message"
        : "Facebook outreach message";

  const schema =
    payload.channel === "email"
      ? {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["subject", "body"],
          additionalProperties: false,
        }
      : {
          type: "object",
          properties: {
            body: { type: "string" },
          },
          required: ["body"],
          additionalProperties: false,
        };

  const result = await completeWithRouting(taskKind, {
    system: `You write concise, personalized ${channelLabel} copy to sell the seller's offer to a potential CLIENT.
You are writing AS ${profile.name || "the seller"}${profile.company ? ` from ${profile.company}` : ""}, in a ${profile.tone} tone.
You are helping the seller win business — not networking with peers. Be specific and non-spammy. Avoid hype.`,
    prompt: `${sellerProfileBrief(profile)}

Write a ${channelLabel} from the seller to this lead.

Seller's offer / campaign: ${lead.campaign || profile.offer || "their services"}

Lead:
Business: ${lead.business}
Name: ${lead.name || "there"}
Website: ${lead.website}
Email: ${lead.email || "unknown"}
Summary: ${lead.summary || ""}
Pain points / needs: ${lead.pain_points || ""}
Why they scored as a lead: ${lead.score_reasons || ""}

Pitch how the seller's offer can help THIS lead. Do not write as if contacting a competitor.
${profile.proofPoints ? `Weave in relevant proof points/credentials where natural: ${profile.proofPoints}` : ""}
${profile.cta ? `End with this call to action: ${profile.cta}` : ""}
${profile.bookingLink ? `If it fits, mention this booking link: ${profile.bookingLink}` : ""}
${profile.signature ? `Sign off with:\n${profile.signature}` : ""}

${
  payload.channel === "email"
    ? "Return JSON: { subject: string, body: string }"
    : "Return JSON: { body: string }"
}`,
    json: true,
    schema,
    temperature: 0.7,
  }, job.id);

  let parsed: { subject?: string; body: string };
  try {
    parsed = JSON.parse(result.text) as { subject?: string; body: string };
  } catch {
    const m = result.text.match(/\{[\s\S]*\}/);
    parsed = m
      ? (JSON.parse(m[0]) as { subject?: string; body: string })
      : { body: result.text };
  }

  await createOutreachMessage({
    leadId: lead.id,
    channel: payload.channel,
    subject: parsed.subject,
    body: parsed.body,
  });

  await updateJob(job.id, {
    state: "waiting_approval",
    progress: 100,
    completed_at: nowIso(),
  });
  await appendJobEvent(job.id, "Draft ready — waiting for approval in Outreach");
}

async function executeJob(job: JobRow): Promise<void> {
  try {
    if (job.type === "prospect_search") {
      await runProspectSearchJob(job);
    } else if (job.type === "draft_outreach") {
      await runDraftOutreach(job);
    } else {
      await updateJob(job.id, {
        state: "failed",
        error: `Unknown job type: ${job.type}`,
        completed_at: nowIso(),
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendJobEvent(job.id, msg, "error");
    await updateJob(job.id, {
      state: "failed",
      error: msg,
      completed_at: nowIso(),
    });
  } finally {
    notifyJobs();
  }
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const job = await claimNextJob();
    if (job) {
      notifyJobs();
      await executeJob(job);
    }
  } finally {
    running = false;
  }
}

export function startJobRunner(): void {
  if (timer) return;
  void tick();
  timer = setInterval(() => {
    void tick();
  }, 1500);
}

export function stopJobRunner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
