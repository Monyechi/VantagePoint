export type ProviderId =
  | "deepseek"
  | "claude"
  | "openai"
  | "gemini"
  | "kimi"
  | "grok";

export type TaskKind =
  | "website_analysis"
  | "lead_scoring"
  | "lead_research"
  | "email_writing"
  | "linkedin_writing"
  | "facebook_writing";

export interface CompletionRequest {
  system?: string;
  prompt: string;
  json?: boolean;
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
  website_analysis: "Website Analysis",
  lead_scoring: "Lead Scoring",
  lead_research: "Lead Research",
  email_writing: "Email Writing",
  linkedin_writing: "LinkedIn Writing",
  facebook_writing: "Facebook Writing",
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiStyle: "openai",
    implemented: true,
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat (V4)" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
  },
  {
    id: "claude",
    name: "Claude",
    baseUrl: "https://api.anthropic.com/v1",
    apiStyle: "anthropic",
    implemented: true,
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { id: "claude-haiku-4-20250514", label: "Claude Haiku 4" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiStyle: "openai",
    implemented: true,
    models: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiStyle: "gemini",
    implemented: true,
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
  },
  {
    id: "kimi",
    name: "Kimi",
    baseUrl: "https://api.moonshot.ai/v1",
    apiStyle: "openai",
    implemented: true,
    models: [
      { id: "moonshot-v1-128k", label: "Kimi 128k" },
      { id: "moonshot-v1-32k", label: "Kimi 32k" },
    ],
  },
  {
    id: "grok",
    name: "Grok",
    baseUrl: "https://api.x.ai/v1",
    apiStyle: "openai",
    implemented: true,
    models: [
      { id: "grok-3-mini", label: "Grok 3 Mini" },
      { id: "grok-3", label: "Grok 3" },
    ],
  },
];

export const DEFAULT_ROUTING: ModelRouting[] = [
  { taskKind: "website_analysis", providerId: "deepseek", modelId: "deepseek-chat" },
  { taskKind: "lead_scoring", providerId: "deepseek", modelId: "deepseek-chat" },
  { taskKind: "lead_research", providerId: "deepseek", modelId: "deepseek-chat" },
  { taskKind: "email_writing", providerId: "claude", modelId: "claude-sonnet-4-20250514" },
  { taskKind: "linkedin_writing", providerId: "claude", modelId: "claude-sonnet-4-20250514" },
  { taskKind: "facebook_writing", providerId: "claude", modelId: "claude-sonnet-4-20250514" },
];
