-- Deny browser-level access entirely. The Edge Function performs authentication
-- and uses the server-only secret key. No public SELECT/INSERT policies exist.
create extension if not exists pgcrypto with schema extensions;
create table public.administrators (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.events (
 id uuid primary key default gen_random_uuid(),
 owner uuid not null references public.administrators(user_id),
 title text not null default 'Our team session',
 invite_hash text not null,
 open boolean not null default true,
 expected integer not null default 8 check(expected between 1 and 64),
 retention_days integer not null default 30 check(retention_days between 1 and 90),
 created_at timestamptz not null default now(),
 unique(owner)
);
create table public.questions (
 id text primary key, group_index integer not null check(group_index between 0 and 2),
 ordinal integer unique not null, theme text not null, left_endpoint text not null, right_endpoint text not null
);
create table public.responses (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id) on delete cascade,
 receipt_hash text not null, name text not null check(length(name) between 1 and 32),
 answers jsonb not null, photo_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(event_id,receipt_hash)
);
create unique index response_name_unique on public.responses(event_id,lower(name));
create table public.rate_limits (key text primary key, hits integer not null, expires_at timestamptz not null);
create index rate_expiry on public.rate_limits(expires_at);
alter table public.administrators enable row level security;
alter table public.events enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.administrators,public.events,public.questions,public.responses,public.rate_limits from anon,authenticated;
grant all on public.administrators,public.events,public.questions,public.responses,public.rate_limits to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('portraits','portraits',false,400000,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=400000,allowed_mime_types=array['image/jpeg'];
-- A restrictive deny policy also blocks inherited permissive policies for this bucket.
create policy portraits_no_browser_access on storage.objects as restrictive
 for all to anon,authenticated
 using (bucket_id <> 'portraits') with check (bucket_id <> 'portraits');
-- Atomic, database-backed limiter, not per-instance memory.
create function public.consume_limit(k text, max_hits integer, seconds integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 delete from public.rate_limits where expires_at<now();
 insert into public.rate_limits(key,hits,expires_at) values(k,1,now()+make_interval(secs=>seconds))
 on conflict(key) do update set hits=case when rate_limits.expires_at<now() then 1 else rate_limits.hits+1 end,
 expires_at=case when rate_limits.expires_at<now() then now()+make_interval(secs=>seconds) else rate_limits.expires_at end returning hits into n;
 return n<=max_hits;
end $$;
-- Serializes submission with closing/deletion and duplicate checks; rechecks expiry
-- and invitation even when the handler already checked them before uploading.
create function public.save_response(eid uuid, invitation text, receipt text, display_name text, values_json jsonb, portrait text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ev public.events; old public.responses; n integer; v jsonb; k text; saved uuid;
begin
 select * into ev from public.events where id=eid for update;
 if ev.id is null or ev.invite_hash<>invitation then raise exception 'Invalid invitation'; end if;
 if not ev.open or now()>=ev.created_at+make_interval(days=>ev.retention_days) then raise exception 'Survey is closed or expired'; end if;
 if jsonb_typeof(values_json)<>'object' then raise exception 'Invalid answers'; end if;
 select count(*) into n from jsonb_object_keys(values_json);
 if n<>12 then raise exception 'Twelve answers required'; end if;
 for n in 1..12 loop
  k:='q'||n;v:=values_json->k;
  if v is null or jsonb_typeof(v)<>'number' or (v::text)::numeric<>trunc((v::text)::numeric) or (v::text)::numeric<0 or (v::text)::numeric>24 then raise exception 'Invalid answer'; end if;
 end loop;
 if length(trim(display_name))<1 or length(display_name)>32 then raise exception 'Invalid display name'; end if;
 select * into old from public.responses where event_id=eid and receipt_hash=receipt;
 if old.id is null and (select count(*) from public.responses where event_id=eid)>=64 then raise exception 'Session is full'; end if;
 insert into public.responses(event_id,receipt_hash,name,answers,photo_path) values(eid,receipt,trim(display_name),values_json,portrait)
 on conflict(event_id,receipt_hash) do update set name=excluded.name,answers=excluded.answers,photo_path=excluded.photo_path,updated_at=now()
 returning id into saved;
 return jsonb_build_object('id',saved,'old_photo',old.photo_path);
end $$;
revoke all on function public.consume_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.save_response(uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.consume_limit(text,integer,integer),public.save_response(uuid,text,text,text,jsonb,text) to service_role;

insert into public.questions(id,group_index,ordinal,theme,left_endpoint,right_endpoint) values
('q1',0,1,'Curiosity','I love becoming an expert in one subject','I love knowing a little about lots of things'),
('q2',0,2,'Developing ideas','I think best by talking things through','I prefer to think before sharing ideas'),
('q3',0,3,'Decision-making','I like to gather as much information as possible before deciding','I''m comfortable making a decision with the information available'),
('q4',0,4,'Constructive challenge','I enjoy debating ideas in the moment','I prefer to reflect and offer considered challenge'),
('q5',1,5,'Perfect weekend','A packed diary, people to see and places to go','Absolutely no plans, and that''s how I like it'),
('q6',1,6,'Interacting with colleagues','A good one-to-one conversation','The energy of a lively group discussion'),
('q7',1,7,'Communication','Just give me a quick call or Teams chat','Send me a message I can respond to later'),
('q8',1,8,'Receiving feedback','Tell me straight away, even if I haven''t asked','I prefer considered feedback at an agreed time'),
('q9',2,9,'Holiday planning','Every day planned, itinerary ready','Book the flights and work it out when I arrive'),
('q10',2,10,'Planning at work','Give me a plan and clear milestones','Let''s get started and adapt as we go'),
('q11',2,11,'Collaboration','Let''s start with a blank page together','Let''s start with a draft and discuss it'),
('q12',2,12,'Starting vs finishing','I get the most satisfaction from getting something started and moving','I love the final 10% — checking, refining and making everything just right');
