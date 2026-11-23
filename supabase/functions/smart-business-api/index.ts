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

async function encryptCredentials(payload: object, rootSecret: string, projectUrl: string) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(rootSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(projectUrl),
      info: encoder.encode("smart-business-center:marketplace-credentials:v1"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  return "v1." + toBase64(iv) + "." + toBase64(ciphertext);
}

function friendlyTrendyolError(status: number): string {
  if (status === 401) return "Trendyol API Key veya API Secret hatalı. Bilgileri kontrol edin.";
  if (status === 403) return "Trendyol erişimi reddetti. User-Agent veya API yetkisini kontrol edin.";
  if (status === 429) return "Trendyol istek sınırına ulaşıldı. Birkaç dakika sonra tekrar deneyin.";
  if (status >= 500) return "Trendyol sunucusu şu anda yanıt vermiyor. Daha sonra tekrar deneyin.";
  return `Trendyol bağlantı testi başarısız oldu (HTTP ${status}).`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = getKeyEnv("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const rootSecret = getKeyEnv("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!url || !publishableKey || !rootSecret) {
    return json({ error: "Server configuration is incomplete" }, 500);
  }

  const pathname = new URL(req.url).pathname;
  if (req.method === "GET" && pathname.endsWith("/health")) {
    return json({ ok: true, service: "smart-business-center-api", version: 2 });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const authHeaders = { apikey: publishableKey, Authorization: authorization };
  const userResponse = await fetch(url + "/auth/v1/user", { headers: authHeaders });
  if (!userResponse.ok) return json({ error: "Invalid or expired session" }, 401);

  let user: { id?: string };
  try {
    user = await userResponse.json();
  } catch {
    return json({ error: "Unable to validate session" }, 401);
  }
  if (!user.id) return json({ error: "Invalid session" }, 401);

  let body: {
    action?: string;
    store_id?: string;
    supplier_id?: string;
    api_key?: string;
    api_secret?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.action !== "connect_trendyol" && body.action !== "save_trendyol_credentials") {
    return json({ error: "Unsupported action" }, 400);
  }
  if (!body.store_id || !/^[0-9a-f-]{36}$/i.test(body.store_id)) {
    return json({ error: "A valid store_id is required" }, 400);
  }
  if (!body.api_key?.trim() || !body.api_secret?.trim()) {
    return json({ error: "API key and API secret are required" }, 400);
  }
  if (body.api_key.length > 1000 || body.api_secret.length > 1000) {
    return json({ error: "Credential field is too long" }, 400);
  }
  const supplierId = body.supplier_id?.trim() || "";
  if (!/^\d{3,20}$/.test(supplierId)) {
    return json({ error: "Geçerli sayısal Satıcı ID / Supplier ID girin." }, 400);
  }

  const storeUrl = new URL(url + "/rest/v1/stores");
  storeUrl.searchParams.set("id", "eq." + body.store_id);
  storeUrl.searchParams.set("select", "id,marketplace");
  storeUrl.searchParams.set("limit", "1");
  const storeResponse = await fetch(storeUrl, {
    headers: { ...authHeaders, Accept: "application/json" },
  });
  if (!storeResponse.ok) return json({ error: "Unable to verify store access" }, 403);
  const stores = await storeResponse.json();
  if (!Array.isArray(stores) || stores.length !== 1 || stores[0].marketplace !== "Trendyol") {
    return json({ error: "Trendyol store not found or access denied" }, 403);
  }

  // Verify credentials against the current Order V2 endpoint before persisting them.
  const now = Date.now();
  const testUrl = new URL(
    `https://apigw.trendyol.com/integration/order/sellers/${supplierId}/v2/orders`,
  );
  testUrl.searchParams.set("startDate", String(now - 7 * 24 * 60 * 60 * 1000));
  testUrl.searchParams.set("endDate", String(now));
  testUrl.searchParams.set("page", "0");
  testUrl.searchParams.set("size", "1");
  testUrl.searchParams.set("orderByField", "PackageLastModifiedDate");
  testUrl.searchParams.set("orderByDirection", "DESC");

  let trendyolResponse: Response;
  try {
    trendyolResponse = await fetch(testUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Basic " + btoa(body.api_key.trim() + ":" + body.api_secret.trim()),
        "User-Agent": supplierId + " - SelfIntegration",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return json({ ok: false, error: "Trendyol bağlantısına ulaşılamadı. Ağ bağlantısını kontrol edip tekrar deneyin." });
  }

  if (!trendyolResponse.ok) {
    return json({ ok: false, error: friendlyTrendyolError(trendyolResponse.status) });
  }

  let packageCount = 0;
  try {
    const result = await trendyolResponse.json();
    packageCount = Array.isArray(result?.content) ? result.content.length : 0;
  } catch {
    return json({ ok: false, error: "Trendyol yanıtı okunamadı. API yanıt biçimi beklenenden farklı." });
  }

  const encrypted = await encryptCredentials(
    {
      supplierId,
      apiKey: body.api_key.trim(),
      apiSecret: body.api_secret.trim(),
      savedAt: new Date().toISOString(),
    },
    rootSecret,
    url,
  );

  const saveResponse = await fetch(url + "/rest/v1/rpc/upsert_marketplace_secret", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_store_id: body.store_id,
      p_ciphertext: encrypted,
      p_key_version: 1,
    }),
  });
  if (!saveResponse.ok) {
    return json({ error: "Bağlantı doğrulandı ancak şifreli bilgiler kaydedilemedi. Lütfen tekrar deneyin." }, 500);
  }

  return json({
    ok: true,
    store_id: body.store_id,
    supplier_id: supplierId,
    sample_packages: packageCount,
    message: "Trendyol bağlantısı doğrulandı; API bilgileri şifrelenerek kaydedildi.",
  });
});
