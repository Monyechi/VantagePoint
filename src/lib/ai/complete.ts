import { fetch } from "@tauri-apps/plugin-http";
import { getApiKey } from "@/lib/db/queries";
import {
  PROVIDERS,
  type CompletionRequest,
  type CompletionResult,
  type ProviderId,
  type TaskKind,
} from "./types";
import { getRoutingForTask } from "./routing";

async function getKey(providerId: ProviderId): Promise<string> {
  const key = await getApiKey(providerId);
  if (!key) {
    throw new Error(
      `No API key for ${providerId}. Add it in Settings before running this task.`,
    );
  }
  return key;
}

async function completeOpenAICompatible(
  providerId: ProviderId,
  modelId: string,
  req: CompletionRequest,
): Promise<CompletionResult> {
  const provider = PROVIDERS.find((p) => p.id === providerId)!;
  const apiKey = await getKey(providerId);
  const messages: { role: string; content: string }[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.prompt });

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature: req.temperature ?? 0.4,
    max_tokens: req.maxTokens ?? 2048,
  };
  if (req.json) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${provider.name} error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    providerId,
    modelId,
  };
}

async function completeAnthropic(
  modelId: string,
  req: CompletionRequest,
): Promise<CompletionResult> {
  const apiKey = await getKey("claude");
  const body: Record<string, unknown> = {
    model: modelId,
    max_tokens: req.maxTokens ?? 2048,
    temperature: req.temperature ?? 0.4,
    messages: [{ role: "user", content: req.prompt }],
  };
  if (req.system) body.system = req.system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");

  return {
    text,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    providerId: "claude",
    modelId,
  };
}

async function completeGemini(
  modelId: string,
  req: CompletionRequest,
): Promise<CompletionResult> {
  const apiKey = await getKey("gemini");
  const contents: { role: string; parts: { text: string }[] }[] = [];
  const prompt = req.system
    ? `${req.system}\n\n${req.prompt}`
    : req.prompt;
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxTokens ?? 2048,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";

  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount,
    outputTokens: data.usageMetadata?.candidatesTokenCount,
    providerId: "gemini",
    modelId,
  };
}

export async function completeWithRouting(
  taskKind: TaskKind,
  req: CompletionRequest,
): Promise<CompletionResult> {
  const routing = await getRoutingForTask(taskKind);
  return complete(routing.providerId, routing.modelId, req);
}

export async function complete(
  providerId: ProviderId,
  modelId: string,
  req: CompletionRequest,
): Promise<CompletionResult> {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (provider.apiStyle === "anthropic") {
        return await completeAnthropic(modelId, req);
      }
      if (provider.apiStyle === "gemini") {
        return await completeGemini(modelId, req);
      }
      return await completeOpenAICompatible(providerId, modelId, req);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.includes("500") || msg.includes("503")) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
