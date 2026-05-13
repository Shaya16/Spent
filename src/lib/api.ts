import type {
  SetupStatus,
  AppSettings,
  TransactionWithCategory,
  DashboardSummary,
  Category,
  SyncRun,
  Budget,
  Integration,
} from "./types";

const BASE = "";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "Request failed");
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

export function getSetupStatus() {
  return fetchJSON<SetupStatus>("/api/setup/status");
}

export function saveBankCredentials(
  provider: string,
  credentials: Record<string, string>
) {
  return fetchJSON<{ success: boolean }>("/api/setup/bank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, credentials }),
  });
}

export function testBankConnection(provider: string) {
  return fetchJSON<{
    success: boolean;
    message: string;
    accountsFound?: number;
  }>("/api/setup/bank/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

export function saveAIConfig(config: {
  provider: "claude" | "ollama" | "none";
  apiKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}) {
  return fetchJSON<{ success: boolean }>("/api/setup/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export function getSettings() {
  return fetchJSON<AppSettings>("/api/settings");
}

export function updateSettings(settings: Partial<AppSettings>) {
  return fetchJSON<AppSettings>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export function getTransactions(params: {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, String(value));
  });
  return fetchJSON<{ transactions: TransactionWithCategory[]; total: number }>(
    `/api/transactions?${searchParams}`
  );
}

export function getSummary(params: {
  from: string;
  to: string;
  months?: number;
}) {
  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
  });
  if (params.months) searchParams.set("months", String(params.months));
  return fetchJSON<DashboardSummary>(`/api/summary?${searchParams}`);
}

export function getCategories() {
  return fetchJSON<Category[]>("/api/categories");
}

export function updateTransactionCategory(id: number, categoryId: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId }),
  });
}

export function getBudgets() {
  return fetchJSON<Budget[]>("/api/budgets");
}

export function updateBudget(categoryId: number, amount: number | null) {
  return fetchJSON<{ success: boolean }>("/api/budgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, amount }),
  });
}

export function listIntegrations() {
  return fetchJSON<Integration[]>("/api/integrations");
}

export function deleteIntegration(provider: string) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${provider}`, {
    method: "DELETE",
  });
}

export function getIntegrationCredentials(provider: string) {
  return fetchJSON<{ credentials: Record<string, string> | null }>(
    `/api/integrations/${provider}`
  );
}

export interface SyncProgressEvent {
  type: "progress" | "complete" | "error";
  data: Record<string, unknown>;
}

export function startSync(
  provider: string,
  onEvent: (event: SyncProgressEvent) => void
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent({ type: currentEvent as SyncProgressEvent["type"], data });
            } catch {
              // skip malformed JSON
            }
            currentEvent = "";
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onEvent({
        type: "error",
        data: { message: "Connection to sync service lost" },
      });
    }
  })();

  return { cancel: () => controller.abort() };
}

// Placeholder for last sync info
export function getLastSync() {
  return fetchJSON<SyncRun | null>("/api/sync/last").catch(() => null);
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  speed?: number;
  etaSeconds?: number | null;
}

export interface PullEvent {
  type: "progress" | "complete" | "error";
  data: PullProgress & { message?: string };
}

export function listOllamaModels(url?: string) {
  const qs = url ? `?url=${encodeURIComponent(url)}` : "";
  return fetchJSON<{ models: string[]; error?: string }>(
    `/api/ai/ollama/models${qs}`
  );
}

export function pullOllamaModel(
  model: string,
  url: string | undefined,
  onEvent: (event: PullEvent) => void
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/ai/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, url }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent({ type: currentEvent as PullEvent["type"], data });
            } catch {
              // skip
            }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onEvent({
        type: "error",
        data: { status: "error", message: "Connection to pull endpoint lost" },
      });
    }
  })();

  return { cancel: () => controller.abort() };
}
