import { istanbulDateFromEpoch, istanbulDateTimeFromEpoch, resolveSyncRange, trendyolQueryWindows } from "./trendyol-time.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

function getKeyEnv(name: string): string {
  const raw = Deno.env.get(name);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.default === "string") return parsed.default;
  } catch {
    return raw;
  }
  return "";
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveCredentialKey(rootSecret: string, projectUrl: string, usages: KeyUsage[]) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", encoder.encode(rootSecret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(projectUrl),
      info: encoder.encode("smart-business-center:marketplace-credentials:v1"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function encryptCredentials(payload: object, rootSecret: string, projectUrl: string) {
  const key = await deriveCredentialKey(rootSecret, projectUrl, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))),
  );
  return "v1." + toBase64(iv) + "." + toBase64(ciphertext);
}

async function decryptCredentials(ciphertext: string, rootSecret: string, projectUrl: string) {
  const [version, ivText, dataText] = ciphertext.split(".");
  if (version !== "v1" || !ivText || !dataText) throw new Error("Kayıtlı API bilgisi çözümlenemedi.");
  const key = await deriveCredentialKey(rootSecret, projectUrl, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText) },
    key,
    fromBase64(dataText),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as {
    supplierId: string; apiKey: string; apiSecret: string;
  };
}

function friendlyTrendyolError(status: number): string {
  if (status === 401) return "Trendyol API Key veya API Secret hatalı. Bilgileri kontrol edin.";
  if (status === 403) return "Trendyol erişimi reddetti. User-Agent veya API yetkisini kontrol edin.";
  if (status === 429) return "Trendyol istek sınırına ulaşıldı. Birkaç dakika sonra tekrar deneyin.";
  if (status >= 500) return "Trendyol sunucusu şu anda yanıt vermiyor. Daha sonra tekrar deneyin.";
  return "Trendyol isteği başarısız oldu (HTTP " + status + ").";
}

/** Trendyol epoch-ms timestamp → Istanbul calendar day (same result as the original converter). */
function localDate(timestamp: number): string {
  return istanbulDateFromEpoch(timestamp);
}

async function stableUuid(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
    hex.slice(16, 20) + "-" + hex.slice(20);
}

function amount(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
}

function packageStatus(pkg: any): string {
  return String(pkg?.shipmentPackageStatus ?? pkg?.status ?? "").toLowerCase();
}

function recordType(pkg: any, line: any): "sale" | "return" | "cancellation" {
  const packageState = packageStatus(pkg);
  const lineState = String(line?.orderLineItemStatusName ?? "").toLowerCase();
  if (packageState === "cancelled" || packageState === "unsupplied" || lineState === "cancelled") return "cancellation";
  if (packageState === "returned" || lineState === "returned") return "return";
  return "sale";
}

