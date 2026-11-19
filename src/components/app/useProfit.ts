import { useMemo } from "react";
import { useWorkspace } from "@/lib/data/hooks";
import { calculateProfit, filterExpenses, filterRecords } from "@/lib/domain/profitability";
import { useFilters } from "./filters";

/** Filtered records/expenses and the profit breakdown for the current filter bar. */
export function useFilteredProfit() {
  const ws = useWorkspace();
  const { filters } = useFilters();
  return useMemo(() => {
    const storeValid = filters.storeId === "all" || ws.stores.some((s) => s.id === filters.storeId);
    const f = storeValid ? filters : { ...filters, storeId: "all" as const };
    const records = filterRecords(ws.orders, f);
    const expenses = filterExpenses(ws.expenses, f);
    const breakdown = calculateProfit(records, expenses, ws.products);
    return { ws, filters: f, records, expenses, breakdown, hasData: records.length + expenses.length > 0 };
  }, [ws, filters]);
}
