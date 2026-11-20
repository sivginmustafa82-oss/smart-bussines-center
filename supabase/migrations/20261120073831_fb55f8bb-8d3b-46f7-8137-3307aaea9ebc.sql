-- ---------- helpers ----------
create or replace function public.has_org_role(_org uuid, _roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = _org and m.user_id = auth.uid() and m.role = any(_roles)
  )
$$;
revoke all on function public.has_org_role(uuid, text[]) from public, anon;
grant execute on function public.has_org_role(uuid, text[]) to authenticated, service_role;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

-- ---------- base grants (read) ----------
grant select on public.profiles, public.organizations, public.organization_memberships to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant update (name) on public.organizations to authenticated;
grant all on public.profiles, public.organizations, public.organization_memberships to service_role;

drop policy if exists orgs_update_admin on public.organizations;
create policy orgs_update_admin on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner','admin']))
  with check (public.has_org_role(id, array['owner','admin']));

-- ---------- stores ----------
alter table public.stores drop constraint if exists stores_marketplace_check;
alter table public.stores add constraint stores_marketplace_check
  check (marketplace in ('Trendyol','Hepsiburada','Amazon','n11'));
alter table public.stores drop constraint if exists stores_name_len;
alter table public.stores add constraint stores_name_len check (char_length(btrim(name)) between 2 and 80);

grant select, delete on public.stores to authenticated;
grant insert (organization_id, marketplace, name) on public.stores to authenticated;
grant update (name) on public.stores to authenticated;
grant all on public.stores to service_role;

drop policy if exists stores_org_access on public.stores;
create policy stores_select_member on public.stores for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst','viewer']));
create policy stores_insert_editor on public.stores for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy stores_update_editor on public.stores for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']))
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy stores_delete_admin on public.stores for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']));

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at before update on public.stores
  for each row execute function public.set_updated_at();

-- ---------- products / variants / costs ----------
alter table public.products add column if not exists data_source text not null default 'manual';
alter table public.products add column if not exists verified boolean not null default false;
alter table public.products drop constraint if exists products_data_source_check;
alter table public.products add constraint products_data_source_check check (data_source in ('manual','imported'));
alter table public.product_variants add column if not exists vat_rate integer;
alter table public.product_variants drop constraint if exists product_variants_vat_rate_check;
alter table public.product_variants add constraint product_variants_vat_rate_check
  check (vat_rate is null or vat_rate in (0,1,10,20));

grant select, delete on public.products, public.product_variants, public.product_costs to authenticated;
grant insert (organization_id, store_id, title) on public.products to authenticated;
grant update (title) on public.products to authenticated;
grant insert (organization_id, product_id, sku, barcode, vat_rate) on public.product_variants to authenticated;
grant update (sku, barcode, vat_rate) on public.product_variants to authenticated;
grant insert (organization_id, variant_id, unit_cost, effective_from, notes) on public.product_costs to authenticated;
grant all on public.products, public.product_variants, public.product_costs to service_role;

drop policy if exists products_org_access on public.products;
drop policy if exists variants_org_access on public.product_variants;
drop policy if exists costs_org_access on public.product_costs;

create policy products_select_member on public.products for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst','viewer']));
create policy products_write_editor on public.products for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy products_update_editor on public.products for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']))
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy products_delete_editor on public.products for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']));

create policy variants_select_member on public.product_variants for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst','viewer']));
create policy variants_insert_editor on public.product_variants for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy variants_update_editor on public.product_variants for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']))
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy variants_delete_editor on public.product_variants for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']));

create policy costs_select_member on public.product_costs for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst','viewer']));
create policy costs_insert_editor on public.product_costs for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy costs_delete_editor on public.product_costs for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']));

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
drop trigger if exists variants_set_updated_at on public.product_variants;
create trigger variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- Read model for the app: one manual variant per product + latest cost.
create or replace view public.app_products with (security_invoker = true) as
select p.id, p.organization_id, p.store_id, p.title as name,
       v.id as variant_id, coalesce(v.sku, '') as sku, coalesce(v.barcode, '') as barcode,
       coalesce(v.vat_rate, 20) as vat_rate, c.unit_cost,
       p.data_source, p.verified, p.created_at, p.updated_at
