-- Preserve original Trendyol order/return timestamps in the ledger.
-- Existing rows are intentionally left untouched; historical timestamps are not guessed.
alter table public.order_records
  add column if not exists ordered_at timestamptz,
  add column if not exists approved_at timestamptz;

create index if not exists order_records_store_ordered_at_idx
  on public.order_records (store_id, ordered_at)
  where ordered_at is not null;

create or replace function public.import_trendyol_order_records(p_store_id uuid, p_records jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli' using errcode = '28000'; end if;
  select s.organization_id into v_org from public.stores s
    where s.id = p_store_id and lower(s.marketplace) = 'trendyol';
  if v_org is null or not public.has_org_role(v_org, array['owner','admin','analyst']) then
    raise exception 'Mağaza bulunamadı veya yetkiniz yok' using errcode = '42501';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 250 then
    raise exception 'Sipariş aktarım paketi geçersiz veya çok büyük' using errcode = '22023';
  end if;

  insert into public.order_records (
    id, organization_id, store_id, record_type, order_number, record_date, ordered_at, approved_at, product_id,
    quantity, gross_amount, discount_amount, coupon_amount, commission_amount,
    shipping_amount, withholding_amount, note, data_source, verified
  )
  select x.id, v_org, p_store_id, x.record_type, x.order_number, x.record_date, x.ordered_at, x.approved_at, x.product_id,
    x.quantity, x.gross_amount, x.discount_amount, x.coupon_amount, x.commission_amount,
    x.shipping_amount, x.withholding_amount, coalesce(x.note,''), 'imported', false
  from jsonb_to_recordset(p_records) as x(
    id uuid, record_type text, order_number text, record_date date, ordered_at timestamptz, approved_at timestamptz,
    product_id uuid, quantity integer, gross_amount numeric, discount_amount numeric, coupon_amount numeric,
    commission_amount numeric, shipping_amount numeric, withholding_amount numeric, note text
  )
  where x.record_type in ('sale','return','cancellation')
    and x.order_number ~ '^[A-Za-z0-9_-]{1,50}$'
    and x.quantity between 1 and 100000
    and x.gross_amount > 0
    and x.discount_amount >= 0
    and x.coupon_amount >= 0
    and x.discount_amount + x.coupon_amount <= x.gross_amount
  on conflict (id) do update set
    record_type = excluded.record_type,
    order_number = excluded.order_number,
    record_date = excluded.record_date,
    ordered_at = coalesce(excluded.ordered_at, public.order_records.ordered_at),
    approved_at = coalesce(excluded.approved_at, public.order_records.approved_at),
    product_id = excluded.product_id,
    quantity = excluded.quantity,
    gross_amount = excluded.gross_amount,
    discount_amount = excluded.discount_amount,
    coupon_amount = excluded.coupon_amount,
    commission_amount = excluded.commission_amount,
    shipping_amount = excluded.shipping_amount,
    withholding_amount = excluded.withholding_amount,
    note = excluded.note,
    updated_at = now()
  where public.order_records.data_source = 'imported'
    and public.order_records.store_id = p_store_id;

  get diagnostics v_count = row_count;
  return jsonb_build_object('processed', v_count);
end; $$;

revoke all on function public.import_trendyol_order_records(uuid, jsonb) from public, anon;
grant execute on function public.import_trendyol_order_records(uuid, jsonb) to authenticated;

create or replace function public.import_trendyol_order_records_for_cron(p_store_id uuid, p_records jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_count integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select s.organization_id into v_org
  from public.stores s
  where s.id = p_store_id
    and lower(s.marketplace) = 'trendyol'
    and s.connection_status = 'connected';

  if v_org is null then
    raise exception 'Connected Trendyol store not found' using errcode = '42501';
  end if;

  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 250 then
    raise exception 'Invalid or oversized order import batch' using errcode = '22023';
  end if;

  insert into public.order_records (
    id, organization_id, store_id, record_type, order_number, record_date, ordered_at, approved_at, product_id,
    quantity, gross_amount, discount_amount, coupon_amount, commission_amount,
    shipping_amount, withholding_amount, note, data_source, verified
  )
  select x.id, v_org, p_store_id, x.record_type, x.order_number, x.record_date, x.ordered_at, x.approved_at, x.product_id,
    x.quantity, x.gross_amount, x.discount_amount, x.coupon_amount, x.commission_amount,
    x.shipping_amount, x.withholding_amount, coalesce(x.note,''), 'imported', false
  from jsonb_to_recordset(p_records) as x(
    id uuid, record_type text, order_number text, record_date date, ordered_at timestamptz, approved_at timestamptz,
    product_id uuid, quantity integer, gross_amount numeric, discount_amount numeric, coupon_amount numeric,
    commission_amount numeric, shipping_amount numeric, withholding_amount numeric, note text
  )
  where x.record_type in ('sale','return','cancellation')
    and x.order_number ~ '^[A-Za-z0-9_-]{1,50}$'
    and x.quantity between 1 and 100000
    and x.gross_amount > 0
    and x.discount_amount >= 0
    and x.coupon_amount >= 0
    and x.discount_amount + x.coupon_amount <= x.gross_amount
  on conflict (id) do update set
    record_type = excluded.record_type,
    order_number = excluded.order_number,
    record_date = excluded.record_date,
    ordered_at = coalesce(excluded.ordered_at, public.order_records.ordered_at),
    approved_at = coalesce(excluded.approved_at, public.order_records.approved_at),
    product_id = excluded.product_id,
    quantity = excluded.quantity,
    gross_amount = excluded.gross_amount,
    discount_amount = excluded.discount_amount,
    coupon_amount = excluded.coupon_amount,
    commission_amount = excluded.commission_amount,
    shipping_amount = excluded.shipping_amount,
    withholding_amount = excluded.withholding_amount,
    note = excluded.note,
    updated_at = now()
  where public.order_records.data_source = 'imported'
    and public.order_records.store_id = p_store_id;

  get diagnostics v_count = row_count;
  return jsonb_build_object('processed', v_count);
end; $$;

revoke all on function public.import_trendyol_order_records_for_cron(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_trendyol_order_records_for_cron(uuid, jsonb) to service_role;
