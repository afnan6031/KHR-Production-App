-- ============================================================
-- KHR Production — Supabase database
-- Supabase Dashboard > SQL Editor > New query > ye poori file paste karein > Run
-- Is file ko dobara chalana safe hai (sirf missing cheezein banti hain).
-- ============================================================

-- ---------- PROFILES (har login karne wala banda) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  contact     text not null default '',          -- WhatsApp / ID jo signup par di
  note        text not null default '',
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  is_owner    boolean not null default false,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

-- ---------- CHANNELS ----------
create table if not exists public.channels (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  about          text not null default '',
  schedule_type  text not null default 'days' check (schedule_type in ('daily','days')),
  work_days      smallint[] not null default '{}',   -- 0=Sunday ... 6=Saturday
  time_from      time,
  time_to        time,
  deadline       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- CHANNEL MEMBERS (kis bande ke is channel mein kaun se roles) ----------
create table if not exists public.channel_members (
  channel_id  uuid not null references public.channels(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  roles       text[] not null default '{}',
  primary key (channel_id, user_id)
);

-- ---------- PERFORMANCE (har din/hafte ka number, history ke saath) ----------
create table if not exists public.performance (
  channel_id  uuid not null references public.channels(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null,
  rated_on    date not null default current_date,
  pct         smallint not null check (pct between 0 and 100),
  primary key (channel_id, user_id, role, rated_on)
);

-- ---------- DAILY VIEWS ----------
create table if not exists public.channel_views (
  channel_id  uuid not null references public.channels(id) on delete cascade,
  day         date not null,
  views       bigint not null check (views >= 0),
  primary key (channel_id, day)
);

-- ---------- VIDEOS / SCRIPTS ----------
create table if not exists public.videos (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  stage       text not null default 'idea' check (stage in ('idea','script','editing','design','review','published')),
  due         date,
  script      text not null default '',
  notes       text not null default '',
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists videos_channel_idx on public.videos(channel_id);
create index if not exists members_user_idx  on public.channel_members(user_id);
create index if not exists perf_user_idx     on public.performance(user_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_owner from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' or is_owner from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_member(ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved() and exists(
    select 1 from public.channel_members m where m.channel_id = ch and m.user_id = auth.uid()
  );
$$;

-- Signup par profile khud banta hai. Sab se pehla account OWNER ban jata hai.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists(select 1 from public.profiles) into first_user;
  insert into public.profiles (id, full_name, contact, note, status, is_owner, decided_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'contact', ''),
    coalesce(new.raw_user_meta_data->>'note', ''),
    case when first_user then 'approved' else 'pending' end,
    first_user,
    case when first_user then now() else null end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Member apna status ya owner flag khud nahi badal sakta.
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    new.status := old.status;
    new.is_owner := old.is_owner;
    new.decided_at := old.decided_at;
  elsif new.id = auth.uid() then
    new.is_owner := true;          -- owner khud ko owner se nahi hata sakta
    new.status := 'approved';
  end if;
  if new.status is distinct from old.status then new.decided_at := now(); end if;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

create or replace function public.touch_updated() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists channels_touch on public.channels;
create trigger channels_touch before update on public.channels for each row execute function public.touch_updated();

-- Video ka "aakhri update kis ne kiya" server khud set karta hai
create or replace function public.stamp_video() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := auth.uid(); new.created_at := now(); end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; new.channel_id := old.channel_id; end if;
  return new;
end $$;

drop trigger if exists videos_stamp on public.videos;
create trigger videos_stamp before insert or update on public.videos for each row execute function public.stamp_video();

-- ============================================================
-- ROW LEVEL SECURITY (kaun kya dekh / badal sakta hai)
-- ============================================================
alter table public.profiles        enable row level security;
alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.performance     enable row level security;
alter table public.channel_views   enable row level security;
alter table public.videos          enable row level security;

-- PROFILES: banda apna profile dekhe; approved team ek doosre ke naam dekhe; owner sab.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_owner() or (public.is_approved() and status = 'approved'));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_owner())
  with check (id = auth.uid() or public.is_owner());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_owner() and id <> auth.uid());

-- CHANNELS: owner sab; member sirf apne channels. Likhna sirf owner.
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels for select to authenticated
  using (public.is_owner() or public.is_member(id));
drop policy if exists channels_write on public.channels;
create policy channels_write on public.channels for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- CHANNEL MEMBERS: member apne channels ki team dekh sakta hai.
drop policy if exists members_select on public.channel_members;
create policy members_select on public.channel_members for select to authenticated
  using (public.is_owner() or public.is_member(channel_id));
drop policy if exists members_write on public.channel_members;
create policy members_write on public.channel_members for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- PERFORMANCE: har banda sirf apne numbers dekhe; owner sab ke dekhe aur de.
drop policy if exists perf_select on public.performance;
create policy perf_select on public.performance for select to authenticated
  using (public.is_owner() or (user_id = auth.uid() and public.is_approved()));
drop policy if exists perf_write on public.performance;
create policy perf_write on public.performance for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- VIEWS: channel ke members dekhein; sirf owner likhe.
drop policy if exists views_select on public.channel_views;
create policy views_select on public.channel_views for select to authenticated
  using (public.is_owner() or public.is_member(channel_id));
drop policy if exists views_write on public.channel_views;
create policy views_write on public.channel_views for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- VIDEOS: channel ke members dekhein, add karein aur script/stage badlein. Delete sirf owner.
drop policy if exists videos_select on public.videos;
create policy videos_select on public.videos for select to authenticated
  using (public.is_owner() or public.is_member(channel_id));
drop policy if exists videos_insert on public.videos;
create policy videos_insert on public.videos for insert to authenticated
  with check (public.is_owner() or public.is_member(channel_id));
drop policy if exists videos_update on public.videos;
create policy videos_update on public.videos for update to authenticated
  using (public.is_owner() or public.is_member(channel_id))
  with check (public.is_owner() or public.is_member(channel_id));
drop policy if exists videos_delete on public.videos;
create policy videos_delete on public.videos for delete to authenticated
  using (public.is_owner());

-- ============================================================
-- DAILY TASKS (v2)
-- Har din, har channel ke kaam wale din, har member ke har role ka ek task banta hai.
-- Deadline = us din channel ka "Kaam khatam" time (na ho to raat 11:59).
-- ============================================================
alter table public.channel_members add column if not exists added_at timestamptz not null default now();

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.channels(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null,
  day             date not null,
  due_at          timestamptz not null,
  status          text not null default 'pending' check (status in ('pending','done','rejected')),
  completed_at    timestamptz,
  rejected_at     timestamptz,
  rejected_reason text not null default '',
  created_at      timestamptz not null default now(),
  unique (channel_id, user_id, role, day)
);
create index if not exists tasks_day_idx  on public.tasks(day);
create index if not exists tasks_user_idx on public.tasks(user_id, day);

-- App ka time zone (Pakistan). Badalna ho to sirf yahan badlein.
create or replace function public.app_tz() returns text language sql immutable as $$ select 'Asia/Karachi' $$;
create or replace function public.app_today() returns date language sql stable as $$ select (now() at time zone public.app_tz())::date $$;

-- Ek din ke tasks banata hai (dobara chalana safe). Aaj ke din ke liye team/role/time ki tabdeeli bhi sync karta hai.
create or replace function public.ensure_tasks_for(d date) returns void
language plpgsql security definer set search_path = public as $$
declare tz text := public.app_tz();
begin
  insert into public.tasks (channel_id, user_id, role, day, due_at)
  select c.id, m.user_id, r.role, d,
         ((d + coalesce(c.time_to, time '23:59:59'))::timestamp at time zone tz)
  from public.channels c
  join public.channel_members m on m.channel_id = c.id
  join public.profiles p on p.id = m.user_id and (p.status = 'approved' or p.is_owner)
  cross join lateral unnest(m.roles) as r(role)
  where (c.schedule_type = 'daily' or extract(dow from d)::smallint = any(c.work_days))
    and d >= (c.created_at at time zone tz)::date
    and d >= (m.added_at at time zone tz)::date
  on conflict (channel_id, user_id, role, day) do nothing;

  if d = public.app_today() then
    -- jo role/member aaj hata diya gaya, us ka aaj ka pending task hata do
    delete from public.tasks t
    where t.day = d and t.status = 'pending' and not exists (
      select 1 from public.channels c
      join public.channel_members m on m.channel_id = c.id and m.user_id = t.user_id
      join public.profiles p on p.id = m.user_id and (p.status = 'approved' or p.is_owner)
      where c.id = t.channel_id and t.role = any(m.roles)
        and (c.schedule_type = 'daily' or extract(dow from d)::smallint = any(c.work_days))
    );
    -- aaj ka time badla ho to pending tasks ki deadline update
    update public.tasks t
       set due_at = ((d + coalesce(c.time_to, time '23:59:59'))::timestamp at time zone tz)
      from public.channels c
     where c.id = t.channel_id and t.day = d and t.status = 'pending';
  end if;
end $$;

-- Aakhri bane din se aaj tak ke tasks bana deta hai (zyada se zyada 31 din pichhe). App khulne par aur roz cron se chalta hai.
create or replace function public.ensure_tasks_upto() returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := public.app_today();
  start_day date;
  d date;
begin
  if auth.uid() is not null and not public.is_approved() then return; end if;
  select coalesce(max(day) + 1, today) into start_day from public.tasks;
  if start_day < today - 31 then start_day := today - 31; end if;
  d := start_day;
  while d < today loop
    perform public.ensure_tasks_for(d);
    d := d + 1;
  end loop;
  perform public.ensure_tasks_for(today);
end $$;

-- Member apna task complete / un-complete kare. Rejected task member nahi badal sakta.
create or replace function public.set_task_done(p_task uuid, p_done boolean) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  update public.tasks
     set status = case when p_done then 'done' else 'pending' end,
         completed_at = case when p_done then now() else null end
   where id = p_task
     and status <> 'rejected'
     and public.is_approved()
     and (user_id = auth.uid() or public.is_owner())
  returning * into t;
  if t.id is null then raise exception 'Ye task aap update nahi kar sakte (ya owner ne reject kiya hua hai).'; end if;
  return t;
end $$;

-- Owner kisi task ko reject / wapas restore kare
create or replace function public.review_task(p_task uuid, p_reject boolean, p_reason text default '') returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  if not public.is_owner() then raise exception 'Sirf owner task reject kar sakta hai.'; end if;
  update public.tasks
     set status = case when p_reject then 'rejected' when completed_at is not null then 'done' else 'pending' end,
         rejected_at = case when p_reject then now() else null end,
         rejected_reason = case when p_reject then coalesce(p_reason, '') else '' end
   where id = p_task
  returning * into t;
  if t.id is null then raise exception 'Task nahi mila.'; end if;
  return t;
end $$;

alter table public.tasks enable row level security;
-- Leaderboard sab ke liye hai, is liye approved team sab ke tasks dekh sakti hai. Likhna sirf upar wale functions se.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (public.is_approved());
drop policy if exists tasks_owner_delete on public.tasks;
create policy tasks_owner_delete on public.tasks for delete to authenticated using (public.is_owner());

grant execute on function public.ensure_tasks_upto() to authenticated;
grant execute on function public.set_task_done(uuid, boolean) to authenticated;
grant execute on function public.review_task(uuid, boolean, text) to authenticated;
revoke execute on function public.ensure_tasks_for(date) from public, anon, authenticated;

-- Roz raat 12:05 (Pakistan) khud tasks ban jayein, chahe koi app na khole. (pg_cron na mile to bhi app khulne par tasks ban jate hain.)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('khr-daily-tasks', '5 19 * * *', 'select public.ensure_tasks_upto()');
exception when others then
  raise notice 'pg_cron set nahi hua (%). Koi baat nahi: app khulne par tasks ban jate hain. Chahein to Dashboard > Integrations > Cron enable kar ke ye file dobara Run karein.', sqlerrm;
end $$;

-- ============================================================
-- REALTIME (dusre ka kaam foran screen par aaye)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['profiles','channels','channel_members','performance','channel_views','videos','tasks'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
