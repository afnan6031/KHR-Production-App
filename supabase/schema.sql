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
