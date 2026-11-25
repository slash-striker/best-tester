create table if not exists public.gofish_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  current_turn uuid references auth.users(id) on delete set null,
  deck_count integer not null default 0 check (deck_count between 0 and 52),
  last_action text not null default 'Room created. Invite a friend to join.',
  winner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.gofish_players (
  room_id uuid not null references public.gofish_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  seat integer not null check (seat between 1 and 4),
  books integer not null default 0 check (books between 0 and 13),
  left_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create unique index if not exists gofish_players_active_seats
  on public.gofish_players(room_id, seat)
  where left_at is null;

create table if not exists public.gofish_hands (
  room_id uuid not null references public.gofish_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  primary key (room_id, user_id)
);

create table if not exists public.gofish_decks (
  room_id uuid primary key references public.gofish_rooms(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb
);

alter table public.gofish_rooms enable row level security;
alter table public.gofish_players enable row level security;
alter table public.gofish_hands enable row level security;
alter table public.gofish_decks enable row level security;

create or replace function public.is_gofish_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.gofish_players
    where room_id = p_room_id
      and user_id = auth.uid()
      and left_at is null
  );
$$;

drop policy if exists "Room members can read their room" on public.gofish_rooms;
create policy "Room members can read their room"
  on public.gofish_rooms for select to authenticated
  using (public.is_gofish_member(id));

drop policy if exists "Room members can read their player list" on public.gofish_players;
create policy "Room members can read their player list"
  on public.gofish_players for select to authenticated
  using (public.is_gofish_member(room_id));

drop policy if exists "Players can read only their own hand" on public.gofish_hands;
create policy "Players can read only their own hand"
  on public.gofish_hands for select to authenticated
  using (user_id = auth.uid() and public.is_gofish_member(room_id));

revoke all on public.gofish_rooms, public.gofish_players, public.gofish_hands, public.gofish_decks from public, anon, authenticated;
grant select (id, code, host_id, status, current_turn, deck_count, last_action, winner_id, created_at)
  on public.gofish_rooms to authenticated;
grant select (room_id, user_id, display_name, seat, books, left_at, joined_at)
  on public.gofish_players to authenticated;
grant select (room_id, user_id, cards)
  on public.gofish_hands to authenticated;

create or replace function public.gofish_take_rank(p_cards jsonb, p_rank integer)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(card), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) as items(card)
  where (card ->> 'rank')::integer = p_rank;
$$;

create or replace function public.gofish_remove_rank(p_cards jsonb, p_rank integer)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(card), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) as items(card)
  where (card ->> 'rank')::integer <> p_rank;
$$;

create or replace function public.gofish_count_rank(p_cards jsonb, p_rank integer)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select count(*)::integer
  from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) as items(card)
  where (card ->> 'rank')::integer = p_rank;
$$;

create or replace function public.create_gofish_room(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  room_id uuid;
  room_code text;
  next_seat integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a game room.';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 24 then
    raise exception 'Choose a name between 1 and 24 characters.';
  end if;

  loop
    room_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.gofish_rooms where code = room_code);
  end loop;

  insert into public.gofish_rooms(code, host_id)
  values (room_code, auth.uid())
  returning id into room_id;

  select seat into next_seat
  from generate_series(1, 4) as seats(seat)
  limit 1;

  insert into public.gofish_players(room_id, user_id, display_name, seat)
  values (room_id, auth.uid(), trim(p_display_name), next_seat);
  insert into public.gofish_hands(room_id, user_id, cards)
  values (room_id, auth.uid(), '[]'::jsonb);

  return jsonb_build_object('room_id', room_id, 'room_code', room_code);
end;
$$;

