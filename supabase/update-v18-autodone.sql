-- ============================================================
-- v18: TASK AUTO-COMPLETE (channel card se video mein kaam lagte hi task done)
--
-- Pehle: Editor / Graphic Designer / Script Writer… channel ke "Nai video" mein seedha kaam laga dete the,
--        magar Aaj wale section mein task pending hi rehta tha aur "Complete" khud dabana parta tha.
-- Ab:    EP (video) mein role ka kaam lagte hi (script / video / thumbnail / voiceover / title / YouTube / Facebook link)
--        us EP ke din ke us role ke pending tasks khud "done" ho jate hain.
--        Jo EP pehle se advance mein bana tha, uska task jis din banega usi waqt done ho jayega.
--
-- Supabase > SQL Editor mein ye poori file ek baar Run karein (dobara chalana safe hai).
-- ============================================================

-- Kisi (channel, EP-din) ke pending tasks jin ka kaam EP mein lag chuka ho, unhein done kar do.
-- p_channel / p_day null ho to sab par lagta hai.
create or replace function public.khr_auto_done(p_channel uuid default null, p_day date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with hit as (
    select distinct on (t.id) t.id as task_id, v.id as video_id
      from public.tasks t
      join public.videos v on v.channel_id = t.channel_id and v.day = coalesce(t.for_day, t.day)
     where t.kind = 'daily'
       and t.status = 'pending'
       and public.role_needs_work(t.role)
       and public.role_work_done(t.role, v)
       and (p_channel is null or t.channel_id = p_channel)
       and (p_day is null or coalesce(t.for_day, t.day) = p_day)
       -- 24 ghante ki extra deadline bhi khatam ho chuki ho to task "ended" hi rahega
       and t.due_at + interval '24 hours' > now()
     order by t.id, v.created_at desc
  ), upd as (
    update public.tasks x
       set status = 'done', completed_at = coalesce(x.completed_at, now()), video_id = hit.video_id
      from hit
     where x.id = hit.task_id
    returning 1
  )
  select count(*) into n from upd;
  return n;
end $$;
revoke execute on function public.khr_auto_done(uuid, date) from public, anon, authenticated;

-- EP mein kuch bhi lage / badle -> us din ke tasks check
create or replace function public.khr_video_autodone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.khr_auto_done(new.channel_id, new.day);
  return null;
end $$;
drop trigger if exists video_autodone on public.videos;
create trigger video_autodone
  after insert or update of title, script, script_url, video_url, thumbnail_url, voiceover_url, youtube_url, facebook_url, day
  on public.videos for each row execute function public.khr_video_autodone();

-- Naya task banne par bhi check (advance mein bani video ka task us din khud done ho)
create or replace function public.ensure_tasks_upto() returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := public.app_today();
  start_day date;
  d date;
begin
  if auth.uid() is not null and not public.is_approved() then return; end if;
  -- v18: sirf aaj tak ke tasks dekho (aane wale din ke custom / Facebook tasks max(day) ko aage nahi le jayen)
  select coalesce(max(day) + 1, today) into start_day from public.tasks where day <= today;
  if start_day < today - 31 then start_day := today - 31; end if;
  d := start_day;
  while d < today loop
    perform public.ensure_tasks_for(d);
    d := d + 1;
  end loop;
  perform public.ensure_tasks_for(today);
  perform public.khr_auto_done();
end $$;
grant execute on function public.ensure_tasks_upto() to authenticated;

-- Pehle se pade hue pending tasks ko bhi ek baar sahi kar do
select public.khr_auto_done();
