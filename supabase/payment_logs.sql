-- ============================================================
-- SushiHana: ประวัติการชำระเงิน (payment_logs)
-- รันใน Supabase -> SQL Editor -> New query -> Run
-- ============================================================

-- 1) ตารางเก็บประวัติ
create table if not exists public.payment_logs (
  id            bigint generated always as identity primary key,
  session_id    text        not null,
  table_number  text        not null,
  adult_count   integer     not null default 0,
  child_count   integer     not null default 0,
  adult_price   integer     not null,
  child_price   integer     not null,
  total_amount  integer     not null,
  opened_at     timestamptz,
  paid_at       timestamptz not null default now()
);

create index if not exists payment_logs_paid_at_idx
  on public.payment_logs (paid_at desc);

-- 2) เปิด RLS และไม่สร้าง policy ให้ anon
--    -> หน้าเว็บ (anon key) อ่าน/แก้/ลบประวัติไม่ได้ ดูได้ผ่าน Supabase Dashboard เท่านั้น
alter table public.payment_logs enable row level security;

-- 3) ฟังก์ชันจดบันทึกอัตโนมัติ เมื่อโต๊ะเปลี่ยนสถานะ billing -> closed
--    security definer = ทำงานด้วยสิทธิ์เจ้าของตาราง จึงเขียนลงตารางที่ปิด RLS ไว้ได้
--    ถ้าเปลี่ยนราคาบุฟเฟต์ ให้แก้ตัวเลข 289 / 145 ตรงนี้ด้วย (ประวัติเก่าจะคงราคาเดิมไว้)
create or replace function public.log_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adult_price constant integer := 289;
  v_child_price constant integer := 145;
  v_adults      integer;
  v_children    integer;
begin
  if old.status = 'billing' and new.status = 'closed' then
    v_adults   := coalesce(new.adult_count, 0);
    v_children := coalesce(new.child_count, 0);

    insert into public.payment_logs (
      session_id, table_number, adult_count, child_count,
      adult_price, child_price, total_amount, opened_at
    ) values (
      new.id::text, new.table_number::text, v_adults, v_children,
      v_adult_price, v_child_price,
      v_adults * v_adult_price + v_children * v_child_price,
      new.created_at
    );
  end if;

  return new;
end;
$$;

-- 4) ผูกฟังก์ชันกับตาราง sessions
drop trigger if exists trg_log_payment on public.sessions;

create trigger trg_log_payment
after update of status on public.sessions
for each row
when (old.status is distinct from new.status)
execute function public.log_payment();
