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
-- ============================================================
-- v3: ROLE-WISE TIMELINE + TASK ATTACHMENTS
-- Har channel mein har role ka apna Start aur Deadline time (channels.role_times).
-- Misal: {"Script Writer": {"start": "09:00", "end": "12:00"}, "Editor": {"start": "12:00", "end": "17:00"}}
-- Deadline start se pehle ho (raat ki shift) to deadline agle din ki maani jati hai.
-- ============================================================
alter table public.channels add column if not exists role_times jsonb not null default '{}'::jsonb;
alter table public.tasks add column if not exists start_at timestamptz;
alter table public.tasks add column if not exists script_url text not null default '';
alter table public.tasks add column if not exists thumbnail_url text not null default '';
alter table public.tasks add column if not exists thumbnail_delete_url text not null default '';
alter table public.tasks add column if not exists attach_updated_by uuid references public.profiles(id) on delete set null;
alter table public.tasks add column if not exists attach_updated_at timestamptz;

-- Kisi role ka us din ka start aur deadline (Pakistan time se timestamptz)
create or replace function public.role_window(p_role_times jsonb, p_from time, p_to time, p_role text, d date,
  out start_at timestamptz, out due_at timestamptz)
language plpgsql stable as $$
declare
  tz text := public.app_tz();
  st time := coalesce(nullif(p_role_times -> p_role ->> 'start', '')::time, p_from, time '00:00');
  en time := coalesce(nullif(p_role_times -> p_role ->> 'end', '')::time, p_to, time '23:59:59');
begin
  start_at := ((d + st)::timestamp at time zone tz);
  due_at := (((d + case when en <= st then 1 else 0 end) + en)::timestamp at time zone tz);
end $$;

-- Ek din ke tasks banata hai (dobara chalana safe). Naye task ki attachments hamesha khaali hoti hain.
create or replace function public.ensure_tasks_for(d date) returns void
language plpgsql security definer set search_path = public as $$
declare tz text := public.app_tz();
begin
  insert into public.tasks (channel_id, user_id, role, day, start_at, due_at)
  select c.id, m.user_id, r.role, d, w.start_at, w.due_at
  from public.channels c
  join public.channel_members m on m.channel_id = c.id
  join public.profiles p on p.id = m.user_id and (p.status = 'approved' or p.is_owner)
  cross join lateral unnest(m.roles) as r(role)
  cross join lateral public.role_window(c.role_times, c.time_from, c.time_to, r.role, d) w
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
    -- aaj role ka time badla ho to pending tasks ka start/deadline update
    update public.tasks t
       set start_at = (public.role_window(c.role_times, c.time_from, c.time_to, t.role, d)).start_at,
           due_at   = (public.role_window(c.role_times, c.time_from, c.time_to, t.role, d)).due_at
      from public.channels c
     where c.id = t.channel_id and t.day = d and t.status = 'pending';
  end if;
end $$;

-- Task par Script link / Thumbnail lagana ya hatana. Us channel ka koi bhi member ya owner kar sakta hai.
create or replace function public.set_task_attachments(p_task uuid, p_script_url text, p_thumbnail_url text, p_thumbnail_delete_url text default '')
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks; ch uuid;
begin
  select channel_id into ch from public.tasks where id = p_task;
  if ch is null then raise exception 'Task nahi mila.'; end if;
  if not (public.is_owner() or public.is_member(ch)) then raise exception 'Sirf is channel ki team attachments laga sakti hai.'; end if;
  if coalesce(p_script_url, '') <> '' and p_script_url !~* '^https?://' then raise exception 'Script ka link http:// ya https:// se shuru hona chahiye.'; end if;
  if coalesce(p_thumbnail_url, '') <> '' and p_thumbnail_url !~* '^https://' then raise exception 'Thumbnail ka link https:// hona chahiye.'; end if;
  update public.tasks
     set script_url = left(coalesce(p_script_url, ''), 2000),
         thumbnail_url = left(coalesce(p_thumbnail_url, ''), 2000),
         thumbnail_delete_url = left(coalesce(p_thumbnail_delete_url, ''), 2000),
         attach_updated_by = auth.uid(),
         attach_updated_at = now()
   where id = p_task
  returning * into t;
  return t;
end $$;
grant execute on function public.set_task_attachments(uuid, text, text, text) to authenticated;

-- ============================================================
-- v3.1: CHANNEL KI DAILY SCRIPTS / THUMBNAILS (har din kitni bhi, title + date ke saath)
-- Har attachment ek channel aur ek din ka hota hai (aur jis task se lagaya gaya, us ka task_id).
-- Naye din ki list khaali hoti hai; purane din history mein rehte hain.
-- ============================================================
create table if not exists public.attachments (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels(id) on delete cascade,
  day         date not null default public.app_today(),
  task_id     uuid references public.tasks(id) on delete set null,
  kind        text not null check (kind in ('script', 'thumbnail')),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  url         text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  delete_url  text not null default '',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists attachments_channel_day_idx on public.attachments(channel_id, day);

-- banane wala aur waqt server khud likhta hai; task_id usi channel ka hona chahiye
create or replace function public.stamp_attachment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then   -- app se: hamesha asli banane wala aur abhi ka waqt
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  new.title := btrim(new.title);
  if new.task_id is not null and not exists (select 1 from public.tasks t where t.id = new.task_id and t.channel_id = new.channel_id) then
    new.task_id := null;
  end if;
  if new.kind = 'thumbnail' and new.url !~* '^https://' then
    raise exception 'Thumbnail ka link https:// hona chahiye.';
  end if;
  return new;
end $$;
drop trigger if exists attachments_stamp on public.attachments;
create trigger attachments_stamp before insert on public.attachments for each row execute function public.stamp_attachment();

alter table public.attachments enable row level security;
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using (public.is_owner() or public.is_member(channel_id));
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.is_owner() or public.is_member(channel_id));
drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated
  using (public.is_owner() or (created_by = auth.uid() and public.is_member(channel_id)));

-- v3 mein task par lagaye gaye link/thumbnail naye table mein le aao (sirf ek dafa)
insert into public.attachments (channel_id, day, task_id, kind, title, url, delete_url, created_by, created_at)
select t.channel_id, t.day, t.id, 'script', 'Script', t.script_url, '', t.attach_updated_by, coalesce(t.attach_updated_at, now())
from public.tasks t
where coalesce(t.script_url, '') ~* '^https?://'
  and not exists (select 1 from public.attachments a where a.task_id = t.id and a.kind = 'script' and a.url = t.script_url);
insert into public.attachments (channel_id, day, task_id, kind, title, url, delete_url, created_by, created_at)
select t.channel_id, t.day, t.id, 'thumbnail', 'Thumbnail', t.thumbnail_url, t.thumbnail_delete_url, t.attach_updated_by, coalesce(t.attach_updated_at, now())
from public.tasks t
where coalesce(t.thumbnail_url, '') ~* '^https://'
  and not exists (select 1 from public.attachments a where a.task_id = t.id and a.kind = 'thumbnail' and a.url = t.thumbnail_url);

