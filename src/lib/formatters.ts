export function formatCurrency(amount: number, currency = "ILS"): string {
  if (currency === "ILS") {
    return `₪${Math.abs(amount).toLocaleString("en-IL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return new Intl.NumberFormat("en-IL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
}

export function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatMonth(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function getMonthRange(date: Date = new Date()): {
  from: string;
  to: string;
} {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
