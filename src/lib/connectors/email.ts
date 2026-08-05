import { fetch } from "@tauri-apps/plugin-http";
import { getApiKey, getSetting, setSetting } from "@/lib/db/queries";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

function fromAddressKey(provider: string): string {
  return `${provider}_from_email`;
}

export async function getFromAddress(provider: string): Promise<string> {
  return (await getSetting(fromAddressKey(provider))) ?? "";
}

export async function setFromAddress(provider: string, address: string): Promise<void> {
  await setSetting(fromAddressKey(provider), address.trim());
}

async function sendViaResend(input: SendEmailInput, key: string, from: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, text: input.text }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend error ${res.status}: ${t.slice(0, 300)}`);
  }
}

export type EmailProviderId = "resend";

export const EMAIL_PROVIDER_LABELS: Record<EmailProviderId, string> = {
  resend: "Resend",
};

export async function getConfiguredEmailProvider(): Promise<EmailProviderId | null> {
  const key = await getApiKey("resend");
  const from = await getFromAddress("resend");
  return key && from ? "resend" : null;
}

export async function isEmailSendingConfigured(): Promise<boolean> {
  return (await getConfiguredEmailProvider()) !== null;
}

/** Sends via Resend if configured. Throws if not. */
export async function sendEmail(input: SendEmailInput): Promise<EmailProviderId> {
  const provider = await getConfiguredEmailProvider();
  if (!provider) {
    throw new Error("No email connector configured. Add Resend in Connectors.");
  }
  const key = (await getApiKey(provider))!;
  const from = await getFromAddress(provider);
  await sendViaResend(input, key, from);
  return provider;
}
