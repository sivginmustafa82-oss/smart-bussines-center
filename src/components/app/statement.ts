import type { ProfitBreakdown } from "@/lib/domain/profitability";

export type StatementLine = {
  key: keyof Omit<ProfitBreakdown, "margin" | "counts" | "missingCostRecords" | "sources">;
  label: string;
  kind: "plus" | "minus" | "subtotal" | "total";
  from: string;
  explain: string;
};

export const STATEMENT_LINES: StatementLine[] = [
  { key: "grossSales", label: "Brüt satış", kind: "plus", from: "Satış kayıtları", explain: "Satış kayıtlarındaki brüt tutarların toplamı." },
  { key: "cancellations", label: "İptaller", kind: "minus", from: "İptal kayıtları", explain: "İptal kayıtlarındaki brüt tutarlar." },
  { key: "returns", label: "İadeler", kind: "minus", from: "İade kayıtları", explain: "İade kayıtlarındaki brüt tutarlar." },
  { key: "discounts", label: "İndirim ve kuponlar", kind: "minus", from: "Sipariş kayıtları", explain: "Satıştaki indirim + kupon; iade/iptalde geri alınan indirimler düşülür." },
  { key: "netSales", label: "Net satış", kind: "subtotal", from: "Hesaplanan", explain: "Brüt satış − iptaller − iadeler − indirim ve kuponlar." },
  { key: "commission", label: "Pazaryeri komisyonu", kind: "minus", from: "Sipariş kayıtları", explain: "Satış komisyonu − iade/iptalde geri alınan komisyon." },
  { key: "shipping", label: "Kargo", kind: "minus", from: "Sipariş + Giderler", explain: "Tüm sipariş kayıtlarındaki kargo (iade kargosu dahil) + 'Kargo' kategorisindeki giderler." },
  { key: "advertising", label: "Reklam", kind: "minus", from: "Giderler", explain: "'Reklam' kategorisindeki giderler." },
  { key: "taxes", label: "Stopaj / vergiler", kind: "minus", from: "Sipariş + Giderler", explain: "Satış stopajı − geri alınan stopaj + 'Vergi / Stopaj' giderleri." },
  { key: "productCost", label: "Ürün maliyeti", kind: "minus", from: "Ürün maliyetleri", explain: "Birim maliyet × satılan adet; iade/iptal edilen adetler stoğa döndüğü varsayılarak düşülür." },
  { key: "otherExpenses", label: "Diğer giderler", kind: "minus", from: "Giderler", explain: "Paketleme, personel, yazılım, kira ve diğer kategorideki giderler." },
  { key: "netProfit", label: "Net kâr", kind: "total", from: "Hesaplanan", explain: "Net satış − tüm kesinti ve giderler." },
];
