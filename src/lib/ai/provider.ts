import "server-only";

import type { AiProviderConfig, AiProviderId } from "@/lib/env";
import { getAvailableAiProviders } from "@/lib/env";

/**
 * Provider-independent chat + tool-calling interface.
 *
 * Adapters talk to each vendor's HTTP API directly rather than through an SDK,
 * so adding a provider is one function and no dependency change. API keys are
 * read from the server environment and never travel to the browser.
 */

export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type AiTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AiMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text?: string; toolCalls?: ToolCall[] }
  | { role: "tool"; callId: string; name: string; result: string };

export type AiRequest = {
  system: string;
  messages: AiMessage[];
  tools?: AiTool[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type AiResponse = {
  text: string;
  toolCalls: ToolCall[];
  stopReason: "end" | "tool_use" | "max_tokens" | "other";
};

export class AiError extends Error {
  constructor(
    message: string,
    readonly provider: AiProviderId,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly model: string;
  complete(request: AiRequest): Promise<AiResponse>;
}

const REQUEST_TIMEOUT_MS = 90_000;

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  provider: AiProviderId,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      // Vendor error bodies can contain the request echo; truncate so a large
      // payload cannot flood the log or the activity stream.
      throw new AiError(
        `${provider} request failed (${response.status}): ${text.slice(0, 400)}`,
        provider,
        response.status,
      );
    }
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof AiError) throw error;
    if ((error as Error).name === "AbortError") {
      throw new AiError(`${provider} request timed out.`, provider);
    }
    throw new AiError(`${provider} request failed: ${(error as Error).message}`, provider);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ---------------------------------------------------------------------------
// Anthropic / Claude
// ---------------------------------------------------------------------------

function anthropicProvider(config: AiProviderConfig): AiProvider {
  return {
    id: "anthropic",
    model: config.model,
    async complete(request) {
      const messages = request.messages.map((message) => {
        if (message.role === "user") {
          return { role: "user", content: [{ type: "text", text: message.text }] };
        }
        if (message.role === "assistant") {
          const content: unknown[] = [];
          if (message.text) content.push({ type: "text", text: message.text });
          for (const call of message.toolCalls ?? []) {
            content.push({
              type: "tool_use",
              id: call.id,
              name: call.name,
              input: call.input,
            });
          }
          return { role: "assistant", content };
        }
        return {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: message.callId,
              content: message.result,
            },
          ],
        };
      });

      const payload = await postJson(
        `${config.baseUrl}/v1/messages`,
        {
          model: config.model,
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0,
          system: request.system,
          messages,
          ...(request.tools?.length
            ? {
                tools: request.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  input_schema: tool.inputSchema,
                })),
              }
            : {}),
        },
        {
          "x-api-key": config.apiKey!,
          "anthropic-version": "2023-06-01",
        },
        "anthropic",
        request.signal,
      );

      const data = payload as {
        content?: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
        stop_reason?: string;
      };

      const text = (data.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");

      const toolCalls: ToolCall[] = (data.content ?? [])
        .filter((block) => block.type === "tool_use")
        .map((block) => ({
          id: block.id!,
          name: block.name!,
          input: block.input ?? {},
        }));

      return {
        text,
        toolCalls,
        stopReason:
          data.stop_reason === "tool_use"
            ? "tool_use"
            : data.stop_reason === "max_tokens"
              ? "max_tokens"
              : data.stop_reason === "end_turn"
                ? "end"
                : "other",
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Google Gemini
// ---------------------------------------------------------------------------

/**
 * Reasoning tokens allowed per Gemini call. Enough for the model to plan a
 * tool call, small enough that it cannot eat the whole response budget.
 */
const GEMINI_THINKING_BUDGET = 512;

function geminiProvider(config: AiProviderConfig): AiProvider {
  return {
    id: "gemini",
    model: config.model,
    async complete(request) {
      const contents = request.messages.map((message) => {
        if (message.role === "user") {
          return { role: "user", parts: [{ text: message.text }] };
        }
        if (message.role === "assistant") {
          const parts: unknown[] = [];
          if (message.text) parts.push({ text: message.text });
          for (const call of message.toolCalls ?? []) {
            parts.push({ functionCall: { name: call.name, args: call.input } });
          }
          return { role: "model", parts };
        }
        return {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: message.name,
                response: { result: message.result },
              },
            },
          ],
        };
      });

      const payload = await postJson(
        `${config.baseUrl}/models/${config.model}:generateContent`,
        {
          systemInstruction: { parts: [{ text: request.system }] },
          contents,
          generationConfig: {
            temperature: request.temperature ?? 0,
            /*
             * Gemini 3.x counts internal reasoning tokens against
             * maxOutputTokens. Passing the caller's budget straight through
             * lets thinking consume all of it and return a sentence that stops
             * mid-word. Two defences:
             *   - thinkingBudget caps reasoning rather than leaving it open,
             *   - the ceiling is raised so the visible answer has room after it.
             */
            maxOutputTokens: (request.maxTokens ?? 2048) + GEMINI_THINKING_BUDGET,
            thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET },
          },
          ...(request.tools?.length
            ? {
                tools: [
                  {
                    functionDeclarations: request.tools.map((tool) => ({
                      name: tool.name,
                      description: tool.description,
                      parameters: stripUnsupportedSchemaKeys(tool.inputSchema),
                    })),
                  },
                ],
              }
            : {}),
        },
        { "x-goog-api-key": config.apiKey! },
        "gemini",
        request.signal,
      );

      const data = payload as {
        candidates?: {
          content?: {
            parts?: {
              text?: string;
              /** Gemini 3.x marks internal reasoning parts with this flag. */
              thought?: boolean;
              functionCall?: { name: string; args: Record<string, unknown> };
            }[];
          };
          finishReason?: string;
        }[];
      };

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      // Reasoning parts are the model thinking aloud, not its answer. Including
      // them would leak scratch work into the text shown to the user.
      const text = parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("");
      const toolCalls: ToolCall[] = parts
        .filter((p) => p.functionCall)
        .map((p, index) => ({
          // Gemini does not return call ids; synthesise a stable one.
          id: `gemini_call_${index}`,
          name: p.functionCall!.name,
          input: p.functionCall!.args ?? {},
        }));

      const finish = data.candidates?.[0]?.finishReason;
      return {
        text,
        toolCalls,
        stopReason:
          toolCalls.length > 0
            ? "tool_use"
            : finish === "MAX_TOKENS"
              ? "max_tokens"
              : finish === "STOP"
                ? "end"
                : "other",
      };
    },
  };
}

