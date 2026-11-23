create or replace function public.match_trendyol_order_products(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli' using errcode = '28000'; end if;
  select s.organization_id into v_org from public.stores s
    where s.id=p_store_id and lower(s.marketplace)='trendyol';
  if v_org is null or not public.has_org_role(v_org,array['owner','admin','analyst']) then
    raise exception 'Mağaza bulunamadı veya yetkiniz yok' using errcode='42501';
  end if;
  update public.order_records o set product_id = (
    select pv.product_id
    from public.product_variants pv join public.products p on p.id=pv.product_id
    where p.store_id=p_store_id and p.organization_id=v_org and p.data_source='imported'
      and ((pv.barcode is not null and position('Barkod:'||pv.barcode in coalesce(o.note,''))>0)
        or (pv.sku is not null and position('Stok:'||pv.sku in coalesce(o.note,''))>0))
    order by case when pv.barcode is not null and position('Barkod:'||pv.barcode in coalesce(o.note,''))>0 then 0 else 1 end
    limit 1
  )
  where o.store_id=p_store_id and o.organization_id=v_org and o.data_source='imported' and o.product_id is null
    and exists (
      select 1 from public.product_variants pv join public.products p on p.id=pv.product_id
      where p.store_id=p_store_id and p.organization_id=v_org and p.data_source='imported'
        and ((pv.barcode is not null and position('Barkod:'||pv.barcode in coalesce(o.note,''))>0)
          or (pv.sku is not null and position('Stok:'||pv.sku in coalesce(o.note,''))>0))
    );
  get diagnostics v_count=row_count;
  return jsonb_build_object('matched_order_lines',v_count);
end; $$;
revoke all on function public.match_trendyol_order_products(uuid) from public,anon;
grant execute on function public.match_trendyol_order_products(uuid) to authenticated;
