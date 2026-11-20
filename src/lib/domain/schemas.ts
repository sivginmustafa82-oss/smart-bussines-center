import { z } from "zod";
import { parseAmount } from "@/lib/format";
import { VAT_RATES } from "./labels";
import type { Expense, MarketplaceTotals, OrderRecord, Product } from "./types";

const MAX_AMOUNT = 1_000_000_000;

/** Money as entered in a form: Turkish or dot decimals, ≥ 0, at most 2 decimals. */
export const moneyField = (label: string) =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      const n = s === "" ? 0 : parseAmount(s);
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} geçerli bir tutar olmalı` });
        return z.NEVER;
      }
      if (n < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} negatif olamaz` });
        return z.NEVER;
      }
      if (n > MAX_AMOUNT) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} çok büyük` });
        return z.NEVER;
      }
      if (Math.round(n * 100) / 100 !== n) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} en fazla 2 ondalık basamak içerebilir` });
        return z.NEVER;
      }
      return n;
    });

/** Like moneyField but empty input means "unknown" (null), not 0. */
export const optionalMoneyField = (label: string) =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (s === "") return null;
      const r = moneyField(label).safeParse(s);
      if (!r.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error.issues[0]?.message ?? `${label} geçersiz` });
        return z.NEVER;
      }
      return r.data;
    });

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Geçerli bir tarih seçin")
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Geçerli bir tarih seçin");

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Ad en az 2 karakter olmalı").max(80, "Ad en fazla 80 karakter"),
  companyName: z
    .string()
    .trim()
    .min(2, "Şirket / çalışma alanı adı en az 2 karakter olmalı")
    .max(100, "En fazla 100 karakter"),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin").max(255),
  password: z
    .string()
    .min(8, "Şifre en az 8 karakter olmalı")
    .max(128, "Şifre en fazla 128 karakter")
    .regex(/[A-Za-zÇĞİÖŞÜçğıöşü]/, "Şifre en az bir harf içermeli")
    .regex(/\d/, "Şifre en az bir rakam içermeli"),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin").max(255),
  password: z.string().min(1, "Şifrenizi girin").max(128),
});

export const storeSchema = z.object({
  name: z.string().trim().min(2, "Mağaza adı en az 2 karakter olmalı").max(80, "En fazla 80 karakter"),
  marketplace: z.literal("trendyol", {
    errorMap: () => ({ message: "Şimdilik yalnızca Trendyol mağazası eklenebilir" }),
  }),
});

export const productSchema = z.object({
  storeId: z.string().min(1, "Mağaza seçin"),
  name: z.string().trim().min(2, "Ürün adı en az 2 karakter olmalı").max(200, "En fazla 200 karakter"),
  sku: z
    .string()
    .trim()
    .min(1, "Stok kodu (SKU) girin")
    .max(64, "En fazla 64 karakter")
    .regex(/^[A-Za-z0-9._\-/]+$/, "Stok kodu yalnızca harf, rakam ve . _ - / içerebilir"),
  barcode: z
    .string()
    .trim()
    .max(32, "En fazla 32 karakter")
    .regex(/^[0-9A-Za-z]*$/, "Barkod yalnızca harf ve rakam içerebilir"),
  unitCost: optionalMoneyField("Birim maliyet"),
  vatRate: z.coerce
    .number()
    .refine((v) => (VAT_RATES as readonly number[]).includes(v), "Geçerli bir KDV oranı seçin"),
});

export const orderRecordSchema = z.object({
  storeId: z.string().min(1, "Mağaza seçin"),
  type: z.enum(["sale", "return", "cancellation"], { errorMap: () => ({ message: "Kayıt türü seçin" }) }),
  orderNumber: z
    .string()
    .trim()
    .min(1, "Sipariş numarası girin")
    .max(50, "En fazla 50 karakter")
    .regex(/^[A-Za-z0-9\-_]+$/, "Sipariş no yalnızca harf, rakam, - ve _ içerebilir"),
  date: isoDate,
  productId: z.string().nullable(),
  quantity: z.coerce
    .number({ invalid_type_error: "Adet girin" })
    .int("Adet tam sayı olmalı")
    .min(1, "Adet en az 1 olmalı")
    .max(100000, "Adet çok büyük"),
  grossAmount: moneyField("Brüt tutar").refine((n) => n > 0, "Brüt tutar 0'dan büyük olmalı"),
  discountAmount: moneyField("İndirim"),
  couponAmount: moneyField("Kupon"),
  commissionAmount: moneyField("Komisyon"),
  shippingAmount: moneyField("Kargo"),
  withholdingAmount: moneyField("Stopaj"),
  note: z.string().trim().max(300, "Not en fazla 300 karakter"),
}).superRefine((v, ctx) => {
  if (v.discountAmount + v.couponAmount > v.grossAmount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discountAmount"],
      message: "İndirim + kupon brüt tutardan büyük olamaz",
    });
  }
});

export const expenseSchema = z.object({
  storeId: z.string().nullable(),
  date: isoDate,
  category: z.enum(["reklam", "kargo", "vergi", "paketleme", "personel", "yazilim", "kira", "diger"], {
    errorMap: () => ({ message: "Kategori seçin" }),
  }),
  amount: moneyField("Tutar").refine((n) => n > 0, "Tutar 0'dan büyük olmalı"),
  description: z.string().trim().min(2, "Açıklama girin").max(300, "En fazla 300 karakter"),
});

export const reconciliationSchema = z.object({
  storeId: z.string().min(1, "Mağaza seçin"),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Dönem seçin"),
  grossSales: optionalMoneyField("Brüt satış"),
  cancellations: optionalMoneyField("İptaller"),
  returns: optionalMoneyField("İadeler"),
  discounts: optionalMoneyField("İndirimler"),
  commission: optionalMoneyField("Komisyon"),
  shipping: optionalMoneyField("Kargo"),
  withholding: optionalMoneyField("Stopaj"),
  netPayout: optionalMoneyField("Net hakediş"),
  note: z.string().trim().max(300, "En fazla 300 karakter"),
});

export type FieldKey =
  | keyof OrderRecord
  | keyof Product
  | keyof Expense
  | keyof MarketplaceTotals
  | "name"
  | "companyName"
  | "email"
  | "password"
  | "marketplace"
  | "period"
  | "_form";

export type FieldErrors = Partial<Record<FieldKey, string>>;

/** Flattens zod issues into { field: firstMessage } for inline form errors. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out as FieldErrors;
}
