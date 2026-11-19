-- ============================================================
--  Carte de Noël — base de données Supabase
--  À coller tel quel dans Supabase : SQL Editor → New query → Run.
--  Le script peut être relancé sans risque (il ne supprime rien).
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tables ----------

-- Cartes créées sur le site
create table if not exists public.cards (
  id             text primary key,
  created_at     timestamptz not null default now(),
  recipient      text not null default '' check (char_length(recipient) <= 40),
  message        text not null check (char_length(message) between 1 and 500),
  sender         text not null default '' check (char_length(sender) <= 40),
  theme          text not null default 'nuit',
  decor          text not null default 'sapin',
  photo_path     text check (photo_path is null or photo_path ~ '^[A-Za-z0-9_-]{8,64}\.jpg$'),
  opens          integer not null default 0,
  last_opened_at timestamptz
);

-- Journal des visites et actions (visite du site, carte créée, vue, ouverte)
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  type       text not null check (type in ('visit', 'create', 'view', 'open')),
  card_id    text references public.cards(id) on delete cascade,
  visitor_id text check (char_length(visitor_id) <= 64),
  page       text check (char_length(page) <= 40),
  referrer   text check (char_length(referrer) <= 300),
  user_agent text check (char_length(user_agent) <= 400),
  lang       text check (char_length(lang) <= 20),
  screen     text check (char_length(screen) <= 20)
);
create index if not exists events_created_at_idx on public.events (created_at desc);
create index if not exists events_card_idx on public.events (card_id);

-- Comptes autorisés à voir le tableau de bord (page admin.html)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Sécurité ----------
-- Le site public ne peut PAS lire les tables directement : il passe
-- uniquement par les fonctions ci-dessous. Seuls les admins lisent tout.

alter table public.cards  enable row level security;
alter table public.events enable row level security;
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

drop policy if exists "admin lit les cartes" on public.cards;
create policy "admin lit les cartes" on public.cards
  for select to authenticated using (public.is_admin());

drop policy if exists "admin supprime les cartes" on public.cards;
create policy "admin supprime les cartes" on public.cards
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin lit les evenements" on public.events;
create policy "admin lit les evenements" on public.events
  for select to authenticated using (public.is_admin());

drop policy if exists "admin se voit" on public.admins;
create policy "admin se voit" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------- Fonctions appelées par le site ----------

-- Crée une carte et renvoie son identifiant court (utilisé dans le lien)
create or replace function public.create_card(
  p_recipient text, p_message text, p_sender text,
  p_theme text, p_decor text, p_photo_path text default null,
  p_visitor_id text default null
)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  new_id text;
begin
  if coalesce(btrim(p_message), '') = '' then
    raise exception 'message vide';
  end if;
  loop
    new_id := translate(encode(gen_random_bytes(9), 'base64'), '+/', '-_');
    exit when not exists (select 1 from public.cards where id = new_id);
  end loop;
  insert into public.cards (id, recipient, message, sender, theme, decor, photo_path)
  values (
    new_id,
    left(coalesce(btrim(p_recipient), ''), 40),
    left(p_message, 500),
    left(coalesce(btrim(p_sender), ''), 40),
    case when p_theme in ('nuit', 'rouge', 'foret', 'givre') then p_theme else 'nuit' end,
    case when p_decor in ('sapin', 'etoile', 'flocon', 'cadeau', 'bougie') then p_decor else 'sapin' end,
    nullif(p_photo_path, '')
  );
  insert into public.events (type, card_id, visitor_id)
  values ('create', new_id, left(p_visitor_id, 64));
  return new_id;
end;
$$;

-- Lit une carte à partir de son identifiant (sans pouvoir lister les autres)
create or replace function public.get_card(p_id text)
returns table (
  id text, recipient text, message text, sender text,
  theme text, decor text, photo_path text, created_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select c.id, c.recipient, c.message, c.sender, c.theme, c.decor, c.photo_path, c.created_at
  from public.cards c
  where c.id = p_id;
$$;

-- Enregistre une visite / une vue / une ouverture de carte
create or replace function public.log_event(
  p_type text, p_card_id text default null, p_visitor_id text default null,
  p_page text default null, p_referrer text default null, p_user_agent text default null,
  p_lang text default null, p_screen text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_card text := null;
begin
  if p_type not in ('visit', 'view', 'open') then
    return;
  end if;
  if p_card_id is not null and exists (select 1 from public.cards where id = p_card_id) then
    v_card := p_card_id;
  end if;
  insert into public.events (type, card_id, visitor_id, page, referrer, user_agent, lang, screen)
  values (p_type, v_card, left(p_visitor_id, 64), left(p_page, 40), left(p_referrer, 300),
          left(p_user_agent, 400), left(p_lang, 20), left(p_screen, 20));
  if p_type = 'open' and v_card is not null then
    update public.cards set opens = opens + 1, last_opened_at = now() where id = v_card;
  end if;
end;
$$;

revoke all on function public.create_card(text, text, text, text, text, text, text) from public;
revoke all on function public.get_card(text) from public;
revoke all on function public.log_event(text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_card(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_card(text) to anon, authenticated;
grant execute on function public.log_event(text, text, text, text, text, text, text, text) to anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- Photos ----------
-- Dossier public « photos » : lisible par lien, ajout possible depuis le site,
-- 3 Mo maximum, images uniquement. Personne ne peut lister ni modifier les photos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

drop policy if exists "site ajoute des photos" on storage.objects;
create policy "site ajoute des photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'photos' and name ~ '^[A-Za-z0-9_-]{8,64}\.jpg$');

drop policy if exists "admin lit les photos" on storage.objects;
create policy "admin lit les photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_admin());

drop policy if exists "admin supprime les photos" on storage.objects;
create policy "admin supprime les photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());
