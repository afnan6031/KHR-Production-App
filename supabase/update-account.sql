-- ============================================================
-- v17: Account (Gmail verify, birth date, phone) + "ID bhool gaye"
-- Pehle se chal rahe project ke liye sirf ye file Supabase > SQL Editor mein Run karein.
-- (Ye same cheezein schema.sql ke aakhir mein bhi hain. Dobara chalana safe hai.)
-- ============================================================

-- Nijji maloomat alag table mein: team ke baaqi log profiles se phone / birth date nahi dekh sakte.
create table if not exists public.account_private (
  id          uuid primary key references public.profiles(id) on delete cascade,
  birth_date  date,
  phone       text not null default '' check (char_length(phone) <= 30),
  gmail_verified boolean not null default false,
  verified_at timestamptz
);
alter table public.account_private enable row level security;
-- Koi policy nahi: seedha table se kuch parha / likha nahi ja sakta, sirf neeche ke functions se.

create or replace function public.get_my_account()
returns table (birth_date date, phone text, gmail_verified boolean)
language sql security definer set search_path = public as $$
  select a.birth_date, a.phone, a.gmail_verified from public.account_private a where a.id = auth.uid()
$$;

create or replace function public.save_my_account(p_birth date, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login zaroori hai'; end if;
  if p_birth is not null and (p_birth > current_date or p_birth < date '1900-01-01') then
    raise exception 'Birth date sahi nahi.';
  end if;
  insert into public.account_private (id, birth_date, phone)
  values (auth.uid(), p_birth, left(coalesce(trim(p_phone), ''), 30))
  on conflict (id) do update set birth_date = excluded.birth_date, phone = excluded.phone;
end $$;

-- Gmail verify: sirf tab jab abhi abhi email ke code (OTP) se login hua ho (JWT ke amr mein 'otp').
create or replace function public.mark_gmail_verified() returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if auth.uid() is null then return false; end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink', 'email_change')
      and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 900
  ) into ok;
  if not ok then return false; end if;
  insert into public.account_private (id, gmail_verified, verified_at) values (auth.uid(), true, now())
  on conflict (id) do update set gmail_verified = true, verified_at = now();
  return true;
end $$;

-- Email badli (nayi email ke code se confirm hone ke baad) to wo bhi verified.
create or replace function public.on_auth_email_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email and exists (select 1 from public.profiles where id = new.id) then
    insert into public.account_private (id, gmail_verified, verified_at) values (new.id, true, now())
    on conflict (id) do update set gmail_verified = true, verified_at = now();
  end if;
  return new;
end $$;
drop trigger if exists on_auth_email_changed on auth.users;
create trigger on_auth_email_changed after update of email on auth.users
  for each row execute function public.on_auth_email_changed();

-- "ID bhool gaye": naam + WhatsApp/ID sahi ho to email ka sirf ek hissa dikhta hai (ab***@gmail.com).
create or replace function public.login_hint(p_name text, p_contact text) returns text
language plpgsql security definer set search_path = public as $$
declare
  n int; em text;
  nn text := lower(trim(coalesce(p_name, '')));
  cc text := regexp_replace(lower(coalesce(p_contact, '')), '[^a-z0-9]', '', 'g');
  lp text;
begin
  if length(nn) < 2 or length(cc) < 3 then return null; end if;
  select count(*), max(u.email) into n, em
    from public.profiles p join auth.users u on u.id = p.id
   where lower(trim(p.full_name)) = nn and regexp_replace(lower(p.contact), '[^a-z0-9]', '', 'g') = cc;
  if n <> 1 or em is null then return null; end if;
  lp := split_part(em, '@', 1);
  return left(lp, case when length(lp) <= 3 then 1 else 2 end) || '***@' || split_part(em, '@', 2);
end $$;
grant execute on function public.login_hint(text, text) to anon, authenticated;
grant execute on function public.get_my_account() to authenticated;
grant execute on function public.save_my_account(date, text) to authenticated;
grant execute on function public.mark_gmail_verified() to authenticated;
