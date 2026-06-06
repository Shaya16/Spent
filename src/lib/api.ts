import type { UIMessage } from "ai";
import type {
  ActivitySnapshot,
  AppSettings,
  Budget,
  BudgetMode,
  Category,
  ChatSession,
  DashboardSummary,
  InsightPayload,
  Integration,
  SetupStatus,
  TransactionWithCategory,
  Workspace,
} from "./types";
import { getActiveWorkspaceIdSync } from "./workspace-store";

const BASE = "";

function withWorkspaceHeader(init?: RequestInit): RequestInit {
  const wsId = getActiveWorkspaceIdSync();
  const headers = new Headers(init?.headers);
  if (wsId != null && !headers.has("x-workspace-id")) {
    headers.set("x-workspace-id", String(wsId));
  }
  return { ...init, headers };
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, withWorkspaceHeader(init));
  if (!res.ok) {
    const text = await res.text().catch(() => "Request failed");
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

export function listWorkspaces() {
  return fetchJSON<Workspace[]>("/api/workspaces");
}

export function createWorkspace(name: string) {
  return fetchJSON<Workspace>("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function renameWorkspace(id: number, name: string) {
  return fetchJSON<Workspace>(`/api/workspaces/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function deleteWorkspace(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/workspaces/${id}`, {
    method: "DELETE",
  });
}

export function getSetupStatus() {
  return fetchJSON<SetupStatus>("/api/setup/status");
}

export function saveBankCredentials(
  provider: string,
  credentials: Record<string, string>,
  options?: {
    label?: string;
    credentialId?: number;
    requiresManualTwoFactor?: boolean;
  },
) {
  return fetchJSON<{ success: boolean; credentialId: number }>("/api/setup/bank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      credentials,
      ...(options?.label !== undefined ? { label: options.label } : {}),
      ...(options?.credentialId !== undefined ? { credentialId: options.credentialId } : {}),
      ...(options?.requiresManualTwoFactor !== undefined
        ? { requiresManualTwoFactor: options.requiresManualTwoFactor }
        : {}),
    }),
  });
}

export function updateIntegrationSettings(
  credentialId: number,
  updates: { requiresManualTwoFactor?: boolean; resetTwoFactorToken?: boolean },
) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${credentialId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function submitSyncOtp(syncRunId: number, code: string) {
  return fetchJSON<{ success: boolean }>("/api/sync/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ syncRunId, code }),
  });
}

export function testBankConnection(
  provider: string,
  options?: { credentialId?: number; credentials?: Record<string, string> },
) {
  return fetchJSON<{
    success: boolean;
    message: string;
    accountsFound?: number;
  }>("/api/setup/bank/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      ...(options?.credentialId !== undefined ? { credentialId: options.credentialId } : {}),
      ...(options?.credentials !== undefined ? { credentials: options.credentials } : {}),
    }),
  });
}

export function saveAIConfig(config: {
  provider: "claude" | "gemini" | "ollama" | "none";
  claudeApiKey?: string;
  geminiApiKey?: string;
  geminiModel?: string;
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

export function listChatSessions() {
  return fetchJSON<ChatSession[]>("/api/chat/sessions");
}

export function getChatSession(id: string) {
  return fetchJSON<{ session: ChatSession; messages: UIMessage[] }>(
    `/api/chat/sessions/${encodeURIComponent(id)}`,
  );
}

export function renameChatSession(id: string, title: string) {
  return fetchJSON<ChatSession>(`/api/chat/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export function deleteChatSession(id: string) {
  return fetchJSON<{ success: boolean }>(`/api/chat/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function updateSettings(settings: Partial<AppSettings>) {
  return fetchJSON<AppSettings>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export type TransactionKindFilter = "expense" | "income" | "all";
export type TransactionKind = "expense" | "income" | "transfer";
export type CategoryKindFilter = "expense" | "income";

export interface TransactionsSummary {
  income: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  expense: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  net: number;
  topMerchants: { description: string; total: number; count: number }[];
  pendingReviewCount: number;
}

export function getTransactionsSummary(params: {
  from: string;
  to: string;
  credentialIds?: number[];
}) {
  const sp = new URLSearchParams({ from: params.from, to: params.to });
  if (params.credentialIds?.length) {
    for (const id of params.credentialIds) {
      sp.append("credentialIds", String(id));
    }
  }
  return fetchJSON<TransactionsSummary>(`/api/transactions/summary?${sp}`);
}

export function getTransactions(params: {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  categoryIds?: number[];
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  kind?: TransactionKindFilter;
  provider?: string;
  credentialIds?: number[];
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if ((key === "categoryIds" || key === "credentialIds") && Array.isArray(value)) {
      for (const id of value) searchParams.append(key, String(id));
      return;
    }
    searchParams.set(key, String(value));
  });
  return fetchJSON<{ transactions: TransactionWithCategory[]; total: number }>(
    `/api/transactions?${searchParams}`,
  );
}

export function setTransactionKind(id: number, kind: TransactionKind) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
}

export function approveTransactionCategory(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approve: true }),
  });
}

