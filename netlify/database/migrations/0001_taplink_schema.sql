create table if not exists profiles (
  user_id text primary key,
  email text not null default '',
  name varchar(120) not null default '',
  slug varchar(40) not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  is_active boolean not null default true,
  profile_type text not null default 'personal' check (profile_type in ('personal', 'business')),
  headline varchar(120) not null default '',
  company varchar(120) not null default '',
  bio varchar(600) not null default '',
  phone varchar(40) not null default '',
  public_email varchar(254) not null default '',
  website varchar(500) not null default '',
  location varchar(300) not null default '',
  photo_path text,
  social_links jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_published_slug_idx
  on profiles (slug)
  where is_published and is_active;

create table if not exists app_settings (
  setting_key varchar(80) primary key,
  setting_value varchar(500) not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (setting_key, setting_value)
values ('app_name', 'TapLink')
on conflict (setting_key) do nothing;