async function fetchJson(url: string, headers: Record<string, string>, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(friendlyTrendyolError(response.status));
  return await response.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = getKeyEnv("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const rootSecret = getKeyEnv("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !publishableKey || !rootSecret) return json({ error: "Sunucu yapılandırması eksik." }, 500);

  const pathname = new URL(req.url).pathname;
  if (req.method === "GET" && pathname.endsWith("/health")) {
    return json({ ok: true, service: "smart-business-center-api", version: 5 });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Oturum gerekli." }, 401);
  const authHeaders = { apikey: publishableKey, Authorization: authorization };
  const userResponse = await fetch(url + "/auth/v1/user", { headers: authHeaders });
  if (!userResponse.ok) return json({ error: "Oturum geçersiz veya süresi dolmuş." }, 401);
  const user = await userResponse.json();
  if (!user?.id) return json({ error: "Kullanıcı doğrulanamadı." }, 401);

  let body: {
    action?: string; store_id?: string; supplier_id?: string; api_key?: string; api_secret?: string; days?: number;
    start_date?: string; end_date?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Geçersiz istek gövdesi." }, 400); }

  const action = body.action;
  if (action !== "connect_trendyol" && action !== "save_trendyol_credentials" && action !== "sync_trendyol_orders" && action !== "sync_trendyol_products") {
    return json({ error: "Desteklenmeyen işlem." }, 400);
  }
  if (!body.store_id || !/^[0-9a-f-]{36}$/i.test(body.store_id)) {
    return json({ error: "Geçerli mağaza kimliği gerekli." }, 400);
  }

  const storeUrl = new URL(url + "/rest/v1/stores");
  storeUrl.searchParams.set("id", "eq." + body.store_id);
  storeUrl.searchParams.set("select", "id,marketplace,organization_id");
  storeUrl.searchParams.set("limit", "1");
  const storeResponse = await fetch(storeUrl, { headers: { ...authHeaders, Accept: "application/json" } });
  if (!storeResponse.ok) return json({ error: "Mağaza erişimi doğrulanamadı." }, 403);
  const stores = await storeResponse.json();
  if (!Array.isArray(stores) || stores.length !== 1 || stores[0].marketplace !== "Trendyol") {
    return json({ error: "Trendyol mağazası bulunamadı veya erişim izniniz yok." }, 403);
  }
  const store = stores[0];

  if (action === "connect_trendyol" || action === "save_trendyol_credentials") {
    if (!body.api_key?.trim() || !body.api_secret?.trim()) return json({ error: "API Key ve API Secret gerekli." }, 400);
    if (body.api_key.length > 1000 || body.api_secret.length > 1000) return json({ error: "API bilgisi alanı çok uzun." }, 400);
    const supplierId = body.supplier_id?.trim() || "";
    if (!/^\d{3,20}$/.test(supplierId)) return json({ error: "Geçerli sayısal Satıcı ID / Supplier ID girin." }, 400);

    const now = Date.now();
    const testUrl = new URL("https://apigw.trendyol.com/integration/order/sellers/" + supplierId + "/v2/orders");
    testUrl.searchParams.set("startDate", String(now - 7 * 24 * 60 * 60 * 1000));
    testUrl.searchParams.set("endDate", String(now));
    testUrl.searchParams.set("page", "0");
    testUrl.searchParams.set("size", "1");
    testUrl.searchParams.set("orderByField", "PackageLastModifiedDate");
    testUrl.searchParams.set("orderByDirection", "DESC");

    let testResult: any;
    try {
      testResult = await fetchJson(testUrl.toString(), {
        Accept: "application/json",
        Authorization: "Basic " + btoa(body.api_key.trim() + ":" + body.api_secret.trim()),
        "User-Agent": supplierId + " - SelfIntegration",
      });
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Trendyol bağlantısı kurulamadı." });
    }

    const encrypted = await encryptCredentials({
      supplierId, apiKey: body.api_key.trim(), apiSecret: body.api_secret.trim(), savedAt: new Date().toISOString(),
    }, rootSecret, url);

    const saveResponse = await fetch(url + "/rest/v1/rpc/upsert_marketplace_secret", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ p_store_id: body.store_id, p_ciphertext: encrypted, p_key_version: 1 }),
    });
    if (!saveResponse.ok) return json({ error: "Bağlantı doğrulandı ancak şifreli bilgiler kaydedilemedi." }, 500);

    const statusResponse = await fetch(storeUrl, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ seller_id: supplierId, connection_status: "connected", updated_at: new Date().toISOString() }),
    });
    if (!statusResponse.ok) return json({ error: "API doğrulandı ve şifreli kaydedildi; mağaza durumu güncellenemedi." }, 500);

    return json({
      ok: true, store_id: body.store_id, supplier_id: supplierId,
      sample_packages: Array.isArray(testResult?.content) ? testResult.content.length : 0,
      message: "Trendyol bağlantısı doğrulandı; API bilgileri şifrelenerek kaydedildi.",
    });
  }

  let syncRange: { from: string; to: string };
  try {
    syncRange = resolveSyncRange(body);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Geçersiz tarih aralığı." }, 400);
  }
  const days = Math.round((Date.parse(syncRange.to) - Date.parse(syncRange.from)) / 86_400_000) + 1;
  const secretResponse = await fetch(url + "/rest/v1/rpc/get_marketplace_secret_for_user", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ p_store_id: body.store_id }),
  });
  if (!secretResponse.ok) return json({ error: "Şifreli Trendyol bağlantı kaydı okunamadı." }, 500);
  const secretRows = await secretResponse.json();
  const secretRow = Array.isArray(secretRows) ? secretRows[0] : secretRows;
  if (!secretRow?.credential_ciphertext) return json({ error: "Bu mağaza için kayıtlı Trendyol API bağlantısı bulunamadı." }, 400);

  let credentials: { supplierId: string; apiKey: string; apiSecret: string };
  try {
    credentials = await decryptCredentials(secretRow.credential_ciphertext, rootSecret, url);
  } catch {
    return json({ error: "Kayıtlı API bilgileri çözümlenemedi. Bağlantıyı yeniden test edip kaydedin." }, 500);
  }

  if (action === "sync_trendyol_products") {
    const headers = {
      Accept: "application/json",
      Authorization: "Basic " + btoa(credentials.apiKey + ":" + credentials.apiSecret),
      "User-Agent": credentials.supplierId + " - SelfIntegration",
    };
    const productMap = new Map<string, any>();
    const variantMap = new Map<string, any>();
    let page = 0;
    let nextPageToken = "";
    let pagesFetched = 0;
    try {
      while (pagesFetched < 110) {
        const productUrl = new URL("https://apigw.trendyol.com/integration/product/sellers/" + credentials.supplierId + "/products/approved");
        productUrl.searchParams.set("size", "100");
        if (nextPageToken) productUrl.searchParams.set("nextPageToken", nextPageToken);
        else productUrl.searchParams.set("page", String(page));
        const result = await fetchJson(productUrl.toString(), headers);
        const content = Array.isArray(result?.content) ? result.content : [];
        for (const item of content) {
          const contentId = String(item?.contentId ?? "");
          if (!contentId) continue;
          const productId = await stableUuid(body.store_id + "|trendyol-product|" + contentId);
          const variants = Array.isArray(item?.variants) ? item.variants : [];
          productMap.set(productId, {
            id: productId,
            external_product_id: contentId,
            title: String(item?.title ?? "Trendyol ürünü").slice(0, 500),
            category: String(item?.category?.name ?? "").slice(0, 250) || null,
            brand: String(item?.brand?.name ?? "").slice(0, 250) || null,
            product_url: String(variants.find((v: any) => v?.productUrl)?.productUrl ?? "").slice(0, 2000) || null,
            status: variants.some((v: any) => v?.onSale) ? "active" : "inactive",
          });
          for (const variant of variants) {
            const barcode = String(variant?.barcode ?? "").trim();
            const stockCode = String(variant?.stockCode ?? "").trim();
            const externalVariantId = String(variant?.variantId ?? barcode ?? stockCode ?? "");
            if (!barcode && !stockCode && !externalVariantId) continue;
            const variantId = await stableUuid(body.store_id + "|trendyol-variant|" + contentId + "|" + externalVariantId + "|" + barcode);
            const variantName = Array.isArray(variant?.attributes)
              ? variant.attributes.map((a: any) => String(a?.attributeValue ?? "")).filter(Boolean).join(" / ").slice(0, 250)
              : "";
            variantMap.set(variantId, {
              id: variantId, product_id: productId,
              external_variant_id: externalVariantId.slice(0, 200) || null,
              barcode: barcode.slice(0, 200) || null, sku: stockCode.slice(0, 200) || null,
              variant_name: variantName || null,
              sale_price: Number(variant?.price?.salePrice) > 0 ? Number(variant.price.salePrice) : null,
              list_price: Number(variant?.price?.listPrice) > 0 ? Number(variant.price.listPrice) : null,
              stock_quantity: Math.max(0, Math.floor(Number(variant?.stock?.quantity) || 0)),
              vat_rate: Number.isFinite(Number(variant?.vatRate)) ? Number(variant.vatRate) : null,
            });
          }
        }
        pagesFetched += 1;
        const totalPages = Number(result?.totalPages ?? 0);
        if (nextPageToken) {
          nextPageToken = String(result?.nextPageToken ?? "");
          if (!nextPageToken) break;
        } else if (page + 1 < totalPages && page < 99) {
          page += 1;
        } else if (page >= 99 && result?.nextPageToken) {
          nextPageToken = String(result.nextPageToken);
        } else {
          break;
        }
        if (content.length === 0) break;
      }
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Trendyol ürün kataloğu alınamadı." }, 502);
    }

    const products = [...productMap.values()];
    const variants = [...variantMap.values()];
    let productsUpserted = 0;
    let variantsUpserted = 0;
    try {
      for (let offset = 0; offset < products.length; offset += 250) {
        const productBatch = products.slice(offset, offset + 250);
        const productIds = new Set(productBatch.map((p: any) => p.id));
        const variantBatch = variants.filter((v: any) => productIds.has(v.product_id));
        const saveResponse = await fetch(url + "/rest/v1/rpc/import_trendyol_products", {
          method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ p_store_id: body.store_id, p_products: productBatch, p_variants: variantBatch }),
        });
        if (!saveResponse.ok) throw new Error("Ürün kataloğu kaydedilemedi: " + (await saveResponse.text()).slice(0, 250));
        const saved = await saveResponse.json();
        productsUpserted += Number(saved?.products_upserted ?? 0);
        variantsUpserted += Number(saved?.variants_upserted ?? 0);
      }
      const matchResponse = await fetch(url + "/rest/v1/rpc/match_trendyol_order_products", {
        method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ p_store_id: body.store_id }),
      });
      if (!matchResponse.ok) throw new Error("Aktarılan siparişler ürünlerle eşleştirilemedi: " + (await matchResponse.text()).slice(0, 250));
      const matchResult = await matchResponse.json();
      return json({
        ok: true, products_received: products.length, variants_received: variants.length,
        products_upserted: productsUpserted, variants_upserted: variantsUpserted,
        matched_order_lines: Number(matchResult?.matched_order_lines ?? 0),
        message: "Trendyol ürün kataloğu aktarıldı ve eşleşen sipariş satırları güncellendi.",
      });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Ürünler kaydedilemedi." }, 500);
    }
  }

  const trendyolHeaders = {
    Accept: "application/json",
    Authorization: "Basic " + btoa(credentials.apiKey + ":" + credentials.apiSecret),
    "User-Agent": credentials.supplierId + " - SelfIntegration",
  };
  // Istanbul day boundaries: start 00:00:00.000, end 23:59:59.999 local time (see trendyol-time.ts).
  const queryWindows = trendyolQueryWindows(syncRange.from, syncRange.to, 13);
  const endDate = queryWindows[queryWindows.length - 1]?.endDate ?? Date.now();
  const packagesById = new Map<string, any>();
  let totalElements = 0;

  try {
    // Keep every request inside the documented two-week query window, aligned to local midnight.
    for (const queryWindow of queryWindows) {
      const windowStart = queryWindow.startDate;
      const windowEnd = queryWindow.endDate;
      let page = 0;
      let windowTotal = 0;
      while (page < 50) {
        const orderUrl = new URL("https://apigw.trendyol.com/integration/order/sellers/" + credentials.supplierId + "/v2/orders");
        orderUrl.searchParams.set("startDate", String(windowStart));
        orderUrl.searchParams.set("endDate", String(windowEnd));
        orderUrl.searchParams.set("page", String(page));
        orderUrl.searchParams.set("size", "200");
        orderUrl.searchParams.set("orderByField", "PackageLastModifiedDate");
        orderUrl.searchParams.set("orderByDirection", "DESC");
        const result = await fetchJson(orderUrl.toString(), trendyolHeaders);
        const content = Array.isArray(result?.content) ? result.content : [];
        windowTotal = Number(result?.totalElements ?? content.length);
        if (windowTotal > 10000) {
          return json({ error: "Seçilen tarih diliminde 10.000'den fazla paket var. Daha kısa tarih aralığıyla aktarım yapılmalı.", total_packages: windowTotal }, 422);
        }
        for (const pkg of content) {
          const packageId = String(pkg?.shipmentPackageId ?? pkg?.id ?? "");
          if (packageId) packagesById.set(packageId, pkg);
        }
        if (content.length < 200 || page + 1 >= Number(result?.totalPages ?? 1)) break;
        page += 1;
      }
      totalElements += windowTotal;
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Trendyol siparişleri alınamadı." }, 502);
  }
  const packages = [...packagesById.values()];

  const productUrl = new URL(url + "/rest/v1/products");
  productUrl.searchParams.set("store_id", "eq." + body.store_id);
  productUrl.searchParams.set("select", "id");
  const variantUrl = new URL(url + "/rest/v1/product_variants");
  variantUrl.searchParams.set("organization_id", "eq." + store.organization_id);
  variantUrl.searchParams.set("select", "product_id,barcode,sku");
  const [productResponse, variantResponse] = await Promise.all([
    fetch(productUrl, { headers: authHeaders }),
    fetch(variantUrl, { headers: authHeaders }),
  ]);
  if (!productResponse.ok || !variantResponse.ok) return json({ error: "Mağaza ürün eşleştirmeleri okunamadı." }, 500);
  const productRows = await productResponse.json();
  const variantRows = await variantResponse.json();
  const storeProductIds = new Set((productRows ?? []).map((row: any) => String(row.id)));
  const productByCode = new Map<string, string>();
  for (const variant of variantRows ?? []) {
    const productId = String(variant.product_id ?? "");
    if (!storeProductIds.has(productId)) continue;
    if (variant.barcode) productByCode.set(String(variant.barcode).trim().toLowerCase(), productId);
    if (variant.sku) productByCode.set(String(variant.sku).trim().toLowerCase(), productId);
  }

  const recordsById = new Map<string, any>();
  let matchedProducts = 0;
  let unmatchedProducts = 0;
  let saleLines = 0;
  let cancellationLines = 0;
  let returnLines = 0;

  for (const pkg of packages) {
    const state = packageStatus(pkg);
    if (state === "unpacked" || state === "awaiting") continue;
    const lines = Array.isArray(pkg?.lines) ? pkg.lines : [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const quantity = Math.max(1, Math.floor(Number(line?.quantity) || 1));
      const type = recordType(pkg, line);
      // Returns are sourced from the dedicated claims endpoint below, using the approval/update date.
      // Do not also count returned shipment packages: that would duplicate returns and use order date.
      if (type === "return") continue;
      const unitGross = amount(line?.lineGrossAmount) ||
        amount(line?.lineUnitPrice) + amount(line?.lineSellerDiscount) / quantity + amount(line?.lineTyDiscount) / quantity;
      const gross = Math.round(unitGross * quantity * 100) / 100;
      if (gross <= 0) continue;

      const details = Array.isArray(line?.discountDetails) ? line.discountDetails : [];
      const detailSellerDiscount = details.reduce((sum: number, item: any) => sum + amount(item?.lineItemSellerDiscount), 0);
      const sellerDiscount = Math.min(gross, Math.round((detailSellerDiscount || amount(line?.lineSellerDiscount)) * 100) / 100);
      const barcode = String(line?.barcode ?? "").trim();
      const stockCode = String(line?.stockCode ?? "").trim();
      const productId = productByCode.get(barcode.toLowerCase()) ?? productByCode.get(stockCode.toLowerCase()) ?? null;
      if (productId) matchedProducts += 1;
      else unmatchedProducts += 1;

      const packageId = String(pkg?.shipmentPackageId ?? pkg?.id ?? "");
      const lineId = String(line?.lineId ?? line?.id ?? (barcode + "-" + index));
      const stableId = await stableUuid(body.store_id + "|" + packageId + "|" + lineId);
      const orderNumberRaw = String(pkg?.orderNumber ?? packageId);
      const orderNumber = orderNumberRaw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50) || packageId.slice(0, 50);
      const tyDiscount = amount(line?.lineTyDiscount);
      const commissionRate = amount(line?.commission);
      const noteParts = [
        "Paket:" + packageId,
        "Durum:" + String(pkg?.shipmentPackageStatus ?? pkg?.status ?? "Bilinmiyor"),
        barcode ? "Barkod:" + barcode : "",
        "Satır:" + lineId,
        stockCode ? "Stok:" + stockCode : "",
        tyDiscount ? "Trendyol katkısı:" + tyDiscount.toFixed(2) + " TL (satıcı indirimi değildir)" : "",
        commissionRate ? "Komisyon oranı:%" + commissionRate : "",
      ].filter(Boolean);
      const note = noteParts.join(" | ").slice(0, 300);

      recordsById.set(stableId, {
        id: stableId,
        record_type: type,
        order_number: orderNumber,
        record_date: localDate(Number(pkg?.orderDate ?? pkg?.createdDate ?? pkg?.lastModifiedDate ?? Date.now())),
        product_id: productId,
        quantity,
        gross_amount: gross,
        discount_amount: sellerDiscount,
        coupon_amount: 0,
        commission_amount: 0,
        shipping_amount: 0,
        withholding_amount: 0,
        note,
      });
      if (type === "sale") saleLines += 1;
      else if (type === "cancellation") cancellationLines += 1;
      else returnLines += 1;
    }
  }

  // Fetch accepted return claim items. Trendyol nests claimItems inside items[].claimItems[].
  // The claim package's lastModifiedDate is used as the accepted-status update date.
  let claimsReceived = 0;
  let approvedReturnLines = 0;
  try {
    const claimWindows = trendyolQueryWindows(syncRange.from, syncRange.to, 13);
    const acceptedClaimItems: Array<{
      id: string; claimId: string; orderNumber: string; approvedAt: number;
      quantity: number; gross: number; barcode: string; merchantSku: string;
      productId: string | null; outboundPackageId: string; orderLineItemId: string;
    }> = [];
    for (const claimWindow of claimWindows) {
      let claimPage = 0;
      while (claimPage < 50) {
        const claimUrl = new URL("https://apigw.trendyol.com/integration/order/sellers/" + credentials.supplierId + "/claims");
        claimUrl.searchParams.set("startDate", String(claimWindow.startDate));
        claimUrl.searchParams.set("endDate", String(claimWindow.endDate));
        claimUrl.searchParams.set("claimItemStatus", "Accepted");
        claimUrl.searchParams.set("page", String(claimPage));
        claimUrl.searchParams.set("size", "200");
        const result = await fetchJson(claimUrl.toString(), trendyolHeaders);
        const content = Array.isArray(result?.content) ? result.content : [];
        claimsReceived += content.length;
        for (const claim of content) {
        const approvedAt = Number(claim?.lastModifiedDate ?? 0);
        if (!approvedAt || localDate(approvedAt) < syncRange.from || localDate(approvedAt) > syncRange.to) continue;
        const claimId = String(claim?.id ?? claim?.claimId ?? "");
        const orderNumber = String(claim?.orderNumber ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50);
        if (!claimId || !orderNumber) continue;
        const outboundPackageId = String(claim?.orderOutboundPackageId ?? "");
        const claimLines = Array.isArray(claim?.items) ? claim.items : [];
        for (const claimLine of claimLines) {
          const orderLine = claimLine?.orderLine ?? {};
          const claimItems = Array.isArray(claimLine?.claimItems) ? claimLine.claimItems : [];
          for (const item of claimItems) {
            const itemStatus = String(item?.claimItemStatus?.name ?? item?.claimItemStatus ?? "").toLowerCase();
            if (itemStatus !== "accepted") continue;
            const claimItemId = String(item?.id ?? item?.claimItemId ?? item?.orderLineItemId ?? "");
            if (!claimItemId) continue;
            const quantity = Math.max(1, Math.floor(Number(item?.quantity ?? item?.returnQuantity) || 1));
            const unitPrice = amount(orderLine?.price ?? item?.price);
            const gross = Math.round(unitPrice * quantity * 100) / 100;
            if (gross <= 0) continue;
            const barcode = String(orderLine?.barcode ?? item?.barcode ?? "").trim();
            const merchantSku = String(orderLine?.merchantSku ?? item?.merchantSku ?? "").trim();
            const productId = productByCode.get(barcode.toLowerCase()) ??
              productByCode.get(merchantSku.toLowerCase()) ?? null;
            acceptedClaimItems.push({
              id: claimItemId, claimId, orderNumber, approvedAt, quantity, gross,
              barcode, merchantSku, productId, outboundPackageId,
              orderLineItemId: String(item?.orderLineItemId ?? orderLine?.id ?? ""),
            });
          }
        }
      }
        const totalPages = Math.max(1, Number(result?.totalPages ?? 1));
        if (content.length < 200 || claimPage + 1 >= totalPages) break;
        claimPage += 1;
      }
    }

    // Match each returned unit to its original sale line so its seller discount is reversed,
    // while cancellation discounts remain excluded from Trendyol's headline discount figure.
    const orderNumbers = [...new Set(acceptedClaimItems.map((item) => item.orderNumber))];
    let originalSaleRows: any[] = [];
    if (orderNumbers.length) {
      const originalUrl = new URL(url + "/rest/v1/order_records");
      originalUrl.searchParams.set("store_id", "eq." + body.store_id);
      originalUrl.searchParams.set("record_type", "eq.sale");
      originalUrl.searchParams.set("order_number", "in.(" + orderNumbers.join(",") + ")");
      originalUrl.searchParams.set("select", "order_number,quantity,gross_amount,discount_amount,coupon_amount,note");
      originalUrl.searchParams.set("limit", "1000");
      const originalResponse = await fetch(originalUrl, { headers: authHeaders });
      if (!originalResponse.ok) throw new Error("İade indirimi için asıl sipariş satırları okunamadı.");
      originalSaleRows = await originalResponse.json();
    }

    for (const item of acceptedClaimItems) {
      const lineMarker = item.orderLineItemId ? "Satır:" + item.orderLineItemId : "";
      const packageMarker = item.outboundPackageId ? "Paket:" + item.outboundPackageId : "";
      const barcodeMarker = item.barcode ? "Barkod:" + item.barcode : "";
      const matchingSale = originalSaleRows.find((row: any) =>
        row.order_number === item.orderNumber &&
        ((lineMarker && String(row.note ?? "").includes(lineMarker)) ||
          (packageMarker && barcodeMarker && String(row.note ?? "").includes(packageMarker) &&
            String(row.note ?? "").includes(barcodeMarker)))
      ) ?? originalSaleRows.find((row: any) =>
        row.order_number === item.orderNumber && barcodeMarker && String(row.note ?? "").includes(barcodeMarker)
      );
      const originalQuantity = Math.max(1, Number(matchingSale?.quantity) || 1);
      const discountAmount = matchingSale
        ? Math.round((Number(matchingSale.discount_amount ?? 0) * item.quantity / originalQuantity) * 100) / 100
        : 0;
      const couponAmount = matchingSale
        ? Math.round((Number(matchingSale.coupon_amount ?? 0) * item.quantity / originalQuantity) * 100) / 100
        : 0;
      const originalGrossPerUnit = matchingSale
        ? Number(matchingSale.gross_amount ?? 0) / originalQuantity
        : item.gross / item.quantity;
      const returnGross = Math.round(originalGrossPerUnit * item.quantity * 100) / 100;
      const stableId = await stableUuid(body.store_id + "|trendyol-claim|" + item.claimId + "|" + item.id);
      recordsById.set(stableId, {
        id: stableId, record_type: "return", order_number: item.orderNumber,
        record_date: localDate(item.approvedAt), product_id: item.productId, quantity: item.quantity,
        gross_amount: returnGross, discount_amount: discountAmount, coupon_amount: couponAmount,
        commission_amount: 0, shipping_amount: 0, withholding_amount: 0,
        note: ("Onaylı Trendyol iadesi | Talep:" + item.claimId + " | Kalem:" + item.id +
          " | Paket:" + item.outboundPackageId + (item.barcode ? " | Barkod:" + item.barcode : "") +
          (matchingSale ? " | İade indirimi eşleşti" : " | İade indirimi için satış satırı bulunamadı") +
          " | Son durum güncelleme: " + istanbulDateTimeFromEpoch(item.approvedAt) + " Europe/Istanbul").slice(0, 300),
      });
      approvedReturnLines += 1;
    }
  } catch (error) {
    return json({ error: "Trendyol onaylı iadeleri alınamadı: " + (error instanceof Error ? error.message : "Bilinmeyen hata") }, 502);
  }

  const records = [...recordsById.values()];
  try {
    for (let offset = 0; offset < records.length; offset += 250) {
      const batch = records.slice(offset, offset + 250);
      const importResponse = await fetch(url + "/rest/v1/rpc/import_trendyol_order_records", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ p_store_id: body.store_id, p_records: batch }),
      });
      if (!importResponse.ok) {
        const message = await importResponse.text();
        throw new Error("Sipariş kayıtları kaydedilemedi: " + message.slice(0, 250));
      }
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Siparişler kaydedilemedi." }, 500);
  }

  await fetch(storeUrl, {
    method: "PATCH",
    headers: { ...authHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ connection_status: "connected", last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });

  return json({
    ok: true,
    days,
    start_date: syncRange.from,
    end_date: syncRange.to,
    query_start: istanbulDateTimeFromEpoch(queryWindows[0]?.startDate ?? endDate) + " (Europe/Istanbul)",
    query_end: istanbulDateTimeFromEpoch(endDate) + " (Europe/Istanbul)",
    packages_received: packages.length,
    total_packages: totalElements,
    lines_imported: records.length,
    sale_lines: saleLines,
    cancellation_lines: cancellationLines,
    return_lines: approvedReturnLines,
    claims_received: claimsReceived,
    matched_products: matchedProducts,
    unmatched_products: unmatchedProducts,
    message: "Trendyol siparişleri buluta aktarıldı. Var olan manuel kayıtlar ve finans hareketleri korunmuştur.",
  });
});
