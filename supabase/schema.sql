create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  slug text not null unique,
  profile_type text not null default 'personal' check (profile_type in ('personal', 'business')),
  headline text not null default '',
  company text not null default '',
  bio text not null default '',
  phone text not null default '',
  public_email text not null default '',
  website text not null default '',
  location text not null default '',
  photo_path text,
  social_links jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (setting_key, setting_value)
values ('app_name', 'TapLink')
on conflict (setting_key) do nothing;

create or replace function public.create_taplink_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text;
begin
  clean_name := trim(both '-' from regexp_replace(lower(coalesce(new.raw_user_meta_data ->> 'name', 'member')), '[^a-z0-9]+', '-', 'g'));
  if clean_name = '' then
    clean_name := 'member';
  end if;

  insert into public.profiles (user_id, name, slug)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 120), left(clean_name, 7) || '-' || replace(new.id::text, '-', ''));
  return new;
end;
$$;

drop trigger if exists on_taplink_user_created on auth.users;
create trigger on_taplink_user_created
after insert on auth.users
for each row execute function public.create_taplink_profile();

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.app_settings from anon, authenticated;

drop policy if exists "Users read own or published profiles" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
on public.profiles for select
using (auth.uid() = user_id);

drop policy if exists "Anyone reads app name" on public.app_settings;
create policy "Anyone reads app name"
on public.app_settings for select
using (setting_key = 'app_name');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