export function setTransactionExcluded(id: number, excluded: boolean, alwaysForMerchant = false) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}/exclude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ excluded, alwaysForMerchant }),
  });
}

export interface ExcludedMerchantRule {
  id: number;
  provider: string;
  merchantKey: string;
  createdAt: string;
}

export function listExcludedMerchants() {
  return fetchJSON<{ rules: ExcludedMerchantRule[] }>(`/api/excluded-merchants`);
}

export function deleteExcludedMerchantRule(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/excluded-merchants/${id}`, {
    method: "DELETE",
  });
}

export function getSummary(params: { from: string; to: string; months?: number }) {
  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
  });
  if (params.months) searchParams.set("months", String(params.months));
  return fetchJSON<DashboardSummary>(`/api/summary?${searchParams}`);
}

export function getInsights() {
  return fetchJSON<InsightPayload>(`/api/insights`);
}

export function getActivity() {
  return fetchJSON<ActivitySnapshot>(`/api/activity`);
}

export function getCategories(kind?: CategoryKindFilter) {
  const qs = kind ? `?kind=${kind}` : "";
  return fetchJSON<Category[]>(`/api/categories${qs}`);
}

export function updateTransactionCategory(id: number, categoryId: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId }),
  });
}

export interface CategoryChildBreakdown {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  spent: number;
  budget: number;
  budgetMode: BudgetMode;
  isAutoBudget: boolean;
  percentSpent: number;
}

export interface CategoryDetail {
  category: {
    id: number;
    parentId: number | null;
    name: string;
    color: string;
    icon: string | null;
    kind: "expense" | "income";
    budgetMode: BudgetMode;
    isParent: boolean;
  };
  spent: number;
  budget: number;
  isAutoBudget: boolean;
  budgetSource: "own" | "rollup" | "leaf";
  vsTypical: { typical: number; percentDiff: number } | null;
  remaining: number;
  percentSpent: number;
  transactionCount: number;
  avgPerTransaction: number;
  vsLastMonth: number | null;
  prevSpent: number;
  prevPeriodLabel: string;
  dailySpend: Array<{ date: string; amount: number }>;
  topMerchants: Array<{ merchant: string; amount: number; count: number }>;
  transactions: TransactionWithCategory[];
  needsReviewTransactions: TransactionWithCategory[];
  needsReviewCount: number;
  period: { from: string; to: string };
  children: CategoryChildBreakdown[] | null;
}

export function getCategoryDetail(id: number, params: { from: string; to: string }) {
  const sp = new URLSearchParams({ from: params.from, to: params.to });
  return fetchJSON<CategoryDetail>(`/api/categories/${id}/detail?${sp}`);
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

export function updateCategoryBudgetMode(categoryId: number, mode: BudgetMode) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgetMode: mode }),
  });
}

export function updateCategoryDescription(categoryId: number, description: string | null) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
}

export function setCategoryParent(categoryId: number, parentId: number | null) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId }),
  });
}

export function createCategory(input: {
  name: string;
  kind: CategoryKindFilter;
  isParent?: boolean;
  icon?: string;
  description?: string | null;
}) {
  return fetchJSON<Category>("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function setBudgetModesBulk(budgetedIds: number[]) {
  return fetchJSON<{ success: boolean }>("/api/categories/budget-modes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgetedIds }),
  });
}

export function listIntegrations() {
  return fetchJSON<Integration[]>("/api/integrations");
}

export interface DeleteTransactionsResult {
  success: boolean;
  deleted: { txCount: number; syncCount: number; memoryCount: number };
}

export function deleteAllTransactions() {
  return fetchJSON<DeleteTransactionsResult>("/api/data/transactions", {
    method: "DELETE",
  });
}

export function deleteIntegration(credentialId: number) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${credentialId}`, {
    method: "DELETE",
  });
}

