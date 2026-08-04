import { fetch } from "@tauri-apps/plugin-http";
import { getApiKey, getSetting, setSetting } from "@/lib/db/queries";

const FROM_SETTING_KEY = "resend_from_email";

export async function getResendFromAddress(): Promise<string> {
  return (await getSetting(FROM_SETTING_KEY)) ?? "";
}

export async function setResendFromAddress(address: string): Promise<void> {
  await setSetting(FROM_SETTING_KEY, address);
}

export async function isResendConfigured(): Promise<boolean> {
  const key = await getApiKey("resend");
  const from = await getResendFromAddress();
  return Boolean(key && from);
}

export async function sendEmailViaResend(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const key = await getApiKey("resend");
  if (!key) throw new Error("No Resend API key. Add one in Settings.");
  const from = await getResendFromAddress();
  if (!from) throw new Error('No Resend "from" address configured. Add one in Settings.');

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend error ${res.status}: ${t.slice(0, 300)}`);
  }
}