create or replace function public.join_gofish_room(p_room_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.gofish_rooms%rowtype;
  next_seat integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a game room.';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 24 then
    raise exception 'Choose a name between 1 and 24 characters.';
  end if;

  select * into target
  from public.gofish_rooms
  where code = upper(trim(p_room_code))
  for update;
  if not found or target.status <> 'lobby' then
    raise exception 'That room code is invalid or the game has already started.';
  end if;

  if exists (
    select 1 from public.gofish_players
    where room_id = target.id and user_id = auth.uid() and left_at is null
  ) then
    update public.gofish_players
    set display_name = trim(p_display_name)
    where room_id = target.id and user_id = auth.uid();
    return target.id;
  end if;

  select seat into next_seat
  from generate_series(1, 4) as seats(seat)
  where not exists (
    select 1 from public.gofish_players
    where room_id = target.id and gofish_players.seat = seats.seat and left_at is null
  )
  order by seat
  limit 1;
  if next_seat is null then
    raise exception 'This room already has four players.';
  end if;

  insert into public.gofish_players(room_id, user_id, display_name, seat, left_at)
  values (target.id, auth.uid(), trim(p_display_name), next_seat, null)
  on conflict (room_id, user_id) do update
    set display_name = excluded.display_name, seat = excluded.seat, left_at = null, books = 0;
  insert into public.gofish_hands(room_id, user_id, cards)
  values (target.id, auth.uid(), '[]'::jsonb)
  on conflict (room_id, user_id) do update set cards = '[]'::jsonb;

  return target.id;
end;
$$;

create or replace function public.start_gofish_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.gofish_rooms%rowtype;
  player record;
  deck jsonb;
  cards jsonb;
  cards_per_player integer;
  card_index integer;
  card_rank integer;
  initial_books integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to start a game.';
  end if;
  select * into target from public.gofish_rooms where id = p_room_id for update;
  if not found or target.host_id <> auth.uid() then
    raise exception 'Only the room host can start the game.';
  end if;
  if target.status <> 'lobby' then
    raise exception 'This game has already started.';
  end if;
  if (select count(*) from public.gofish_players where room_id = p_room_id and left_at is null) not between 2 and 4 then
    raise exception 'Go Fish needs 2–4 players.';
  end if;

  select jsonb_agg(
    jsonb_build_object('id', suit || '-' || rank, 'suit', suit, 'rank', rank, 'faceUp', true)
    order by random()
  ) into deck
  from unnest(array['clubs', 'diamonds', 'hearts', 'spades']) as suits(suit)
  cross join generate_series(1, 13) as ranks(rank);

  select case when count(*) = 2 then 7 else 5 end into cards_per_player
  from public.gofish_players where room_id = p_room_id and left_at is null;

  for player in
    select user_id from public.gofish_players
    where room_id = p_room_id and left_at is null
    order by seat
  loop
    initial_books := 0;
    cards := '[]'::jsonb;
    for card_index in 1..cards_per_player loop
      cards := cards || jsonb_build_array(deck -> 0);
      deck := deck - 0;
    end loop;
    for card_rank in 1..13 loop
      if public.gofish_count_rank(cards, card_rank) = 4 then
        cards := public.gofish_remove_rank(cards, card_rank);
        initial_books := initial_books + 1;
      end if;
    end loop;
    insert into public.gofish_hands(room_id, user_id, cards)
    values (p_room_id, player.user_id, cards)
    on conflict (room_id, user_id) do update set cards = excluded.cards;
    update public.gofish_players set books = initial_books
    where room_id = p_room_id and user_id = player.user_id;
  end loop;

  insert into public.gofish_decks(room_id, cards)
  values (p_room_id, deck)
  on conflict (room_id) do update set cards = excluded.cards;
  update public.gofish_rooms
  set status = 'playing',
      current_turn = host_id,
      deck_count = jsonb_array_length(deck),
      last_action = 'Cards dealt. Ask a friend for a rank in your hand.'
  where id = p_room_id;
end;
$$;

create or replace function public.ask_gofish_rank(p_room_id uuid, p_target_user_id uuid, p_rank integer)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.gofish_rooms%rowtype;
  own_hand jsonb;
  target_hand jsonb;
  deck jsonb;
  transferred jsonb;
  drawn jsonb;
  player_name text;
  target_name text;
  next_user uuid;
  next_seat integer;
  current_seat integer;
  card_rank integer;
  completed_books integer := 0;
  total_books integer;
  keep_turn boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in to play.';
  end if;
  if p_rank not between 1 and 13 or p_target_user_id = auth.uid() then
    raise exception 'Choose a valid rank and another player.';
  end if;

  select * into target from public.gofish_rooms where id = p_room_id for update;
  if not found or target.status <> 'playing' then
    raise exception 'This room is not in an active game.';
  end if;
  if target.current_turn <> auth.uid() then
    raise exception 'Wait for your turn before asking.';
  end if;
  if not exists (
    select 1 from public.gofish_players
    where room_id = p_room_id and user_id = p_target_user_id and left_at is null
  ) then
    raise exception 'That player is no longer at the table.';
  end if;
  select cards into deck from public.gofish_decks where room_id = p_room_id for update;

  select cards into own_hand from public.gofish_hands
  where room_id = p_room_id and user_id = auth.uid() for update;
  if public.gofish_count_rank(own_hand, p_rank) = 0 then
    raise exception 'You can only ask for a rank already in your hand.';
  end if;
  select cards into target_hand from public.gofish_hands
  where room_id = p_room_id and user_id = p_target_user_id for update;
  select display_name into player_name from public.gofish_players where room_id = p_room_id and user_id = auth.uid();
  select display_name into target_name from public.gofish_players where room_id = p_room_id and user_id = p_target_user_id;

  transferred := public.gofish_take_rank(target_hand, p_rank);
  if jsonb_array_length(transferred) > 0 then
    target_hand := public.gofish_remove_rank(target_hand, p_rank);
    own_hand := own_hand || transferred;
    keep_turn := true;
    update public.gofish_hands set cards = target_hand where room_id = p_room_id and user_id = p_target_user_id;
    update public.gofish_rooms set last_action = player_name || ' asked ' || target_name || ' for ' || p_rank || 's — got them!' where id = p_room_id;
  else
    if target.deck_count > 0 then
      drawn := deck -> 0;
      deck := deck - 0;
      target.deck_count := jsonb_array_length(deck);
      own_hand := own_hand || jsonb_build_array(drawn);
      update public.gofish_decks set cards = deck where room_id = p_room_id;
      update public.gofish_rooms
      set deck_count = target.deck_count
      where id = p_room_id;
      keep_turn := coalesce((drawn ->> 'rank')::integer = p_rank, false);
      update public.gofish_rooms
      set last_action = case when keep_turn then player_name || ' went fishing and found the rank!' else player_name || ' went fishing. Next player up!' end
      where id = p_room_id;
    else
      update public.gofish_rooms set last_action = player_name || ' went fishing, but the pond is empty.' where id = p_room_id;
    end if;
  end if;

  for card_rank in 1..13 loop
    while public.gofish_count_rank(own_hand, card_rank) = 4 loop
      own_hand := public.gofish_remove_rank(own_hand, card_rank);
      completed_books := completed_books + 1;
    end loop;
  end loop;
  if completed_books > 0 then
    update public.gofish_players set books = books + completed_books
    where room_id = p_room_id and user_id = auth.uid();
    update public.gofish_rooms set last_action = player_name || ' completed ' || completed_books || ' book' || case when completed_books = 1 then '' else 's' end || '!' where id = p_room_id;
  end if;

  if jsonb_array_length(own_hand) = 0 and target.deck_count > 0 then
    drawn := deck -> 0;
    deck := deck - 0;
    target.deck_count := jsonb_array_length(deck);
    own_hand := own_hand || jsonb_build_array(drawn);
    update public.gofish_decks set cards = deck where room_id = p_room_id;
    update public.gofish_rooms
    set deck_count = target.deck_count
    where id = p_room_id;
    keep_turn := true;
  end if;

  update public.gofish_hands set cards = own_hand where room_id = p_room_id and user_id = auth.uid();

  select coalesce(sum(player.books), 0) into total_books
  from public.gofish_players as player where player.room_id = p_room_id and player.left_at is null;
  if total_books = 13 then
    select user_id into next_user
    from public.gofish_players
    where room_id = p_room_id and left_at is null
    order by books desc, seat
    limit 1;
    update public.gofish_rooms set status = 'finished', winner_id = next_user, current_turn = null where id = p_room_id;
    return;
  end if;

  if keep_turn and jsonb_array_length(own_hand) > 0 then
    update public.gofish_rooms set current_turn = auth.uid() where id = p_room_id;
    return;
  end if;

  select seat into current_seat from public.gofish_players where room_id = p_room_id and user_id = auth.uid();
  select player.user_id, player.seat into next_user, next_seat
  from public.gofish_players as player
  join public.gofish_hands as hand on hand.room_id = player.room_id and hand.user_id = player.user_id
  where player.room_id = p_room_id
    and player.left_at is null
    and player.user_id <> auth.uid()
    and (jsonb_array_length(hand.cards) > 0 or target.deck_count > 0)
  order by case when player.seat > current_seat then 0 else 1 end, player.seat
  limit 1;

  if next_user is null then
    select user_id into next_user
    from public.gofish_players
    where room_id = p_room_id and left_at is null
    order by books desc, seat
    limit 1;
    update public.gofish_rooms set status = 'finished', winner_id = next_user, current_turn = null where id = p_room_id;
    return;
  end if;

  select cards into target_hand from public.gofish_hands
  where room_id = p_room_id and user_id = next_user for update;
  if jsonb_array_length(target_hand) = 0 and target.deck_count > 0 then
    drawn := deck -> 0;
    deck := deck - 0;
    target.deck_count := jsonb_array_length(deck);
    target_hand := jsonb_build_array(drawn);
    update public.gofish_hands set cards = target_hand where room_id = p_room_id and user_id = next_user;
    update public.gofish_decks set cards = deck where room_id = p_room_id;
    update public.gofish_rooms
    set deck_count = target.deck_count
    where id = p_room_id;
  end if;
  update public.gofish_rooms set current_turn = next_user where id = p_room_id;
end;
$$;

create or replace function public.leave_gofish_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  new_host uuid;
  room_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to leave a game.';
  end if;
  select status into room_status from public.gofish_rooms where id = p_room_id for update;
  if room_status is null or not exists (
    select 1 from public.gofish_players
    where room_id = p_room_id and user_id = auth.uid() and left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;
  update public.gofish_players set left_at = now()
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;
  delete from public.gofish_hands where room_id = p_room_id and user_id = auth.uid();

  select user_id into new_host
  from public.gofish_players
  where room_id = p_room_id and left_at is null
  order by case when room_status = 'playing' then books end desc, seat
  limit 1;

  if new_host is null then
    delete from public.gofish_rooms where id = p_room_id;
  elsif room_status = 'playing' then
    update public.gofish_rooms
    set status = 'finished',
        winner_id = new_host,
        current_turn = null,
        last_action = 'A player left the table. The round has ended.'
    where id = p_room_id;
  else
    update public.gofish_rooms
    set host_id = case when host_id = auth.uid() then new_host else host_id end,
        current_turn = case when current_turn = auth.uid() then new_host else current_turn end
    where id = p_room_id;
  end if;
end;
$$;

revoke execute on function public.is_gofish_member(uuid) from public, anon, authenticated;
revoke execute on function public.gofish_take_rank(jsonb, integer) from public, anon, authenticated;
revoke execute on function public.gofish_remove_rank(jsonb, integer) from public, anon, authenticated;
revoke execute on function public.gofish_count_rank(jsonb, integer) from public, anon, authenticated;
revoke execute on function public.create_gofish_room(text) from public, anon, authenticated;
revoke execute on function public.join_gofish_room(text, text) from public, anon, authenticated;
revoke execute on function public.start_gofish_room(uuid) from public, anon, authenticated;
revoke execute on function public.ask_gofish_rank(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.leave_gofish_room(uuid) from public, anon, authenticated;
grant execute on function public.create_gofish_room(text) to authenticated;
grant execute on function public.join_gofish_room(text, text) to authenticated;
grant execute on function public.start_gofish_room(uuid) to authenticated;
grant execute on function public.ask_gofish_rank(uuid, uuid, integer) to authenticated;
grant execute on function public.leave_gofish_room(uuid) to authenticated;
grant execute on function public.is_gofish_member(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gofish_rooms') then
    alter publication supabase_realtime add table public.gofish_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gofish_players') then
    alter publication supabase_realtime add table public.gofish_players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gofish_hands') then
    alter publication supabase_realtime add table public.gofish_hands;
  end if;
end;
$$;
