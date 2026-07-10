alter table public.product_stock_changes
add column if not exists note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_stock_changes'::regclass
      and conname = 'product_stock_changes_note_length'
  ) then
    alter table public.product_stock_changes
    add constraint product_stock_changes_note_length
    check (note is null or char_length(note) <= 500);
  end if;
end
$$;

create index if not exists product_stock_changes_product_created_id_idx
on public.product_stock_changes (product_id, created_at desc, id desc);
