-- Secure retrieval of encrypted credentials and idempotent Trendyol order imports.
create or replace function public.get_marketplace_secret_for_user(p_store_id uuid)
returns table(credential_ciphertext text, encryption_key_version integer)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli' using errcode = '28000'; end if;
  select s.organization_id into v_org from public.stores s
    where s.id = p_store_id and lower(s.marketplace) = 'trendyol';
  if v_org is null or not public.has_org_role(v_org, array['owner','admin','analyst']) then
    raise exception 'Mağaza bulunamadı veya yetkiniz yok' using errcode = '42501';
  end if;
  return query select ms.credential_ciphertext, ms.encryption_key_version
    from private.marketplace_secrets ms where ms.store_id = p_store_id;
end; $$;
revoke all on function public.get_marketplace_secret_for_user(uuid) from public, anon;
grant execute on function public.get_marketplace_secret_for_user(uuid) to authenticated;

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
    id, organization_id, store_id, record_type, order_number, record_date, product_id,
    quantity, gross_amount, discount_amount, coupon_amount, commission_amount,
    shipping_amount, withholding_amount, note, data_source, verified
  )
  select x.id, v_org, p_store_id, x.record_type, x.order_number, x.record_date, x.product_id,
    x.quantity, x.gross_amount, x.discount_amount, x.coupon_amount, x.commission_amount,
    x.shipping_amount, x.withholding_amount, coalesce(x.note,''), 'imported', false
  from jsonb_to_recordset(p_records) as x(
    id uuid, record_type text, order_number text, record_date date, product_id uuid,
    quantity integer, gross_amount numeric, discount_amount numeric, coupon_amount numeric,
    commission_amount numeric, shipping_amount numeric, withholding_amount numeric, note text
  )
  where x.record_type in ('sale','return','cancellation')
    and x.order_number ~ '^[A-Za-z0-9_-]{1,50}$'
    and x.quantity between 1 and 100000
    and x.gross_amount > 0 and x.discount_amount >= 0 and x.coupon_amount >= 0
    and x.discount_amount + x.coupon_amount <= x.gross_amount
  on conflict (id) do update set
    record_type = excluded.record_type, order_number = excluded.order_number,
    record_date = excluded.record_date, product_id = excluded.product_id,
    quantity = excluded.quantity, gross_amount = excluded.gross_amount,
    discount_amount = excluded.discount_amount, coupon_amount = excluded.coupon_amount,
    commission_amount = excluded.commission_amount, shipping_amount = excluded.shipping_amount,
    withholding_amount = excluded.withholding_amount, note = excluded.note, updated_at = now()
  where public.order_records.data_source = 'imported' and public.order_records.store_id = p_store_id;
  get diagnostics v_count = row_count;
  return jsonb_build_object('processed', v_count);
end; $$;
revoke all on function public.import_trendyol_order_records(uuid, jsonb) from public, anon;
grant execute on function public.import_trendyol_order_records(uuid, jsonb) to authenticated;
