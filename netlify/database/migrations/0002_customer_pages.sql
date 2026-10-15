create table if not exists customer_pages (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  slug varchar(40) not null unique,
  profile_type text not null default 'personal' check (profile_type in ('personal', 'business')),
  headline varchar(120) not null default '',
  company varchar(120) not null default '',
  bio varchar(600) not null default '',
  phone varchar(40) not null default '',
  public_email varchar(254) not null default '',
  website varchar(500) not null default '',
  location varchar(300) not null default '',
  photo_url varchar(1000) not null default '',
  social_links jsonb not null default '{}'::jsonb,
  template text not null default 'studio'
    check (template in ('studio', 'noir', 'editorial', 'orbit', 'garden', 'card')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_pages_published_slug_idx
  on customer_pages (slug)
  where is_published;
