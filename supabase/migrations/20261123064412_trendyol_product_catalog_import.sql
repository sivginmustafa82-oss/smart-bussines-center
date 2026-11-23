create or replace function public.import_trendyol_products(p_store_id uuid, p_products jsonb, p_variants jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_products integer := 0; v_variants integer := 0;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli' using errcode = '28000'; end if;
  select s.organization_id into v_org from public.stores s
    where s.id = p_store_id and lower(s.marketplace) = 'trendyol';
  if v_org is null or not public.has_org_role(v_org, array['owner','admin','analyst']) then
    raise exception 'Mağaza bulunamadı veya yetkiniz yok' using errcode = '42501';
  end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) > 250
     or jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) > 1000 then
    raise exception 'Ürün aktarım paketi geçersiz veya çok büyük' using errcode = '22023';
  end if;
  insert into public.products (
    id, organization_id, store_id, external_product_id, title, category, brand, product_url,
    status, data_source, verified, created_at, updated_at
  )
  select x.id, v_org, p_store_id, x.external_product_id, x.title, x.category, x.brand, x.product_url,
    coalesce(x.status,'active'), 'imported', true, now(), now()
  from jsonb_to_recordset(p_products) as x(
    id uuid, external_product_id text, title text, category text, brand text, product_url text, status text
  )
  where x.title is not null and length(x.title) between 1 and 500
  on conflict (id) do update set
    external_product_id=excluded.external_product_id, title=excluded.title, category=excluded.category,
    brand=excluded.brand, product_url=excluded.product_url, status=excluded.status,
    verified=true, updated_at=now()
  where public.products.data_source='imported' and public.products.store_id=p_store_id;
  get diagnostics v_products = row_count;
  insert into public.product_variants (
    id, organization_id, product_id, external_variant_id, barcode, sku, variant_name,
    sale_price, list_price, stock_quantity, currency, vat_rate, created_at, updated_at
  )
  select x.id, v_org, x.product_id, x.external_variant_id, x.barcode, x.sku, x.variant_name,
    x.sale_price, x.list_price, greatest(0,coalesce(x.stock_quantity,0)), 'TRY', x.vat_rate, now(), now()
  from jsonb_to_recordset(p_variants) as x(
    id uuid, product_id uuid, external_variant_id text, barcode text, sku text,
    variant_name text, sale_price numeric, list_price numeric, stock_quantity integer, vat_rate integer
  )
  join public.products p on p.id=x.product_id and p.store_id=p_store_id
    and p.organization_id=v_org and p.data_source='imported'
  on conflict (id) do update set
    external_variant_id=excluded.external_variant_id, barcode=excluded.barcode, sku=excluded.sku,
    variant_name=excluded.variant_name, sale_price=excluded.sale_price, list_price=excluded.list_price,
    stock_quantity=excluded.stock_quantity, vat_rate=excluded.vat_rate, updated_at=now()
  where exists (select 1 from public.products p where p.id=excluded.product_id
    and p.store_id=p_store_id and p.data_source='imported');
  get diagnostics v_variants = row_count;
  return jsonb_build_object('products_upserted',v_products,'variants_upserted',v_variants);
end; $$;
revoke all on function public.import_trendyol_products(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.import_trendyol_products(uuid,jsonb,jsonb) to authenticated;