-- ============================================================
-- v4: SCRIPT APP KE ANDAR LIKHNA + CHANNEL MESSAGES
-- ============================================================
-- Script ab link ke bajaye (ya saath) seedha text bhi ho sakti hai
alter table public.attachments add column if not exists body text not null default '';
alter table public.attachments alter column url set default '';
alter table public.attachments drop constraint if exists attachments_url_check;
alter table public.attachments drop constraint if exists attachments_content_check;
alter table public.attachments add constraint attachments_content_check check (
  char_length(url) <= 2000 and char_length(body) <= 100000
  and (url = '' or url ~* '^https?://')
  and (url <> '' or (kind = 'script' and btrim(body) <> ''))
);

-- Har channel ki baat-cheet: message, reply aur links
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  reply_to    uuid references public.messages(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists messages_channel_idx on public.messages(channel_id, created_at desc);

create or replace function public.stamp_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    new.created_at := now();
  end if;
  new.body := btrim(new.body);
  if new.reply_to is not null and not exists (select 1 from public.messages m where m.id = new.reply_to and m.channel_id = new.channel_id) then
    new.reply_to := null;
  end if;
  return new;
end $$;
drop trigger if exists messages_stamp on public.messages;
create trigger messages_stamp before insert on public.messages for each row execute function public.stamp_message();

alter table public.messages enable row level security;
drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select to authenticated using (public.is_owner() or public.is_member(channel_id));
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert to authenticated with check (public.is_owner() or public.is_member(channel_id));
drop policy if exists msg_delete on public.messages;
create policy msg_delete on public.messages for delete to authenticated
  using (public.is_owner() or (user_id = auth.uid() and public.is_member(channel_id)));

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
  -- v6: role ka waqt shuru hone se pehle task complete nahi ho sakta
  if p_done and exists (select 1 from public.tasks where id = p_task and start_at is not null and start_at > now()) then
    raise exception 'Is task ka waqt abhi shuru nahi hua. Start time ke baad tick karein.';
  end if;
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
-- v5: KHR SERVER (Discord jaisa): channels, roles, friends, DMs, profile photo
-- Tasveerein ImgBB par jati hain; yahan sirf un ka link save hota hai.
-- ============================================================

-- Profile photo (ImgBB link) aur server role (Co-Founder, GM, Editor...)
alter table public.profiles add column if not exists avatar_url text not null default '';
alter table public.profiles add column if not exists server_role text not null default '';
alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (avatar_url = '' or avatar_url ~* '^https://');
update public.profiles set server_role = 'Owner' where is_owner and server_role = '';

-- member apna server role khud nahi badal sakta (sirf owner)
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    new.status := old.status;
    new.is_owner := old.is_owner;
    new.decided_at := old.decided_at;
    new.server_role := old.server_role;
  elsif new.id = auth.uid() then
    new.is_owner := true;          -- owner khud ko owner se nahi hata sakta
    new.status := 'approved';
  end if;
  if new.status is distinct from old.status then new.decided_at := now(); end if;
  return new;
end $$;

-- ---------- Server channels ----------
create table if not exists public.server_channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  topic       text not null default '',
  category    text not null default 'Text Channels',
  position    int not null default 0,
  is_private  boolean not null default false,   -- sirf chune hue log dekh sakte hain
  read_only   boolean not null default false,   -- sirf owner message kar sakta hai
  created_at  timestamptz not null default now()
);

create table if not exists public.server_channel_members (
  channel_id  uuid not null references public.server_channels(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  primary key (channel_id, user_id)
);

create or replace function public.can_see_server_channel(ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or (public.is_approved() and exists (
    select 1 from public.server_channels c
    where c.id = ch and (not c.is_private or exists (select 1 from public.server_channel_members m where m.channel_id = c.id and m.user_id = auth.uid()))
  ));
$$;

create table if not exists public.server_messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.server_channels(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  body        text not null default '',
  image_url   text not null default '',
  reply_to    uuid references public.server_messages(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (char_length(body) <= 4000 and (image_url = '' or image_url ~* '^https://') and (btrim(body) <> '' or image_url <> ''))
);
create index if not exists server_messages_ch_idx on public.server_messages(channel_id, created_at desc);

create or replace function public.stamp_server_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); new.created_at := now(); end if;
  new.body := btrim(new.body);
  if new.reply_to is not null and not exists (select 1 from public.server_messages m where m.id = new.reply_to and m.channel_id = new.channel_id) then
    new.reply_to := null;
  end if;
  return new;
end $$;
drop trigger if exists server_messages_stamp on public.server_messages;
create trigger server_messages_stamp before insert on public.server_messages for each row execute function public.stamp_server_message();

alter table public.server_channels enable row level security;
alter table public.server_channel_members enable row level security;
alter table public.server_messages enable row level security;

drop policy if exists sc_select on public.server_channels;
create policy sc_select on public.server_channels for select to authenticated using (public.can_see_server_channel(id));
drop policy if exists sc_write on public.server_channels;
create policy sc_write on public.server_channels for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists scm_select on public.server_channel_members;
create policy scm_select on public.server_channel_members for select to authenticated using (public.can_see_server_channel(channel_id));
drop policy if exists scm_write on public.server_channel_members;
create policy scm_write on public.server_channel_members for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists sm_select on public.server_messages;
create policy sm_select on public.server_messages for select to authenticated using (public.can_see_server_channel(channel_id));
drop policy if exists sm_insert on public.server_messages;
create policy sm_insert on public.server_messages for insert to authenticated with check (
  public.can_see_server_channel(channel_id)
  and (public.is_owner() or not exists (select 1 from public.server_channels c where c.id = channel_id and c.read_only))
);
drop policy if exists sm_delete on public.server_messages;
create policy sm_delete on public.server_messages for delete to authenticated using (public.is_owner() or user_id = auth.uid());

-- shuru ke 2 channels (sirf jab koi channel na ho)
insert into public.server_channels (name, topic, category, position, read_only)
select * from (values
  ('announcement', 'Company ki zaroori khabrein. Sirf owner likh sakta hai.', 'Information', 0, true),
  ('general', 'Team ki aam baat-cheet, sirf kaam ki baat.', 'Text Channels', 1, false)
) v(name, topic, category, position, read_only)
where not exists (select 1 from public.server_channels);

-- ---------- Friends ----------
create table if not exists public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null references public.profiles(id) on delete cascade,
  to_user     uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);
create unique index if not exists friend_pair_uq on public.friend_requests (least(from_user, to_user), greatest(from_user, to_user));

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friend_requests f
    where f.status = 'accepted' and ((f.from_user = a and f.to_user = b) or (f.from_user = b and f.to_user = a)));
$$;