from public.products p
left join lateral (
  select pv.* from public.product_variants pv where pv.product_id = p.id order by pv.created_at limit 1
) v on true
left join lateral (
  select pc.unit_cost from public.product_costs pc where pc.variant_id = v.id
  order by pc.effective_from desc, pc.created_at desc limit 1
) c on true;
grant select on public.app_products to authenticated, service_role;

-- Create/update a manual product (runs with caller's rights → RLS applies).
create or replace function public.save_manual_product(
  p_product_id uuid, p_store_id uuid, p_name text, p_sku text, p_barcode text,
  p_vat_rate integer, p_unit_cost numeric
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_org uuid; v_pid uuid; v_vid uuid; v_latest numeric; v_src text;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli' using errcode = '28000'; end if;
  p_name := btrim(coalesce(p_name, '')); p_sku := btrim(coalesce(p_sku, '')); p_barcode := btrim(coalesce(p_barcode, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 200 then raise exception 'Ürün adı 2-200 karakter olmalı' using errcode = '22023'; end if;
  if p_sku !~ '^[A-Za-z0-9._/-]{1,64}$' then raise exception 'Geçersiz stok kodu' using errcode = '22023'; end if;
  if p_barcode !~ '^[0-9A-Za-z]{0,32}$' then raise exception 'Geçersiz barkod' using errcode = '22023'; end if;
  if p_vat_rate not in (0,1,10,20) then raise exception 'Geçersiz KDV oranı' using errcode = '22023'; end if;
  if p_unit_cost is not null and (p_unit_cost < 0 or p_unit_cost > 1000000000 or round(p_unit_cost, 2) <> p_unit_cost) then
    raise exception 'Geçersiz birim maliyet' using errcode = '22023'; end if;

  select s.organization_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or not public.has_org_role(v_org, array['owner','admin','analyst']) then
    raise exception 'Mağaza bulunamadı veya yetkiniz yok' using errcode = '42501'; end if;

  if exists (
    select 1 from public.products p join public.product_variants v on v.product_id = p.id
    where p.store_id = p_store_id and lower(v.sku) = lower(p_sku) and p.id is distinct from p_product_id
  ) then raise exception 'Bu mağazada aynı stok koduna sahip bir ürün zaten var' using errcode = '23505'; end if;

  if p_product_id is null then
    insert into public.products(organization_id, store_id, title) values (v_org, p_store_id, p_name) returning id into v_pid;
    insert into public.product_variants(organization_id, product_id, sku, barcode, vat_rate)
      values (v_org, v_pid, p_sku, nullif(p_barcode, ''), p_vat_rate) returning id into v_vid;
  else
    select p.id, p.data_source into v_pid, v_src from public.products p
      where p.id = p_product_id and p.store_id = p_store_id;
    if v_pid is null then raise exception 'Ürün bulunamadı' using errcode = '42501'; end if;
    if v_src = 'imported' then raise exception 'İçe aktarılan ürünlerde yalnızca maliyet değiştirilebilir' using errcode = '42501'; end if;
    update public.products set title = p_name where id = v_pid;
    select v.id into v_vid from public.product_variants v where v.product_id = v_pid order by v.created_at limit 1;
    if v_vid is null then
      insert into public.product_variants(organization_id, product_id, sku, barcode, vat_rate)
        values (v_org, v_pid, p_sku, nullif(p_barcode, ''), p_vat_rate) returning id into v_vid;
    else
      update public.product_variants set sku = p_sku, barcode = nullif(p_barcode, ''), vat_rate = p_vat_rate where id = v_vid;
    end if;
  end if;

  perform public.set_product_unit_cost(v_pid, p_unit_cost);
  return v_pid;
end; $$;

-- Set (or clear = unknown) the unit cost; keeps history, a new row only when the value changes.
create or replace function public.set_product_unit_cost(p_product_id uuid, p_unit_cost numeric)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_org uuid; v_vid uuid; v_latest numeric; v_has boolean;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli' using errcode = '28000'; end if;
  if p_unit_cost is not null and (p_unit_cost < 0 or p_unit_cost > 1000000000 or round(p_unit_cost, 2) <> p_unit_cost) then
    raise exception 'Geçersiz birim maliyet' using errcode = '22023'; end if;
  select p.organization_id into v_org from public.products p where p.id = p_product_id;
  if v_org is null or not public.has_org_role(v_org, array['owner','admin','analyst']) then
    raise exception 'Ürün bulunamadı veya yetkiniz yok' using errcode = '42501'; end if;
  select v.id into v_vid from public.product_variants v where v.product_id = p_product_id order by v.created_at limit 1;
  if v_vid is null then raise exception 'Ürün varyantı bulunamadı' using errcode = '22023'; end if;
  select pc.unit_cost, true into v_latest, v_has from public.product_costs pc where pc.variant_id = v_vid
    order by pc.effective_from desc, pc.created_at desc limit 1;
  if p_unit_cost is null then
    -- Seller marked cost as unknown: remove cost rows so calculations flag it as missing.
    delete from public.product_costs where variant_id = v_vid;
  elsif v_has is null or v_latest is distinct from p_unit_cost then
    insert into public.product_costs(organization_id, variant_id, unit_cost, effective_from)
      values (v_org, v_vid, p_unit_cost, current_date);
  end if;
end; $$;

revoke all on function public.save_manual_product(uuid, uuid, text, text, text, integer, numeric) from public, anon;
revoke all on function public.set_product_unit_cost(uuid, numeric) from public, anon;
grant execute on function public.save_manual_product(uuid, uuid, text, text, text, integer, numeric) to authenticated;
grant execute on function public.set_product_unit_cost(uuid, numeric) to authenticated;

-- ---------- expenses ----------
alter table public.expenses add column if not exists data_source text not null default 'manual';
alter table public.expenses add column if not exists updated_at timestamptz not null default now();
alter table public.expenses drop constraint if exists expenses_data_source_check;
alter table public.expenses add constraint expenses_data_source_check check (data_source in ('manual','imported'));
alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses add constraint expenses_category_check
  check (category in ('reklam','kargo','vergi','paketleme','personel','yazilim','kira','diger'));
alter table public.expenses drop constraint if exists expenses_description_len;
alter table public.expenses add constraint expenses_description_len
  check (description is null or char_length(description) <= 300);

grant select, delete on public.expenses to authenticated;
grant insert (organization_id, store_id, expense_date, category, description, amount) on public.expenses to authenticated;
grant update (store_id, expense_date, category, description, amount) on public.expenses to authenticated;
grant all on public.expenses to service_role;

drop policy if exists expenses_org_access on public.expenses;
create policy expenses_select_member on public.expenses for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst','viewer']));
create policy expenses_insert_editor on public.expenses for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy expenses_update_editor on public.expenses for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']))
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy expenses_delete_editor on public.expenses for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']));

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------- order_records (manual sale / return / cancellation lines) ----------
create table public.order_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  record_type text not null check (record_type in ('sale','return','cancellation')),
  order_number text not null check (order_number ~ '^[A-Za-z0-9_-]{1,50}$'),
  record_date date not null,
  product_id uuid references public.products(id) on delete set null,
  quantity integer not null check (quantity between 1 and 100000),
  gross_amount numeric(14,2) not null check (gross_amount > 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  coupon_amount numeric(14,2) not null default 0 check (coupon_amount >= 0),
  commission_amount numeric(14,2) not null default 0 check (commission_amount >= 0),
  shipping_amount numeric(14,2) not null default 0 check (shipping_amount >= 0),
  withholding_amount numeric(14,2) not null default 0 check (withholding_amount >= 0),
  note text not null default '' check (char_length(note) <= 300),
  currency text not null default 'TRY',
  data_source text not null default 'manual' check (data_source in ('manual','imported')),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_records_discount_le_gross check (discount_amount + coupon_amount <= gross_amount),
  constraint order_records_store_fk foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);
create index order_records_org_date_idx on public.order_records(organization_id, record_date);
create index order_records_store_idx on public.order_records(store_id);
create index order_records_product_idx on public.order_records(product_id);

grant select, delete on public.order_records to authenticated;
grant insert (organization_id, store_id, record_type, order_number, record_date, product_id, quantity,
  gross_amount, discount_amount, coupon_amount, commission_amount, shipping_amount, withholding_amount, note)
  on public.order_records to authenticated;
grant update (store_id, record_type, order_number, record_date, product_id, quantity,
  gross_amount, discount_amount, coupon_amount, commission_amount, shipping_amount, withholding_amount, note)
  on public.order_records to authenticated;
grant all on public.order_records to service_role;

alter table public.order_records enable row level security;
create policy order_records_select_member on public.order_records for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst','viewer']));
create policy order_records_insert_editor on public.order_records for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy order_records_update_editor on public.order_records for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']) and data_source = 'manual')
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy order_records_delete_editor on public.order_records for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']));

-- Product on a record must belong to the same store.
create or replace function public.order_records_validate()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.product_id is not null and not exists (
    select 1 from public.products p
    where p.id = new.product_id and p.store_id = new.store_id and p.organization_id = new.organization_id
  ) then
    raise exception 'Ürün bu mağazaya ait değil' using errcode = '23503';
  end if;
  return new;
end; $$;
create trigger order_records_validate before insert or update on public.order_records
  for each row execute function public.order_records_validate();
create trigger order_records_set_updated_at before update on public.order_records
  for each row execute function public.set_updated_at();

-- ---------- reconciliations ----------
create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  gross_sales numeric(14,2) check (gross_sales >= 0),
  cancellations numeric(14,2) check (cancellations >= 0),
  returns numeric(14,2) check (returns >= 0),
  discounts numeric(14,2) check (discounts >= 0),
  commission numeric(14,2) check (commission >= 0),
  shipping numeric(14,2) check (shipping >= 0),
  withholding numeric(14,2) check (withholding >= 0),
  net_payout numeric(14,2) check (net_payout >= 0),
  note text not null default '' check (char_length(note) <= 300),
  data_source text not null default 'manual' check (data_source in ('manual','imported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reconciliations_store_period_key unique (store_id, period),
  constraint reconciliations_store_fk foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);
create index reconciliations_org_idx on public.reconciliations(organization_id);

grant select, delete on public.reconciliations to authenticated;
grant insert (organization_id, store_id, period, gross_sales, cancellations, returns, discounts,
  commission, shipping, withholding, net_payout, note) on public.reconciliations to authenticated;
grant update (gross_sales, cancellations, returns, discounts, commission, shipping, withholding, net_payout, note)
  on public.reconciliations to authenticated;
grant all on public.reconciliations to service_role;

alter table public.reconciliations enable row level security;
create policy reconciliations_select_member on public.reconciliations for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst','viewer']));
create policy reconciliations_insert_editor on public.reconciliations for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy reconciliations_update_editor on public.reconciliations for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']))
  with check (public.has_org_role(organization_id, array['owner','admin','analyst']));
create policy reconciliations_delete_editor on public.reconciliations for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','analyst']));
create trigger reconciliations_set_updated_at before update on public.reconciliations
  for each row execute function public.set_updated_at();

-- ---------- delete store with its expenses (FK alone would turn them into general expenses) ----------
create or replace function public.delete_store(p_store_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_org uuid;
begin
  select s.organization_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or not public.has_org_role(v_org, array['owner','admin']) then
    raise exception 'Mağaza bulunamadı veya yetkiniz yok' using errcode = '42501'; end if;
  delete from public.expenses where store_id = p_store_id;
  delete from public.stores where id = p_store_id;
end; $$;
revoke all on function public.delete_store(uuid) from public, anon;
grant execute on function public.delete_store(uuid) to authenticated;