export function getIntegrationCredentials(credentialId: number) {
  return fetchJSON<{
    credentials: Record<string, string> | null;
    label: string | null;
    provider: string | null;
    requiresManualTwoFactor: boolean;
    hasTwoFactorToken: boolean;
  }>(`/api/integrations/${credentialId}`);
}

export function deleteCategory(categoryId: number) {
  return fetchJSON<{
    success: boolean;
    deletedCategoryId: number;
    unassignedTransactionCount: number;
  }>(`/api/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export interface CategorizeAssignment {
  transactionId: number;
  description: string;
  categoryName: string;
  isNew: boolean;
  kind: CategoryKindFilter;
}

export interface CategorizeProposal {
  name: string;
  kind: CategoryKindFilter;
  transactionIds: number[];
  samples: string[];
}

export interface CategorizePreview {
  uncategorizedCount: number;
  assignments: CategorizeAssignment[];
  proposedCategories: CategorizeProposal[];
  existingCategoryUsage: Record<string, number>;
  errors?: string[];
}

export function previewCategorize() {
  return fetchJSON<CategorizePreview>("/api/categorize/preview", {
    method: "POST",
  });
}

export function applyCategorize(payload: {
  assignments: Array<{
    transactionId: number;
    categoryName: string;
    isNew: boolean;
    kind?: CategoryKindFilter;
  }>;
  approvedNewCategoryNames: string[];
  rejectionFallbacks?: Record<string, string>;
}) {
  return fetchJSON<{
    appliedCount: number;
    createdCategoriesCount: number;
    skippedCount: number;
  }>("/api/categorize/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type SyncEventType =
  | "plan"
  | "provider-start"
  | "provider-done"
  | "provider-2fa-needed"
  | "provider-2fa-submitted"
  | "provider-2fa-manual"
  | "stage"
  | "complete"
  | "error";

export interface SyncProgressEvent {
  type: SyncEventType;
  data: Record<string, unknown>;
}

/**
 * Reads a server-sent event stream, invoking `onMessage` for each
 * `event:`/`data:` pair. Malformed JSON payloads are skipped.
 */
async function readSSE(
  res: Response,
  onMessage: (event: string, data: unknown) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        try {
          onMessage(currentEvent, JSON.parse(line.slice(6)));
        } catch {
          // skip malformed JSON
        }
        currentEvent = "";
      }
    }
  }
}

export function startSync(
  credentialId: number | undefined,
  onEvent: (event: SyncProgressEvent) => void,
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        "/api/sync",
        withWorkspaceHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentialId != null ? { credentialId } : {}),
          signal: controller.signal,
        }),
      );
      await readSSE(res, (event, data) =>
        onEvent({
          type: event as SyncProgressEvent["type"],
          data: data as Record<string, unknown>,
        }),
      );
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
  return fetchJSON<{ models: string[]; error?: string }>(`/api/ai/ollama/models${qs}`);
}

export function pullOllamaModel(
  model: string,
  url: string | undefined,
  onEvent: (event: PullEvent) => void,
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        "/api/ai/ollama/pull",
        withWorkspaceHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, url }),
          signal: controller.signal,
        }),
      );
      await readSSE(res, (event, data) =>
        onEvent({
          type: event as PullEvent["type"],
          data: data as PullProgress & { message?: string },
        }),
      );
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