-- DM ki ijazat: dono friends hon, ya dono mein se ek owner ho
create or replace function public.can_dm(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b
     and exists (select 1 from public.profiles p where p.id = b and (p.status = 'approved' or p.is_owner))
     and exists (select 1 from public.profiles p where p.id = a and (p.status = 'approved' or p.is_owner))
     and (public.are_friends(a, b) or exists (select 1 from public.profiles p where p.id in (a, b) and p.is_owner));
$$;

create or replace function public.send_friend_request(p_to uuid) returns public.friend_requests
language plpgsql security definer set search_path = public as $$
declare r public.friend_requests;
begin
  if not public.is_approved() then raise exception 'Pehle owner aap ko approve kare.'; end if;
  if p_to = auth.uid() then raise exception 'Khud ko request nahi bhej sakte.'; end if;
  if not exists (select 1 from public.profiles where id = p_to and (status = 'approved' or is_owner)) then raise exception 'Ye banda team mein nahi.'; end if;
  select * into r from public.friend_requests where least(from_user, to_user) = least(auth.uid(), p_to) and greatest(from_user, to_user) = greatest(auth.uid(), p_to);
  if r.id is not null then
    -- samne wale ne pehle hi request bheji hui ho to seedha friend
    if r.status = 'pending' and r.to_user = auth.uid() then
      update public.friend_requests set status = 'accepted', responded_at = now() where id = r.id returning * into r;
    end if;
    return r;
  end if;
  insert into public.friend_requests (from_user, to_user) values (auth.uid(), p_to) returning * into r;
  return r;
end $$;

create or replace function public.respond_friend_request(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = p_id and to_user = auth.uid() and status = 'pending';
    if not found then raise exception 'Request nahi mili.'; end if;
  else
    delete from public.friend_requests where id = p_id and to_user = auth.uid() and status = 'pending';
  end if;
end $$;

alter table public.friend_requests enable row level security;
drop policy if exists fr_select on public.friend_requests;
create policy fr_select on public.friend_requests for select to authenticated using (from_user = auth.uid() or to_user = auth.uid() or public.is_owner());
-- request cancel karna / unfriend: dono mein se koi bhi
drop policy if exists fr_delete on public.friend_requests;
create policy fr_delete on public.friend_requests for delete to authenticated using (from_user = auth.uid() or to_user = auth.uid());
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- ---------- Direct messages ----------
create table if not exists public.direct_messages (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid references public.profiles(id) on delete set null,
  to_user     uuid not null references public.profiles(id) on delete cascade,
  body        text not null default '',
  image_url   text not null default '',
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  check (char_length(body) <= 4000 and (image_url = '' or image_url ~* '^https://') and (btrim(body) <> '' or image_url <> ''))
);
create index if not exists dm_pair_idx on public.direct_messages (least(from_user, to_user), greatest(from_user, to_user), created_at desc);

create or replace function public.stamp_dm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.from_user := auth.uid(); new.created_at := now(); new.read_at := null; end if;
  new.body := btrim(new.body);
  return new;
end $$;
drop trigger if exists dm_stamp on public.direct_messages;
create trigger dm_stamp before insert on public.direct_messages for each row execute function public.stamp_dm();

create or replace function public.mark_dm_read(p_peer uuid) returns void
language sql security definer set search_path = public as $$
  update public.direct_messages set read_at = now() where to_user = auth.uid() and from_user = p_peer and read_at is null;
$$;
grant execute on function public.mark_dm_read(uuid) to authenticated;

alter table public.direct_messages enable row level security;
-- Company policy: DMs company ka record hain; owner review kar sakta hai (app mein sab ko bataya jata hai)
drop policy if exists dm_select on public.direct_messages;
create policy dm_select on public.direct_messages for select to authenticated using (from_user = auth.uid() or to_user = auth.uid() or public.is_owner());
drop policy if exists dm_insert on public.direct_messages;
create policy dm_insert on public.direct_messages for insert to authenticated with check (public.can_dm(auth.uid(), to_user));
drop policy if exists dm_delete on public.direct_messages;
create policy dm_delete on public.direct_messages for delete to authenticated using (from_user = auth.uid());

-- ============================================================
-- REALTIME (dusre ka kaam foran screen par aaye)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['profiles','channels','channel_members','performance','channel_views','videos','tasks','attachments','messages','server_channels','server_channel_members','server_messages','friend_requests','direct_messages'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================================================
-- v8: APP BAND HO TAB BHI NOTIFICATIONS (Android push via Firebase)
--   Har event (message, DM, script, assign, tick, reject, friend request, deadline)
--   push_outbox mein aata hai -> "khr-push" Edge Function Firebase se phone par bhejta hai.
--   Setup: README ka "v8" hissa (Firebase + Edge Function + neeche wali push_config line).
-- ============================================================
create table if not exists public.push_tokens (
  token       text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null default 'android',
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens(user_id);
alter table public.push_tokens enable row level security;   -- koi direct access nahi, sirf neeche wale functions

create table if not exists public.push_outbox (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists push_outbox_pending_idx on public.push_outbox(id) where sent_at is null;
alter table public.push_outbox enable row level security;   -- app se koi parh/likh nahi sakta

-- Edge Function ka pata + secret (sirf database ke andar, app ko kabhi nazar nahi aata)
create schema if not exists khr_private;
revoke all on schema khr_private from public;
do $$ begin execute 'revoke all on schema khr_private from anon, authenticated'; exception when others then null; end $$;
create table if not exists khr_private.push_config (
  id            int primary key default 1 check (id = 1),
  function_url  text not null,
  secret        text not null
);

-- deadline alerts ek hi dafa jayein (1 = shuru, 2 = 10 minute pehle, 4 = khatam)
alter table public.tasks add column if not exists push_sent smallint not null default 0;

create or replace function public.register_push_token(p_token text, p_platform text default 'android') returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Login zaroori hai'; end if;
  if p_token is null or char_length(p_token) < 10 or char_length(p_token) > 4096 then raise exception 'Galat token'; end if;
  insert into public.push_tokens(token, user_id, platform, updated_at)
  values (p_token, auth.uid(), coalesce(nullif(p_platform, ''), 'android'), now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  -- true = server par push chalu hai (app phir deadline khud schedule nahi karti, double na aayein)
  return exists (select 1 from khr_private.push_config);
end $$;

create or replace function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- Edge Function ko jagao (pg_net). Kuch bhi galat ho to asal kaam (message bhejna waghera) kabhi na ruke.
create or replace function public.khr_push_kick() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select function_url, secret into v_url, v_secret from khr_private.push_config where id = 1;
  if v_url is null then return; end if;
  begin
    perform net.http_post(url := v_url, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-khr-secret', v_secret));
  exception when others then null;
  end;
end $$;

create or replace function public.khr_push_outbox_kick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.khr_push_kick();
  return null;
end $$;
drop trigger if exists push_outbox_kick on public.push_outbox;
create trigger push_outbox_kick after insert on public.push_outbox for each statement execute function public.khr_push_outbox_kick();

-- Kin logon ko bhejna hai (sirf jin ke phone register hain, aur jo khud ye kaam karne wala nahi)
create or replace function public.khr_notify(p_users uuid[], p_except uuid, p_title text, p_body text, p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_outbox(user_id, title, body, data)
  select distinct u, left(p_title, 120), left(coalesce(p_body, ''), 240), coalesce(p_data, '{}'::jsonb)
  from unnest(p_users) as u
  where u is not null and u is distinct from p_except
    and exists (select 1 from public.push_tokens t where t.user_id = u);
exception when others then
  raise warning 'khr_notify: %', sqlerrm;   -- notification fail ho to bhi asal kaam ho jaye
end $$;

create or replace function public.khr_name(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(btrim(full_name), '') from public.profiles where id = p), 'Koi member');
$$;

-- channel (card) ke log + owner
create or replace function public.khr_channel_people(ch uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select user_id as u from public.channel_members where channel_id = ch and coalesce(array_length(roles, 1), 0) > 0
    union select id from public.profiles where is_owner
  ) x;
$$;

-- server channel dekhne wale log
create or replace function public.khr_server_people(ch uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p.id), '{}')
  from public.profiles p, public.server_channels c
  where c.id = ch and (p.is_owner or (p.status = 'approved' and (not c.is_private
        or exists (select 1 from public.server_channel_members m where m.channel_id = c.id and m.user_id = p.id))));
$$;

revoke execute on function public.khr_notify(uuid[], uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.khr_push_kick() from public, anon, authenticated;
revoke execute on function public.khr_channel_people(uuid) from public, anon, authenticated;
revoke execute on function public.khr_server_people(uuid) from public, anon, authenticated;

create or replace function public.khr_ev_dm() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.khr_notify(array[new.to_user], new.from_user, public.khr_name(new.from_user),
    case when btrim(new.body) <> '' then new.body else '📷 Photo' end,
    jsonb_build_object('type', 'dm', 'peer', new.from_user));
  return null;
end $$;
drop trigger if exists push_dm on public.direct_messages;
create trigger push_dm after insert on public.direct_messages for each row execute function public.khr_ev_dm();

create or replace function public.khr_ev_server_msg() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from public.server_channels where id = new.channel_id;
  perform public.khr_notify(public.khr_server_people(new.channel_id), new.user_id,
    '#' || coalesce(v_name, 'channel') || ' · ' || public.khr_name(new.user_id),
    case when btrim(new.body) <> '' then new.body else '📷 Photo' end,
    jsonb_build_object('type', 'srv', 'channel', new.channel_id));
  return null;
end $$;
drop trigger if exists push_server_msg on public.server_messages;
create trigger push_server_msg after insert on public.server_messages for each row execute function public.khr_ev_server_msg();

create or replace function public.khr_ev_card_msg() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from public.channels where id = new.channel_id;
  perform public.khr_notify(public.khr_channel_people(new.channel_id), new.user_id,
    '💬 ' || coalesce(v_name, 'Channel') || ' · ' || public.khr_name(new.user_id), new.body,
    jsonb_build_object('type', 'chat', 'channel', new.channel_id));
  return null;
end $$;
drop trigger if exists push_card_msg on public.messages;
create trigger push_card_msg after insert on public.messages for each row execute function public.khr_ev_card_msg();

create or replace function public.khr_ev_attachment() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from public.channels where id = new.channel_id;
  perform public.khr_notify(public.khr_channel_people(new.channel_id), new.created_by,
    coalesce(v_name, 'Channel') || ': nayi ' || case when new.kind = 'script' then 'script 📄' else 'thumbnail 🖼' end,
    new.title || ' · ' || public.khr_name(new.created_by),
    jsonb_build_object('type', 'file', 'channel', new.channel_id));
  return null;
end $$;
drop trigger if exists push_attachment on public.attachments;
create trigger push_attachment after insert on public.attachments for each row execute function public.khr_ev_attachment();

create or replace function public.khr_ev_assign() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_new text[];
begin
  if coalesce(array_length(new.roles, 1), 0) = 0 then return null; end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(r), '{}') into v_new from unnest(new.roles) r where not (r = any(coalesce(old.roles, '{}')));
  else
    v_new := new.roles;
  end if;
  if coalesce(array_length(v_new, 1), 0) = 0 then return null; end if;
  select name into v_name from public.channels where id = new.channel_id;
  perform public.khr_notify(array[new.user_id], auth.uid(), '📌 Naya kaam assign hua',
    coalesce(v_name, 'Channel') || ' mein aap ka role: ' || array_to_string(v_new, ', '),
    jsonb_build_object('type', 'assign', 'channel', new.channel_id));
  return null;
end $$;
drop trigger if exists push_assign on public.channel_members;
create trigger push_assign after insert or update of roles on public.channel_members for each row execute function public.khr_ev_assign();

create or replace function public.khr_ev_task() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.status is not distinct from old.status then return null; end if;
  select name into v_name from public.channels where id = new.channel_id;
  if new.status = 'done' then
    perform public.khr_notify((select coalesce(array_agg(id), '{}') from public.profiles where is_owner), new.user_id,
      '✅ Task complete', public.khr_name(new.user_id) || ' ne ' || coalesce(v_name, 'channel') || ' (' || new.role || ') complete kiya',
      jsonb_build_object('type', 'task', 'channel', new.channel_id));
  elsif new.status = 'rejected' then
    perform public.khr_notify(array[new.user_id], null, '✕ Task reject hua',
      coalesce(v_name, 'Channel') || ' (' || new.role || ')' || case when new.rejected_reason <> '' then ': ' || new.rejected_reason else '' end,
      jsonb_build_object('type', 'task', 'channel', new.channel_id));
  end if;
  return null;
end $$;
drop trigger if exists push_task on public.tasks;
create trigger push_task after update of status on public.tasks for each row execute function public.khr_ev_task();

create or replace function public.khr_ev_friend() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.khr_notify(array[new.to_user], new.from_user, '🤝 Friend request',
      public.khr_name(new.from_user) || ' ne aap ko friend request bheji', jsonb_build_object('type', 'friend'));
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.khr_notify(array[new.from_user], new.to_user, '🤝 Request accept',
      public.khr_name(new.to_user) || ' ne aap ki friend request accept kar li', jsonb_build_object('type', 'friend'));
  end if;
  return null;
end $$;
drop trigger if exists push_friend on public.friend_requests;
create trigger push_friend after insert or update of status on public.friend_requests for each row execute function public.khr_ev_friend();

-- Har minute: deadline shuru / 10 minute baqi / khatam (sirf pichle 15 minute ke andar wale, purane nahi)
create or replace function public.khr_deadline_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    update public.tasks t set push_sent = push_sent | 1
    where status = 'pending' and (push_sent & 1) = 0 and start_at is not null
      and start_at <= now() and start_at > now() - interval '15 minutes' and due_at > now()
    returning t.id, t.user_id, t.channel_id, t.role, t.due_at
  loop
    perform public.khr_notify(array[r.user_id], null, '▶ Kaam ka waqt shuru',
      coalesce((select name from public.channels where id = r.channel_id), 'Channel') || ' · ' || r.role || ' · deadline ' || to_char(r.due_at at time zone public.app_tz(), 'HH12:MI AM'),
      jsonb_build_object('type', 'deadline', 'channel', r.channel_id));
  end loop;
  for r in
    update public.tasks t set push_sent = push_sent | 2
    where status = 'pending' and (push_sent & 2) = 0
      and due_at - interval '10 minutes' <= now() and due_at - interval '10 minutes' > now() - interval '15 minutes' and due_at > now()
    returning t.id, t.user_id, t.channel_id, t.role, t.due_at
  loop
    perform public.khr_notify(array[r.user_id], null, '⏰ 10 minute baqi',
      coalesce((select name from public.channels where id = r.channel_id), 'Channel') || ' · ' || r.role || ' ki deadline ' || to_char(r.due_at at time zone public.app_tz(), 'HH12:MI AM') || ' par khatam',
      jsonb_build_object('type', 'deadline', 'channel', r.channel_id));
  end loop;
  for r in
    update public.tasks t set push_sent = push_sent | 4
    where status = 'pending' and (push_sent & 4) = 0
      and due_at <= now() and due_at > now() - interval '15 minutes'
    returning t.id, t.user_id, t.channel_id, t.role
  loop
    perform public.khr_notify(array[r.user_id], null, '⛔ Deadline khatam',
      coalesce((select name from public.channels where id = r.channel_id), 'Channel') || ' · ' || r.role || ' — abhi tak complete nahi hua',
      jsonb_build_object('type', 'deadline', 'channel', r.channel_id));
  end loop;
  -- koi purani notification atki ho to dobara bhejne ki koshish, aur 3 din purani saaf
  if exists (select 1 from public.push_outbox where sent_at is null and created_at < now() - interval '1 minute') then
    perform public.khr_push_kick();
  end if;
  delete from public.push_outbox where created_at < now() - interval '3 days';
end $$;
revoke execute on function public.khr_deadline_tick() from public, anon, authenticated;

-- Edge Function bhejne se pehle notifications "claim" karta hai (do dafa na jayein)
create or replace function public.khr_claim_push(p_limit int default 200)
returns table (id bigint, user_id uuid, title text, body text, data jsonb, tokens text[])
language plpgsql security definer set search_path = public as $$
begin
  return query
  with c as (
    update public.push_outbox o set sent_at = now()
    where o.id in (select x.id from public.push_outbox x where x.sent_at is null order by x.id limit p_limit for update skip locked)
    returning o.id, o.user_id, o.title, o.body, o.data
  )
  select c.id, c.user_id, c.title, c.body, c.data,
         coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = c.user_id), '{}')
  from c order by c.id;
end $$;
create or replace function public.khr_drop_token(p_token text) returns void
language sql security definer set search_path = public as $$ delete from public.push_tokens where token = p_token; $$;
revoke execute on function public.khr_claim_push(int) from public, anon, authenticated;
revoke execute on function public.khr_drop_token(text) from public, anon, authenticated;
do $$ begin
  execute 'grant execute on function public.khr_claim_push(int) to service_role';
  execute 'grant execute on function public.khr_drop_token(text) to service_role';
exception when others then null; end $$;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net enable nahi hua (%). Dashboard > Database > Extensions mein "pg_net" on karein.', sqlerrm;
end $$;
do $$
begin
  perform cron.schedule('khr-deadline-alerts', '* * * * *', 'select public.khr_deadline_tick()');
exception when others then
  raise notice 'Deadline alerts ka cron set nahi hua (%). Dashboard > Integrations > Cron enable kar ke ye file dobara Run karein.', sqlerrm;
end $$;

-- SETUP (sirf ek dafa, apni values ke saath — README "v8" dekhein):
-- insert into khr_private.push_config (id, function_url, secret)
-- values (1, 'https://APNA-PROJECT.supabase.co/functions/v1/khr-push', 'APNA-LAMBA-SECRET')
-- on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;

-- ============================================================
-- v9: PROFILE (about, title, banner, theme/language), MUSIC, VIDEOS (script + thumbnail),
--     KAI DIN KI DEADLINE, CUSTOM KAAM, DEADLINE EXTENSION, CHAT EDIT / PIN / FORWARD
--     Saari tasveerein ImgBB par; yahan sirf link.
-- ============================================================

-- ---------- Profile ----------
alter table public.profiles add column if not exists about text not null default '';
alter table public.profiles add column if not exists title text not null default '';        -- owner deta hai: "Best Editor (Sep)"
alter table public.profiles add column if not exists banner_url text not null default '';
alter table public.profiles add column if not exists prefs jsonb not null default '{}'::jsonb;  -- theme / background / language
alter table public.profiles drop constraint if exists profiles_v9_check;
alter table public.profiles add constraint profiles_v9_check check (
  char_length(about) <= 500 and char_length(title) <= 80
  and (banner_url = '' or banner_url ~* '^https://') and pg_column_size(prefs) <= 8000
);

create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    new.status := old.status;
    new.is_owner := old.is_owner;
    new.decided_at := old.decided_at;
    new.server_role := old.server_role;
    new.title := old.title;            -- title sirf owner de sakta hai
  elsif new.id = auth.uid() then
    new.is_owner := true;
    new.status := 'approved';
  end if;
  if new.status is distinct from old.status then new.decided_at := now(); end if;
  return new;
end $$;

-- ---------- Music playlist (har user ki apni) ----------
create table if not exists public.music_tracks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 200),
  url         text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists music_user_idx on public.music_tracks(user_id, position);
alter table public.music_tracks enable row level security;
drop policy if exists music_own on public.music_tracks;
create policy music_own on public.music_tracks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Videos: ab script ka link + thumbnail bhi video ke andar ----------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'videos' and column_name = 'day') then
    alter table public.videos add column day date;
    update public.videos set day = (created_at at time zone public.app_tz())::date;
    alter table public.videos alter column day set default public.app_today();
    alter table public.videos alter column day set not null;
  end if;
end $$;
alter table public.videos add column if not exists script_url text not null default '';
alter table public.videos add column if not exists thumbnail_url text not null default '';
alter table public.videos add column if not exists thumbnail_delete_url text not null default '';
alter table public.videos add column if not exists task_id uuid references public.tasks(id) on delete set null;
alter table public.videos add column if not exists from_attachment uuid unique;
alter table public.videos drop constraint if exists videos_links_check;
alter table public.videos add constraint videos_links_check check (
  (script_url = '' or script_url ~* '^https?://') and (thumbnail_url = '' or thumbnail_url ~* '^https://')
  and char_length(script_url) <= 2000 and char_length(thumbnail_url) <= 2000 and char_length(script) <= 100000
);
create index if not exists videos_day_idx on public.videos(channel_id, day);

create or replace function public.stamp_video() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.title := btrim(new.title);
  -- database ke andar ka kaam (migration) jaisa hai waisa
  if auth.uid() is null or current_setting('khr.migrating', true) = '1' then return new; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.day := public.app_today();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.channel_id := old.channel_id;
    new.day := old.day;
    new.from_attachment := old.from_attachment;
  end if;
  if new.task_id is not null and not exists (select 1 from public.tasks t where t.id = new.task_id and t.channel_id = new.channel_id) then
    new.task_id := null;
  end if;
  return new;
end $$;

-- purani scripts / thumbnails (attachments) videos mein (sirf ek dafa, kuch delete nahi hota)
do $$
begin
  perform set_config('khr.migrating', '1', true);
  insert into public.videos (channel_id, title, stage, script, script_url, thumbnail_url, thumbnail_delete_url, day, task_id, from_attachment, created_by, updated_by, created_at, updated_at)
  select a.channel_id, a.title,
         case when a.kind = 'script' then 'script' else 'design' end,
         case when a.kind = 'script' then a.body else '' end,
         case when a.kind = 'script' then a.url else '' end,
         case when a.kind = 'thumbnail' then a.url else '' end,
         case when a.kind = 'thumbnail' then a.delete_url else '' end,
         a.day, a.task_id, a.id, a.created_by, a.created_by, a.created_at, a.created_at
  from public.attachments a
  where not exists (select 1 from public.videos v where v.from_attachment = a.id)
    and (a.kind <> 'thumbnail' or a.url ~* '^https://');
  perform set_config('khr.migrating', '', true);
end $$;

-- nayi video / thumbnail lagne par push notification (purane attachments wala band)
drop trigger if exists push_attachment on public.attachments;
create or replace function public.khr_ev_video() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if auth.uid() is null or current_setting('khr.migrating', true) = '1' then return null; end if;
  select name into v_name from public.channels where id = new.channel_id;
  if tg_op = 'INSERT' then
    perform public.khr_notify(public.khr_channel_people(new.channel_id), new.created_by,
      coalesce(v_name, 'Channel') || ': nayi video 🎬', new.title || ' · ' || public.khr_name(new.created_by),
      jsonb_build_object('type', 'file', 'channel', new.channel_id));
  elsif new.thumbnail_url <> '' and new.thumbnail_url is distinct from old.thumbnail_url then
    perform public.khr_notify(public.khr_channel_people(new.channel_id), auth.uid(),
      coalesce(v_name, 'Channel') || ': thumbnail lag gaya 🖼', new.title || ' · ' || public.khr_name(auth.uid()),
      jsonb_build_object('type', 'file', 'channel', new.channel_id));
  elsif (new.script_url <> '' and new.script_url is distinct from old.script_url) then
    perform public.khr_notify(public.khr_channel_people(new.channel_id), auth.uid(),
      coalesce(v_name, 'Channel') || ': script lag gayi 📄', new.title || ' · ' || public.khr_name(auth.uid()),
      jsonb_build_object('type', 'file', 'channel', new.channel_id));
  end if;
  return null;
end $$;
drop trigger if exists push_video on public.videos;
create trigger push_video after insert or update of thumbnail_url, script_url on public.videos for each row execute function public.khr_ev_video();

-- ---------- Tasks: custom kaam, kai din ki deadline, extension ----------
alter table public.tasks add column if not exists kind text not null default 'daily';
alter table public.tasks add column if not exists title text not null default '';
alter table public.tasks add column if not exists extended_minutes int not null default 0;
alter table public.tasks add column if not exists assigned_by uuid references public.profiles(id) on delete set null;
alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('daily', 'custom') and char_length(title) <= 200);
-- roz wale tasks har din ek; custom kaam jitne chahein
alter table public.tasks drop constraint if exists tasks_channel_id_user_id_role_day_key;
create unique index if not exists tasks_daily_uniq on public.tasks(channel_id, user_id, role, day) where kind = 'daily';

-- role ka waqt: "days" = deadline kitne din baad (0 = usi din). Misal {"Editor": {"start":"10:00","end":"18:00","days":3}}
create or replace function public.role_window(p_role_times jsonb, p_from time, p_to time, p_role text, d date,
  out start_at timestamptz, out due_at timestamptz)
language plpgsql stable as $$
declare
  tz text := public.app_tz();
  st time := coalesce(nullif(p_role_times -> p_role ->> 'start', '')::time, p_from, time '00:00');
  en time := coalesce(nullif(p_role_times -> p_role ->> 'end', '')::time, p_to, time '23:59:59');
  extra int := greatest(0, least(30, coalesce(nullif(p_role_times -> p_role ->> 'days', '')::int, 0)));
begin
  start_at := ((d + st)::timestamp at time zone tz);
  due_at := (((d + (case when en <= st and extra = 0 then 1 else 0 end) + extra) + en)::timestamp at time zone tz);
end $$;

create or replace function public.ensure_tasks_for(d date) returns void
language plpgsql security definer set search_path = public as $$
declare tz text := public.app_tz();
begin
  insert into public.tasks (channel_id, user_id, role, day, start_at, due_at)
  select c.id, m.user_id, r.role, d, w.start_at, w.due_at
  from public.channels c
  join public.channel_members m on m.channel_id = c.id
  join public.profiles p on p.id = m.user_id and (p.status = 'approved' or p.is_owner)
  cross join lateral unnest(m.roles) as r(role)
  cross join lateral public.role_window(c.role_times, c.time_from, c.time_to, r.role, d) w
  where (c.schedule_type = 'daily' or extract(dow from d)::smallint = any(c.work_days))
    and d >= (c.created_at at time zone tz)::date
    and d >= (m.added_at at time zone tz)::date
  on conflict (channel_id, user_id, role, day) where kind = 'daily' do nothing;

  if d = public.app_today() then
    delete from public.tasks t
    where t.day = d and t.kind = 'daily' and t.status = 'pending' and not exists (
      select 1 from public.channels c
      join public.channel_members m on m.channel_id = c.id and m.user_id = t.user_id
      join public.profiles p on p.id = m.user_id and (p.status = 'approved' or p.is_owner)
      where c.id = t.channel_id and t.role = any(m.roles)
        and (c.schedule_type = 'daily' or extract(dow from d)::smallint = any(c.work_days))
    );
    -- aaj role ka waqt badla ho to pending tasks ka start/deadline update (manzoor shuda extension saath)
    update public.tasks t
       set start_at = (public.role_window(c.role_times, c.time_from, c.time_to, t.role, d)).start_at,
           due_at   = (public.role_window(c.role_times, c.time_from, c.time_to, t.role, d)).due_at + make_interval(mins => t.extended_minutes)
      from public.channels c
     where c.id = t.channel_id and t.day = d and t.kind = 'daily' and t.status = 'pending';
  end if;
end $$;

-- Owner kisi ko khaas kaam de: kis date/waqt se kis date/waqt tak (misal 3 din)
create or replace function public.assign_task(p_channel uuid, p_user uuid, p_role text, p_title text, p_start timestamptz, p_due timestamptz)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  if not public.is_owner() then raise exception 'Sirf owner kaam assign kar sakta hai.'; end if;
  if p_due <= p_start then raise exception 'Deadline start ke baad honi chahiye.'; end if;
  if p_due - p_start > interval '60 days' then raise exception 'Deadline 60 din se zyada nahi ho sakti.'; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 2 then raise exception 'Kaam ka title likhein.'; end if;
  if not exists (select 1 from public.profiles where id = p_user and (status = 'approved' or is_owner)) then raise exception 'Ye member approved nahi.'; end if;
  if not exists (select 1 from public.channels where id = p_channel) then raise exception 'Channel nahi mila.'; end if;
  insert into public.tasks (channel_id, user_id, role, day, start_at, due_at, kind, title, assigned_by)
  values (p_channel, p_user, left(btrim(p_role), 60), (p_start at time zone public.app_tz())::date, p_start, p_due, 'custom', left(btrim(p_title), 200), auth.uid())
  returning * into t;
  perform public.khr_notify(array[p_user], auth.uid(), '📌 Naya kaam assign hua',
    t.title || ' · ' || coalesce((select name from public.channels where id = p_channel), '') || ' · deadline ' || to_char(p_due at time zone public.app_tz(), 'DD Mon HH12:MI AM'),
    jsonb_build_object('type', 'assign', 'channel', p_channel));
  return t;
end $$;
grant execute on function public.assign_task(uuid, uuid, text, text, timestamptz, timestamptz) to authenticated;

-- ---------- Deadline extension ----------
create table if not exists public.deadline_requests (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  minutes     int not null check (minutes between 5 and 10080),
  reason      text not null check (char_length(btrim(reason)) between 2 and 300),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles(id) on delete set null
);
create unique index if not exists deadline_req_one_pending on public.deadline_requests(task_id) where status = 'pending';
alter table public.deadline_requests enable row level security;
drop policy if exists dreq_select on public.deadline_requests;
create policy dreq_select on public.deadline_requests for select to authenticated using (user_id = auth.uid() or public.is_owner());

create or replace function public.request_extension(p_task uuid, p_minutes int, p_reason text)
returns public.deadline_requests language plpgsql security definer set search_path = public as $$
declare t public.tasks; r public.deadline_requests;
begin
  select * into t from public.tasks where id = p_task;
  if t.id is null or t.user_id <> auth.uid() then raise exception 'Sirf apne task ke liye extension maang sakte hain.'; end if;
  if t.status <> 'pending' then raise exception 'Ye task pending nahi.'; end if;
  if t.due_at - now() > interval '30 minutes' then raise exception 'Extension deadline se 30 minute pehle ya deadline guzarne ke baad maang sakte hain.'; end if;
  if t.due_at < now() - interval '7 days' then raise exception 'Ye task bahut purana hai.'; end if;
  if exists (select 1 from public.deadline_requests where task_id = p_task and status = 'pending') then raise exception 'Is task ki request pehle se owner ke paas hai.'; end if;
  insert into public.deadline_requests (task_id, user_id, minutes, reason) values (p_task, auth.uid(), p_minutes, btrim(p_reason)) returning * into r;
  perform public.khr_notify((select coalesce(array_agg(id), '{}') from public.profiles where is_owner), auth.uid(), '⏳ Deadline extension request',
    public.khr_name(auth.uid()) || ' · ' || coalesce((select name from public.channels where id = t.channel_id), '') || ' · +' || p_minutes || ' min: ' || btrim(p_reason),
    jsonb_build_object('type', 'task', 'channel', t.channel_id));
  return r;
end $$;

create or replace function public.review_extension(p_id uuid, p_approve boolean)
returns public.deadline_requests language plpgsql security definer set search_path = public as $$
declare r public.deadline_requests; t public.tasks; base timestamptz; add_min int;
begin
  if not public.is_owner() then raise exception 'Sirf owner extension approve kar sakta hai.'; end if;
  select * into r from public.deadline_requests where id = p_id for update;
  if r.id is null or r.status <> 'pending' then raise exception 'Ye request ab pending nahi.'; end if;
  select * into t from public.tasks where id = r.task_id for update;
  if p_approve and t.status <> 'rejected' then
    -- deadline guzar chuki ho to waqt request ke waqt se gina jata hai
    base := greatest(t.due_at, r.created_at);
    add_min := r.minutes + greatest(0, ceil(extract(epoch from (base - t.due_at)) / 60.0))::int;
    update public.tasks
       set due_at = due_at + make_interval(mins => add_min),
           extended_minutes = extended_minutes + add_min,
           push_sent = push_sent & 1
     where id = t.id;
  end if;
  update public.deadline_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid()
   where id = p_id returning * into r;
  perform public.khr_notify(array[r.user_id], auth.uid(),
    case when p_approve then '✅ Deadline barh gayi' else '✕ Extension reject' end,
    coalesce((select name from public.channels where id = t.channel_id), '') || ' · ' || t.role || case when p_approve then ' · +' || r.minutes || ' min' else '' end,
    jsonb_build_object('type', 'task', 'channel', t.channel_id));
  return r;
end $$;
grant execute on function public.request_extension(uuid, int, text) to authenticated;
grant execute on function public.review_extension(uuid, boolean) to authenticated;

-- ---------- Chat: edit, pin, forward ----------
alter table public.server_messages add column if not exists edited_at timestamptz;
alter table public.server_messages add column if not exists pinned_at timestamptz;
alter table public.server_messages add column if not exists pinned_by uuid references public.profiles(id) on delete set null;
alter table public.server_messages add column if not exists fwd_from uuid references public.profiles(id) on delete set null;
alter table public.direct_messages add column if not exists edited_at timestamptz;
alter table public.direct_messages add column if not exists pinned_at timestamptz;
alter table public.direct_messages add column if not exists pinned_by uuid references public.profiles(id) on delete set null;
alter table public.direct_messages add column if not exists fwd_from uuid references public.profiles(id) on delete set null;

create or replace function public.edit_chat_message(p_kind text, p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if char_length(coalesce(p_body, '')) > 4000 then raise exception 'Message bahut lamba hai.'; end if;
  if p_kind = 'srv' then
    update public.server_messages set body = btrim(p_body), edited_at = now()
     where id = p_id and user_id = auth.uid() and (btrim(p_body) <> '' or image_url <> '');
  else
    update public.direct_messages set body = btrim(p_body), edited_at = now()
     where id = p_id and from_user = auth.uid() and (btrim(p_body) <> '' or image_url <> '');
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Sirf apna message edit kar sakte hain.'; end if;
end $$;

create or replace function public.pin_chat_message(p_kind text, p_id uuid, p_pin boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_kind = 'srv' then
    update public.server_messages m set pinned_at = case when p_pin then now() end, pinned_by = case when p_pin then auth.uid() end
     where m.id = p_id and public.can_see_server_channel(m.channel_id)
       and (public.is_owner() or not exists (select 1 from public.server_channels c where c.id = m.channel_id and c.read_only));
  else
    update public.direct_messages set pinned_at = case when p_pin then now() end, pinned_by = case when p_pin then auth.uid() end
     where id = p_id and (from_user = auth.uid() or to_user = auth.uid());
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ye message pin nahi ho sakta.'; end if;
end $$;
grant execute on function public.edit_chat_message(text, uuid, text) to authenticated;
grant execute on function public.pin_chat_message(text, uuid, boolean) to authenticated;

-- ---------- Video file (Gofile.io / Drive / YouTube link) ----------
alter table public.videos add column if not exists video_url text not null default '';
alter table public.videos drop constraint if exists videos_video_url_check;
alter table public.videos add constraint videos_video_url_check check (video_url = '' or (video_url ~* '^https://' and char_length(video_url) <= 2000));
-- banane wala apni video khud delete kar sake (owner sab)
drop policy if exists videos_delete on public.videos;
create policy videos_delete on public.videos for delete to authenticated
  using (public.is_owner() or (created_by = auth.uid() and public.is_member(channel_id)));

create or replace function public.khr_ev_video() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if auth.uid() is null or current_setting('khr.migrating', true) = '1' then return null; end if;
  select name into v_name from public.channels where id = new.channel_id;
  if tg_op = 'INSERT' then
    perform public.khr_notify(public.khr_channel_people(new.channel_id), new.created_by,
      coalesce(v_name, 'Channel') || ': nayi video 🎬', new.title || ' · ' || public.khr_name(new.created_by),
      jsonb_build_object('type', 'file', 'channel', new.channel_id));
  elsif new.video_url <> '' and new.video_url is distinct from old.video_url then
    perform public.khr_notify(public.khr_channel_people(new.channel_id), auth.uid(),
      coalesce(v_name, 'Channel') || ': video upload ho gayi 🎬', new.title || ' · ' || public.khr_name(auth.uid()),
      jsonb_build_object('type', 'file', 'channel', new.channel_id));
  elsif new.thumbnail_url <> '' and new.thumbnail_url is distinct from old.thumbnail_url then
    perform public.khr_notify(public.khr_channel_people(new.channel_id), auth.uid(),
      coalesce(v_name, 'Channel') || ': thumbnail lag gaya 🖼', new.title || ' · ' || public.khr_name(auth.uid()),
      jsonb_build_object('type', 'file', 'channel', new.channel_id));
  elsif (new.script_url <> '' and new.script_url is distinct from old.script_url) then
    perform public.khr_notify(public.khr_channel_people(new.channel_id), auth.uid(),
      coalesce(v_name, 'Channel') || ': script lag gayi 📄', new.title || ' · ' || public.khr_name(auth.uid()),
      jsonb_build_object('type', 'file', 'channel', new.channel_id));
  end if;
  return null;
end $$;
drop trigger if exists push_video on public.videos;
create trigger push_video after insert or update of thumbnail_url, script_url, video_url on public.videos for each row execute function public.khr_ev_video();

-- ---------- v11: video banane / badalne wale ka naam video ke saath (banda team se nikal bhi jaye to naam rahe) ----------
alter table public.videos add column if not exists created_by_name text not null default '';
alter table public.videos add column if not exists updated_by_name text not null default '';
create or replace function public.stamp_video_names() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.created_by is distinct from old.created_by or coalesce(new.created_by_name, '') = '' then
    new.created_by_name := coalesce((select nullif(btrim(full_name), '') from public.profiles where id = new.created_by), coalesce(new.created_by_name, ''));
  elsif tg_op = 'UPDATE' then
    new.created_by_name := old.created_by_name;   -- app se badla nahi ja sakta
  end if;
  new.updated_by_name := coalesce((select nullif(btrim(full_name), '') from public.profiles where id = new.updated_by), coalesce(new.updated_by_name, ''));
  return new;
end $$;
drop trigger if exists videos_names on public.videos;
-- "z" naam: purane stamp trigger ke BAAD chale (created_by / updated_by pehle lag chuke hon)
drop trigger if exists videos_zz_names on public.videos;
create trigger videos_zz_names before insert or update on public.videos for each row execute function public.stamp_video_names();
-- purani videos mein naam bhar do (ek dafa)
update public.videos v set created_by_name = coalesce(p.full_name, '')
  from public.profiles p where p.id = v.created_by and v.created_by_name = '';

-- ============================================================
-- v13: KAAM ATTACH KAR KE HI COMPLETE (tick khatam)
--   Script Writer = script (link / likhi hui), Editor = video, Graphic Designer = thumbnail,
--   Voice Over = voiceover, Manager = title, Publisher = YouTube link.
--   Kaam ek EP (video card) mein lagta hai, wahi card channel mein nazar aata hai.
-- ============================================================
alter table public.videos add column if not exists voiceover_url text not null default '';
alter table public.videos add column if not exists youtube_url text not null default '';
alter table public.videos drop constraint if exists videos_v13_links_check;
alter table public.videos add constraint videos_v13_links_check check (
  (voiceover_url = '' or (voiceover_url ~* '^https://' and char_length(voiceover_url) <= 2000))
  and (youtube_url = '' or (youtube_url ~* '^https://' and char_length(youtube_url) <= 2000))
);
alter table public.tasks add column if not exists video_id uuid references public.videos(id) on delete set null;

-- kis role ka kaam kis cheez se poora hota hai
create or replace function public.role_needs_work(p_role text) returns boolean
language sql immutable as $$
  select p_role in ('Script Writer', 'Editor', 'Graphic Designer', 'Voice Over', 'Manager', 'Publisher')
$$;
create or replace function public.role_work_done(p_role text, v public.videos) returns boolean
language sql stable as $$
  select case p_role
    when 'Script Writer' then v.script_url <> '' or btrim(v.script) <> ''
    when 'Editor' then v.video_url <> ''
    when 'Graphic Designer' then v.thumbnail_url <> ''
    when 'Voice Over' then v.voiceover_url <> ''
    when 'Manager' then btrim(v.title) <> ''
    when 'Publisher' then v.youtube_url <> ''
    else true end
$$;

-- tick: in roles ke member khud tick nahi kar sakte (owner phir bhi kar sakta hai)
create or replace function public.set_task_done(p_task uuid, p_done boolean) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  if p_done and exists (select 1 from public.tasks where id = p_task and start_at is not null and start_at > now()) then
    raise exception 'Is task ka waqt abhi shuru nahi hua. Start time ke baad tick karein.';
  end if;
  if p_done and not public.is_owner() and exists (
    select 1 from public.tasks where id = p_task and kind = 'daily' and public.role_needs_work(role)
  ) then
    raise exception 'Is role ka kaam attach kar ke hi complete hota hai (script / video / thumbnail / voiceover / title / YouTube link).';
  end if;
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

-- kaam attach hua: EP (video) check kar ke task mukammal
create or replace function public.submit_task_work(p_task uuid, p_video uuid) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks; v public.videos;
begin
  select * into t from public.tasks where id = p_task;
  if t.id is null or (t.user_id <> auth.uid() and not public.is_owner()) or not public.is_approved() then
    raise exception 'Ye task aap ka nahi.';
  end if;
  if t.status = 'rejected' then raise exception 'Owner ne ye task reject kiya hua hai.'; end if;
  if t.start_at is not null and t.start_at > now() then raise exception 'Is task ka waqt abhi shuru nahi hua.'; end if;
  select * into v from public.videos where id = p_video;
  if v.id is null or v.channel_id <> t.channel_id then raise exception 'Ye EP is channel ka nahi.'; end if;
  if not public.role_work_done(t.role, v) then
    raise exception 'Pehle % ka kaam is EP mein lagayein.', t.role;
  end if;
  update public.tasks set status = 'done', completed_at = coalesce(completed_at, now()), video_id = p_video
   where id = p_task returning * into t;
  return t;
end $$;
grant execute on function public.submit_task_work(uuid, uuid) to authenticated;

-- ---------- Music: apni playlists (Naat, Qawwali, Sad…) ----------
create table if not exists public.music_playlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.music_playlists enable row level security;
drop policy if exists mpl_own on public.music_playlists;
create policy mpl_own on public.music_playlists for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.music_playlist_items (
  playlist_id uuid not null references public.music_playlists(id) on delete cascade,
  track_id    uuid not null references public.music_tracks(id) on delete cascade,
  position    int not null default 0,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, track_id)
);
alter table public.music_playlist_items enable row level security;
drop policy if exists mpi_own on public.music_playlist_items;
create policy mpi_own on public.music_playlist_items for all to authenticated
  using (exists (select 1 from public.music_playlists p where p.id = playlist_id and p.user_id = auth.uid()))
  with check (
    exists (select 1 from public.music_playlists p where p.id = playlist_id and p.user_id = auth.uid())
    and exists (select 1 from public.music_tracks m where m.id = track_id and m.user_id = auth.uid())
  );

do $$
declare t text;
begin
  foreach t in array array['music_playlists', 'music_playlist_items'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- realtime: naye tables
do $$
declare t text;
begin
  foreach t in array array['deadline_requests', 'music_tracks'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when others then null;
    end;
  end loop;
end $$;
