export interface Transaction {
  id: number;
  accountNumber: string;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  description: string;
  memo: string | null;
  type: "normal" | "installments";
  status: "completed" | "pending";
  identifier: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  categoryId: number | null;
  categorySource: "ai" | "user" | null;
  provider: string;
  syncRunId: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionWithCategory extends Transaction {
  categoryName: string | null;
  categoryColor: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
}

export interface SyncRun {
  id: number;
  provider: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  errorMessage: string | null;
  transactionsAdded: number;
  transactionsUpdated: number;
  scrapeFromDate: string;
  createdAt: string;
}

export interface MonthlySummary {
  month: string;
  amount: number;
}

export interface MerchantSummary {
  name: string;
  amount: number;
  count: number;
}

export interface CategoryBreakdown {
  categoryId: number;
  name: string;
  color: string;
  amount: number;
  count: number;
}

export interface DashboardSummary {
  periodTotal: number;
  transactionCount: number;
  monthlySpend: MonthlySummary[];
  topMerchants: MerchantSummary[];
  categoryBreakdown: CategoryBreakdown[];
}

export interface SetupStatus {
  isConfigured: boolean;
  hasBankCredentials: boolean;
  hasAIProvider: boolean;
}

export interface AppSettings {
  monthsToSync: number;
  aiProvider: "claude" | "ollama" | "none";
  ollamaUrl: string;
  ollamaModel: string;
  showBrowser: boolean;
}

export type BankProvider = "isracard" | "cal" | "max" | "hapoalim" | "leumi";

export interface BankProviderInfo {
  id: BankProvider;
  name: string;
  credentialFields: { key: string; label: string; type: string }[];
  enabled: boolean;
}

export const BANK_PROVIDERS: BankProviderInfo[] = [
  {
    id: "isracard",
    name: "Isracard",
    credentialFields: [
      { key: "id", label: "ID Number", type: "text" },
      { key: "card6Digits", label: "Last 6 Digits", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "cal",
    name: "Cal",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: false,
  },
  {
    id: "max",
    name: "Max",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: false,
  },
  {
    id: "hapoalim",
    name: "Bank Hapoalim",
    credentialFields: [
      { key: "userCode", label: "User Code", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: false,
  },
  {
    id: "leumi",
    name: "Bank Leumi",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: false,
  },
];
