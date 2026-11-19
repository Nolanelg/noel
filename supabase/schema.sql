-- ============================================================
--  Carte de Noël — base de données Supabase
--  À coller tel quel dans Supabase : SQL Editor → New query → Run.
--  Le script peut être relancé sans risque (il ne supprime aucune donnée).
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
-- Ajouts : date d'ouverture, message vocal, lien de suivi privé de l'expéditeur
alter table public.cards add column if not exists unlock_at timestamptz;
alter table public.cards add column if not exists voice_path text
  check (voice_path is null or voice_path ~ '^[A-Za-z0-9_-]{8,64}\.(webm|m4a|ogg)$');
alter table public.cards add column if not exists owner_token text;
create unique index if not exists cards_owner_token_idx on public.cards (owner_token);

-- Journal des visites et actions
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  type       text not null,
  card_id    text references public.cards(id) on delete cascade,
  visitor_id text check (char_length(visitor_id) <= 64),
  page       text check (char_length(page) <= 40),
  referrer   text check (char_length(referrer) <= 300),
  user_agent text check (char_length(user_agent) <= 400),
  lang       text check (char_length(lang) <= 20),
  screen     text check (char_length(screen) <= 20)
);
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('visit', 'create', 'view', 'open', 'reply'));
create index if not exists events_created_at_idx on public.events (created_at desc);
create index if not exists events_card_idx on public.events (card_id);

-- Réponses des destinataires
create table if not exists public.replies (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  card_id    text not null references public.cards(id) on delete cascade,
  reaction   text check (reaction is null or reaction in ('❤️', '🥰', '😭', '😂', '🎄', '🙏')),
  message    text not null default '' check (char_length(message) <= 300),
  author     text not null default '' check (char_length(author) <= 40),
  visitor_id text check (char_length(visitor_id) <= 64),
  check (reaction is not null or char_length(btrim(message)) > 0)
);
create index if not exists replies_card_idx on public.replies (card_id, created_at desc);

-- Comptes autorisés à voir le tableau de bord (page admin.html)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Sécurité ----------
-- Le site public ne peut PAS lire les tables directement : il passe
-- uniquement par les fonctions ci-dessous. Seuls les admins lisent tout.

alter table public.cards   enable row level security;
alter table public.events  enable row level security;
alter table public.replies enable row level security;
alter table public.admins  enable row level security;

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

drop policy if exists "admin lit les reponses" on public.replies;
create policy "admin lit les reponses" on public.replies
  for select to authenticated using (public.is_admin());

drop policy if exists "admin supprime les reponses" on public.replies;
create policy "admin supprime les reponses" on public.replies
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin se voit" on public.admins;
create policy "admin se voit" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------- Fonctions appelées par le site ----------

-- Crée une carte. Renvoie son identifiant (pour le lien) et un jeton
-- secret qui donne accès à la page de suivi de l'expéditeur.
drop function if exists public.create_card(text, text, text, text, text, text, text);
create or replace function public.create_card(
  p_recipient text, p_message text, p_sender text,
  p_theme text, p_decor text, p_photo_path text default null,
  p_visitor_id text default null, p_unlock_at timestamptz default null,
  p_voice_path text default null
)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  new_id text;
  new_token text := translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_');
  v_unlock timestamptz := null;
begin
  if coalesce(btrim(p_message), '') = '' then
    raise exception 'message vide';
  end if;
  if p_unlock_at is not null and p_unlock_at > now() and p_unlock_at < now() + interval '400 days' then
    v_unlock := p_unlock_at;
  end if;
  loop
    new_id := translate(encode(gen_random_bytes(9), 'base64'), '+/', '-_');
    exit when not exists (select 1 from public.cards where id = new_id);
  end loop;
  insert into public.cards (id, recipient, message, sender, theme, decor, photo_path, voice_path, unlock_at, owner_token)
  values (
    new_id,
    left(coalesce(btrim(p_recipient), ''), 40),
    left(p_message, 500),
    left(coalesce(btrim(p_sender), ''), 40),
    case when p_theme in ('nuit', 'rouge', 'foret', 'givre') then p_theme else 'nuit' end,
    case when p_decor in ('sapin', 'etoile', 'flocon', 'cadeau', 'bougie') then p_decor else 'sapin' end,
    nullif(p_photo_path, ''),
    nullif(p_voice_path, ''),
    v_unlock,
    new_token
  );
  insert into public.events (type, card_id, visitor_id)
  values ('create', new_id, left(p_visitor_id, 64));
  return json_build_object('id', new_id, 'token', new_token);
end;
$$;