/** Gemini rejects JSON Schema keywords it does not implement. */
function stripUnsupportedSchemaKeys(schema: JsonSchema): unknown {
  const clone = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    delete record.additionalProperties;
    delete record.$schema;
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(clone);
  return clone;
}

// ---------------------------------------------------------------------------
// OpenAI (and any OpenAI-compatible endpoint)
// ---------------------------------------------------------------------------

function openaiProvider(config: AiProviderConfig): AiProvider {
  return {
    id: "openai",
    model: config.model,
    async complete(request) {
      const messages: unknown[] = [{ role: "system", content: request.system }];
      for (const message of request.messages) {
        if (message.role === "user") {
          messages.push({ role: "user", content: message.text });
        } else if (message.role === "assistant") {
          messages.push({
            role: "assistant",
            content: message.text ?? null,
            ...(message.toolCalls?.length
              ? {
                  tool_calls: message.toolCalls.map((call) => ({
                    id: call.id,
                    type: "function",
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.input),
                    },
                  })),
                }
              : {}),
          });
        } else {
          messages.push({
            role: "tool",
            tool_call_id: message.callId,
            content: message.result,
          });
        }
      }

      const payload = await postJson(
        `${config.baseUrl}/chat/completions`,
        {
          model: config.model,
          messages,
          temperature: request.temperature ?? 0,
          max_completion_tokens: request.maxTokens ?? 2048,
          ...(request.tools?.length
            ? {
                tools: request.tools.map((tool) => ({
                  type: "function",
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                  },
                })),
              }
            : {}),
        },
        { authorization: `Bearer ${config.apiKey}` },
        "openai",
        request.signal,
      );

      const data = payload as {
        choices?: {
          message?: {
            content?: string | null;
            tool_calls?: { id: string; function: { name: string; arguments: string } }[];
          };
          finish_reason?: string;
        }[];
      };

      const choice = data.choices?.[0];
      const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        input: safeParseJson(call.function.arguments),
      }));

      return {
        text: choice?.message?.content ?? "",
        toolCalls,
        stopReason:
          choice?.finish_reason === "tool_calls"
            ? "tool_use"
            : choice?.finish_reason === "length"
              ? "max_tokens"
              : choice?.finish_reason === "stop"
                ? "end"
                : "other",
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Ollama (local models)
// ---------------------------------------------------------------------------

function ollamaProvider(config: AiProviderConfig): AiProvider {
  return {
    id: "ollama",
    model: config.model,
    async complete(request) {
      const messages: unknown[] = [{ role: "system", content: request.system }];
      for (const message of request.messages) {
        if (message.role === "user") {
          messages.push({ role: "user", content: message.text });
        } else if (message.role === "assistant") {
          messages.push({
            role: "assistant",
            content: message.text ?? "",
            ...(message.toolCalls?.length
              ? {
                  tool_calls: message.toolCalls.map((call) => ({
                    function: { name: call.name, arguments: call.input },
                  })),
                }
              : {}),
          });
        } else {
          messages.push({ role: "tool", content: message.result });
        }
      }

      const payload = await postJson(
        `${config.baseUrl}/api/chat`,
        {
          model: config.model,
          messages,
          stream: false,
          options: { temperature: request.temperature ?? 0 },
          ...(request.tools?.length
            ? {
                tools: request.tools.map((tool) => ({
                  type: "function",
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                  },
                })),
              }
            : {}),
        },
        {},
        "ollama",
        request.signal,
      );

      const data = payload as {
        message?: {
          content?: string;
          tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[];
        };
        done_reason?: string;
      };

      const toolCalls: ToolCall[] = (data.message?.tool_calls ?? []).map((call, index) => ({
        id: `ollama_call_${index}`,
        name: call.function.name,
        input:
          typeof call.function.arguments === "string"
            ? safeParseJson(call.function.arguments)
            : (call.function.arguments ?? {}),
      }));

      return {
        text: data.message?.content ?? "",
        toolCalls,
        stopReason: toolCalls.length > 0 ? "tool_use" : "end",
      };
    },
  };
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------

function build(config: AiProviderConfig): AiProvider {
  switch (config.id) {
    case "anthropic":
      return anthropicProvider(config);
    case "gemini":
      return geminiProvider(config);
    case "openai":
      return openaiProvider(config);
    case "ollama":
      return ollamaProvider(config);
  }
}

/** Every configured provider, in preference order. */
export function getProviders(): AiProvider[] {
  return getAvailableAiProviders().map(build);
}

export function hasAiProvider(): boolean {
  return getAvailableAiProviders().length > 0;
}

/**
 * Calls the first configured provider, falling back to the next on failure.
 * Returns which provider actually answered so the UI can show it truthfully.
 */
export async function completeWithFallback(
  request: AiRequest,
): Promise<{ response: AiResponse; provider: AiProvider }> {
  const providers = getProviders();
  if (providers.length === 0) {
    throw new AiError(
      "No AI provider is configured. Add an API key to .env.local.",
      "anthropic",
    );
  }

  let lastError: unknown;
  for (const provider of providers) {
    try {
      return { response: await provider.complete(request), provider };
    } catch (error) {
      lastError = error;
      console.error(`[ai] ${provider.id} failed, trying next provider`, error);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new AiError("All AI providers failed.", "anthropic");
}
