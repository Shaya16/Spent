"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { PageHeader } from "@/components/layout/app-shell";
import { QueryError } from "@/components/ui/query-error";
import type { Locale } from "@/i18n/routing";
import type { TransactionKindFilter } from "@/lib/api";
import {
  getCategories,
  getTransactions,
  getTransactionsSummary,
  listIntegrations,
} from "@/lib/api";
import { addMonths, formatMonthLabel, getMonthRange, isCurrentMonth } from "@/lib/formatters";
import { expandCategoryFilterIds } from "@/lib/transaction-filters";
import { nextSortState, type SortOrder, type TransactionSortField } from "@/lib/transaction-sort";
import { KpiCards } from "./kpi-cards";
import { WidgetsRow } from "./widgets-row";

export function TransactionsPage() {
  const t = useTranslations("transactions");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number[]>([]);
  const [accountFilter, setAccountFilter] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const [sortField, setSortField] = useState<TransactionSortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const filterOptions: { value: TransactionKindFilter; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "income", label: t("filterIncome") },
    { value: "expense", label: t("filterExpenses") },
  ];

  const { from, to } = getMonthRange(selectedDate);

  const allCategoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: () => listIntegrations(),
  });

  const expandedCategoryIds = expandCategoryFilterIds(
    categoryFilter,
    allCategoriesQuery.data ?? [],
  );

  const transactionsQuery = useQuery({
    queryKey: [
      "transactions",
      from,
      to,
      search,
      categoryFilter,
      accountFilter,
      page,
      kind,
      sortField,
      sortOrder,
    ],
    queryFn: () =>
      getTransactions({
        from,
        to,
        search: search || undefined,
        categoryIds: expandedCategoryIds,
        credentialIds: accountFilter.length > 0 ? accountFilter : undefined,
        limit: 50,
        offset: page * 50,
        kind,
        sort: sortField,
        order: sortOrder,
      }),
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ["transactions-summary", from, to],
    queryFn: () => getTransactionsSummary({ from, to }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", kind === "income" ? "income" : "expense"],
    queryFn: () => (kind === "income" ? getCategories("income") : getCategories("expense")),
  });

  const monthLabel = formatMonthLabel(selectedDate, locale);

  const summaryInitialLoading = summaryQuery.isPending && summaryQuery.data === undefined;
  const tableInitialLoading = transactionsQuery.isPending && transactionsQuery.data === undefined;

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        meta={monthLabel}
        actions={
          <PeriodSelector
            label={monthLabel}
            onPrev={() => setSelectedDate((d) => addMonths(d, -1))}
            onNext={() => setSelectedDate((d) => addMonths(d, 1))}
            prevLabel={tc("previousMonth")}
            nextLabel={tc("nextMonth")}
            nextDisabled={isCurrentMonth(selectedDate)}
          />
        }
      />

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <AINotConnectedBanner />
        <KpiCards summary={summaryQuery.data} loading={summaryInitialLoading} />

        <WidgetsRow summary={summaryQuery.data} loading={summaryInitialLoading} />

        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-1 w-fit">
          {filterOptions.map((opt) => {
            const active = kind === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setKind(opt.value);
                  setPage(0);
                  setCategoryFilter([]);
                }}
                className={
                  active
                    ? "rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors"
                    : "rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {transactionsQuery.isError && !transactionsQuery.data ? (
          <QueryError onRetry={() => transactionsQuery.refetch()} />
        ) : (
          <TransactionsTable
            transactions={transactionsQuery.data?.transactions ?? []}
            total={transactionsQuery.data?.total ?? 0}
            categories={categoriesQuery.data ?? []}
            integrations={integrationsQuery.data ?? []}
            loading={tableInitialLoading}
            isFetching={transactionsQuery.isFetching}
            sortField={sortField}
            sortOrder={sortOrder}
            onSortChange={(field) => {
              const next = nextSortState(sortField, sortOrder, field);
              setSortField(next.field);
              setSortOrder(next.order);
              setPage(0);
            }}
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={(ids) => {
              setCategoryFilter(ids);
              setPage(0);
            }}
            accountFilter={accountFilter}
            onAccountFilterChange={(ids) => {
              setAccountFilter(ids);
              setPage(0);
            }}
            page={page}
            onPageChange={setPage}
          />
        )}
      </div>
    </>
  );
}
