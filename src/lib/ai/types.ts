export type ProviderId =
  | "deepseek"
  | "claude"
  | "openai"
  | "gemini"
  | "kimi"
  | "grok";

export type TaskKind =
  | "website_analysis"
  | "lead_research"
  | "email_writing"
  | "linkedin_writing"
  | "facebook_writing"
  | "chat_orchestration";

export interface CompletionRequest {
  system?: string;
  prompt: string;
  json?: boolean;
  /** JSON schema to enforce via provider structured-output support (currently used by Anthropic). */
  schema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  providerId: ProviderId;
  modelId: string;
}

export interface ProviderModel {
  id: string;
  label: string;
  /** USD per 1M input/output tokens — approximate public pricing for cost estimates */
  inputPerM: number;
  outputPerM: number;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  baseUrl: string;
  models: ProviderModel[];
  /** OpenAI-compatible chat completions vs Anthropic messages */
  apiStyle: "openai" | "anthropic" | "gemini";
  implemented: boolean;
}

export interface ModelRouting {
  taskKind: TaskKind;
  providerId: ProviderId;
  modelId: string;
}

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  website_analysis: "Website Analysis & Scoring",
  lead_research: "Lead Research",
  email_writing: "Email Writing",
  linkedin_writing: "LinkedIn Writing",
  facebook_writing: "Facebook Writing",
  chat_orchestration: "Chat Assistant",
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiStyle: "openai",
    implemented: true,
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", inputPerM: 0.14, outputPerM: 0.28 },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", inputPerM: 0.435, outputPerM: 0.87 },
    ],
  },
  {
    id: "claude",
    name: "Claude",
    baseUrl: "https://api.anthropic.com/v1",
    apiStyle: "anthropic",
    implemented: true,
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5", inputPerM: 5.0, outputPerM: 25.0 },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", inputPerM: 3.0, outputPerM: 15.0 },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", inputPerM: 1.0, outputPerM: 5.0 },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiStyle: "openai",
    implemented: true,
    models: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", inputPerM: 0.4, outputPerM: 1.6 },
      { id: "gpt-4.1", label: "GPT-4.1", inputPerM: 2.0, outputPerM: 8.0 },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiStyle: "gemini",
    implemented: true,
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", inputPerM: 0.1, outputPerM: 0.4 },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", inputPerM: 1.25, outputPerM: 10.0 },
    ],
  },
  {
    id: "kimi",
    name: "Kimi",
    baseUrl: "https://api.moonshot.ai/v1",
    apiStyle: "openai",
    implemented: true,
    models: [
      { id: "moonshot-v1-128k", label: "Kimi 128k", inputPerM: 0.6, outputPerM: 2.5 },
      { id: "moonshot-v1-32k", label: "Kimi 32k", inputPerM: 0.6, outputPerM: 2.5 },
    ],
  },
  {
    id: "grok",
    name: "Grok",
    baseUrl: "https://api.x.ai/v1",
    apiStyle: "openai",
    implemented: true,
    models: [
      { id: "grok-3-mini", label: "Grok 3 Mini", inputPerM: 0.3, outputPerM: 0.5 },
      { id: "grok-3", label: "Grok 3", inputPerM: 3.0, outputPerM: 15.0 },
    ],
  },
];

export const DEFAULT_ROUTING: ModelRouting[] = [
  { taskKind: "website_analysis", providerId: "deepseek", modelId: "deepseek-v4-flash" },
  { taskKind: "lead_research", providerId: "deepseek", modelId: "deepseek-v4-flash" },
  { taskKind: "email_writing", providerId: "claude", modelId: "claude-sonnet-5" },
  { taskKind: "linkedin_writing", providerId: "claude", modelId: "claude-sonnet-5" },
  { taskKind: "facebook_writing", providerId: "claude", modelId: "claude-sonnet-5" },
  { taskKind: "chat_orchestration", providerId: "deepseek", modelId: "deepseek-v4-pro" },
];
