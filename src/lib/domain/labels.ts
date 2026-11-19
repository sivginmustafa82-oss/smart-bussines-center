import type { ExpenseCategory, Marketplace, RecordType } from "./types";

export const MARKETPLACES: { value: Marketplace; label: string; available: boolean }[] = [
  { value: "trendyol", label: "Trendyol", available: true },
  { value: "hepsiburada", label: "Hepsiburada", available: false },
  { value: "amazon_tr", label: "Amazon Türkiye", available: false },
  { value: "n11", label: "n11", available: false },
];

export const marketplaceLabel = (m: Marketplace) =>
  MARKETPLACES.find((x) => x.value === m)?.label ?? m;

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  sale: "Satış",
  return: "İade",
  cancellation: "İptal",
};

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; hint: string }[] = [
  { value: "reklam", label: "Reklam", hint: "Kârlılıkta 'Reklam' satırına yazılır" },
  { value: "kargo", label: "Kargo", hint: "Kârlılıkta 'Kargo' satırına eklenir" },
  { value: "vergi", label: "Vergi / Stopaj", hint: "Kârlılıkta 'Stopaj / vergiler' satırına eklenir" },
  { value: "paketleme", label: "Paketleme", hint: "Diğer giderler" },
  { value: "personel", label: "Personel", hint: "Diğer giderler" },
  { value: "yazilim", label: "Yazılım / Abonelik", hint: "Diğer giderler" },
  { value: "kira", label: "Kira / Depo", hint: "Diğer giderler" },
  { value: "diger", label: "Diğer", hint: "Diğer giderler" },
];

export const expenseCategoryLabel = (c: ExpenseCategory) =>
  EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export const VAT_RATES = [0, 1, 10, 20] as const;