-- Lit une carte à partir de son identifiant (sans pouvoir lister les autres).
-- Avant sa date d'ouverture, le contenu n'est pas envoyé du tout.
drop function if exists public.get_card(text);
create or replace function public.get_card(p_id text)
returns table (
  id text, recipient text, message text, sender text,
  theme text, decor text, photo_path text, voice_path text,
  unlock_at timestamptz, locked boolean, created_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select c.id, c.recipient,
         case when l.locked then null else c.message end,
         c.sender, c.theme, c.decor,
         case when l.locked then null else c.photo_path end,
         case when l.locked then null else c.voice_path end,
         c.unlock_at, l.locked, c.created_at
  from public.cards c
  cross join lateral (select coalesce(c.unlock_at > now(), false) as locked) l
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

-- Le destinataire répond à une carte (limité pour éviter les abus)
create or replace function public.add_reply(
  p_card_id text, p_reaction text default null, p_message text default '',
  p_author text default '', p_visitor_id text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_reaction text := case when p_reaction in ('❤️', '🥰', '😭', '😂', '🎄', '🙏') then p_reaction else null end;
  v_message text := left(btrim(coalesce(p_message, '')), 300);
begin
  if not exists (select 1 from public.cards where id = p_card_id and (unlock_at is null or unlock_at <= now())) then
    raise exception 'carte introuvable';
  end if;
  if v_reaction is null and v_message = '' then
    raise exception 'reponse vide';
  end if;
  if (select count(*) from public.replies where card_id = p_card_id) >= 30
     or (p_visitor_id is not null and (select count(*) from public.replies
          where card_id = p_card_id and visitor_id = p_visitor_id) >= 5) then
    raise exception 'trop de reponses';
  end if;
  insert into public.replies (card_id, reaction, message, author, visitor_id)
  values (p_card_id, v_reaction, v_message, left(btrim(coalesce(p_author, '')), 40), left(p_visitor_id, 64));
  insert into public.events (type, card_id, visitor_id)
  values ('reply', p_card_id, left(p_visitor_id, 64));
end;
$$;

-- Page de suivi de l'expéditeur (accessible uniquement avec le jeton secret)
create or replace function public.get_followup(p_token text)
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'id', c.id, 'recipient', c.recipient, 'sender', c.sender, 'theme', c.theme,
    'created_at', c.created_at, 'opens', c.opens, 'last_opened_at', c.last_opened_at,
    'unlock_at', c.unlock_at,
    'replies', coalesce((
      select json_agg(json_build_object('reaction', r.reaction, 'message', r.message,
                                        'author', r.author, 'created_at', r.created_at)
                      order by r.created_at desc)
      from public.replies r where r.card_id = c.id), '[]'::json)
  )
  from public.cards c
  where c.owner_token = p_token and char_length(p_token) >= 20;
$$;

revoke all on function public.create_card(text, text, text, text, text, text, text, timestamptz, text) from public;
revoke all on function public.get_card(text) from public;
revoke all on function public.log_event(text, text, text, text, text, text, text, text) from public;
revoke all on function public.add_reply(text, text, text, text, text) from public;
revoke all on function public.get_followup(text) from public;
grant execute on function public.create_card(text, text, text, text, text, text, text, timestamptz, text) to anon, authenticated;
grant execute on function public.get_card(text) to anon, authenticated;
grant execute on function public.log_event(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.add_reply(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_followup(text) to anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- Photos et messages vocaux ----------
-- Dossiers publics : lisibles par lien, ajout possible depuis le site,
-- 3 Mo maximum. Personne ne peut lister ni modifier les fichiers.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voix', 'voix', true, 3145728, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/x-m4a'])
on conflict (id) do update
  set public = true, file_size_limit = 3145728,
      allowed_mime_types = array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/x-m4a'];

drop policy if exists "site ajoute des photos" on storage.objects;
create policy "site ajoute des photos" on storage.objects
  for insert to anon, authenticated
  with check (
    (bucket_id = 'photos' and name ~ '^[A-Za-z0-9_-]{8,64}\.jpg$')
    or (bucket_id = 'voix' and name ~ '^[A-Za-z0-9_-]{8,64}\.(webm|m4a|ogg)$')
  );

drop policy if exists "admin lit les photos" on storage.objects;
create policy "admin lit les photos" on storage.objects
  for select to authenticated
  using (bucket_id in ('photos', 'voix') and public.is_admin());

drop policy if exists "admin supprime les photos" on storage.objects;
create policy "admin supprime les photos" on storage.objects
  for delete to authenticated
  using (bucket_id in ('photos', 'voix') and public.is_admin());
