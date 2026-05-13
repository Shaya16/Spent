"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { updateTransactionCategory } from "@/lib/api";
import type { TransactionWithCategory, Category } from "@/lib/types";

interface TransactionsTableProps {
  transactions: TransactionWithCategory[];
  total: number;
  categories: Category[];
  loading: boolean;
  search: string;
  onSearchChange: (search: string) => void;
  categoryFilter: number | undefined;
  onCategoryFilterChange: (category: number | undefined) => void;
  page: number;
  onPageChange: (page: number) => void;
}

const PAGE_SIZE = 50;

export function TransactionsTable({
  transactions,
  total,
  categories,
  loading,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  page,
  onPageChange,
}: TransactionsTableProps) {
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleCategoryChange = async (txnId: number, categoryId: number) => {
    setUpdatingId(txnId);
    try {
      await updateTransactionCategory(txnId, categoryId);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Card className="rounded-2xl border-none bg-card shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="font-serif text-2xl font-normal">
            Transactions
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                onSearchChange(e.target.value);
                onPageChange(0);
              }}
              className="h-8 w-[200px]"
            />
            <Select
              value={categoryFilter ? String(categoryFilter) : "all"}
              onValueChange={(v) => {
                if (!v) return;
                onCategoryFilterChange(v === "all" ? undefined : Number(v));
                onPageChange(0);
              }}
            >
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {search || categoryFilter
              ? "No transactions match your filters."
              : "No transactions yet. Click Sync Now to pull your data."}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[150px]">Category</TableHead>
                  <TableHead className="w-[120px] text-right">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {formatDate(txn.date)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{txn.description}</div>
                      {txn.memo && (
                        <div className="text-xs text-muted-foreground">
                          {txn.memo}
                        </div>
                      )}
                      {txn.type === "installments" &&
                        txn.installmentNumber &&
                        txn.installmentTotal && (
                          <div className="text-xs text-muted-foreground">
                            Payment {txn.installmentNumber} of{" "}
                            {txn.installmentTotal}
                          </div>
                        )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex"
                          disabled={updatingId === txn.id}
                        >
                            <Badge
                              variant="outline"
                              className="cursor-pointer transition-colors hover:bg-accent"
                              style={
                                txn.categoryColor
                                  ? {
                                      borderColor: txn.categoryColor + "40",
                                      backgroundColor: txn.categoryColor + "15",
                                      color: txn.categoryColor,
                                    }
                                  : undefined
                              }
                            >
                              {txn.categoryName ?? "Uncategorized"}
                            </Badge>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {categories.map((cat) => (
                            <DropdownMenuItem
                              key={cat.id}
                              onClick={() =>
                                handleCategoryChange(txn.id, cat.id)
                              }
                            >
                              <div
                                className="mr-2 h-2 w-2 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              {cat.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(txn.chargedAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs text-muted-foreground">
                  {page * PAGE_SIZE + 1} to{" "}
                  {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
