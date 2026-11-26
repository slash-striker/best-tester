create table if not exists public.gofish_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  current_turn uuid references auth.users(id) on delete set null,
  deck_count integer not null default 0 check (deck_count between 0 and 52),
  turn_timer_seconds integer not null default 0,
  turn_deadline_at timestamptz,
  last_action text not null default 'Room created. Invite a friend to join.',
  winner_id uuid references auth.users(id) on delete set null,
  end_reason text,
  created_at timestamptz not null default now()
);

alter table public.gofish_rooms add column if not exists turn_timer_seconds integer not null default 0;
alter table public.gofish_rooms add column if not exists turn_deadline_at timestamptz;
alter table public.gofish_rooms add column if not exists end_reason text;
alter table public.gofish_rooms drop constraint if exists gofish_rooms_current_turn_fkey;
alter table public.gofish_rooms drop constraint if exists gofish_rooms_winner_id_fkey;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.gofish_rooms'::regclass and conname = 'gofish_rooms_timer_seconds_check') then
    alter table public.gofish_rooms
      add constraint gofish_rooms_timer_seconds_check check (turn_timer_seconds in (0, 30, 60, 90));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gofish_rooms'::regclass and conname = 'gofish_rooms_end_reason_check') then
    alter table public.gofish_rooms
      add constraint gofish_rooms_end_reason_check check (end_reason is null or end_reason in ('completed', 'host_ended', 'abandoned'));
  end if;
end;
$$;

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

alter table public.gofish_players add column if not exists is_bot boolean not null default false;
alter table public.gofish_players drop constraint if exists gofish_players_user_id_fkey;

create unique index if not exists gofish_players_active_seats
  on public.gofish_players(room_id, seat)
  where left_at is null;

create table if not exists public.gofish_hands (
  room_id uuid not null references public.gofish_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  primary key (room_id, user_id)
);

alter table public.gofish_hands drop constraint if exists gofish_hands_user_id_fkey;

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
grant select (id, code, host_id, status, current_turn, deck_count, turn_timer_seconds, turn_deadline_at, last_action, winner_id, end_reason, created_at)
  on public.gofish_rooms to authenticated;
grant select (room_id, user_id, display_name, seat, books, left_at, joined_at, is_bot)
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
    select seat into next_seat
    from public.gofish_players
    where room_id = target.id and is_bot and left_at is null
    order by seat
    limit 1;
    if next_seat is null then
      raise exception 'This room already has four players.';
    end if;
    delete from public.gofish_hands
    where room_id = target.id and user_id = (
      select user_id from public.gofish_players
      where room_id = target.id and seat = next_seat and is_bot and left_at is null
    );
    delete from public.gofish_players
    where room_id = target.id and seat = next_seat and is_bot and left_at is null;
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

create or replace function public.set_gofish_timer(p_room_id uuid, p_seconds integer)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.gofish_rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to change the turn timer.';
  end if;
  if p_seconds not in (0, 30, 60, 90) then
    raise exception 'Choose no timer, 30, 60, or 90 seconds.';
  end if;
  select * into target from public.gofish_rooms where id = p_room_id for update;
  if not found or target.host_id <> auth.uid() then
    raise exception 'Only the room host can change the turn timer.';
  end if;
  if target.status <> 'lobby' then
    raise exception 'The turn timer can only be changed before the game starts.';
  end if;
  update public.gofish_rooms
  set turn_timer_seconds = p_seconds,
      turn_deadline_at = null
  where id = p_room_id;
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
      turn_deadline_at = case when turn_timer_seconds = 0 then null else now() + make_interval(secs => turn_timer_seconds) end,
      end_reason = null,
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
    update public.gofish_rooms
    set status = 'finished', winner_id = next_user, current_turn = null,
        turn_deadline_at = null, end_reason = 'completed'
    where id = p_room_id;
    return;
  end if;

  if keep_turn and jsonb_array_length(own_hand) > 0 then
    update public.gofish_rooms
    set current_turn = auth.uid(),
        turn_deadline_at = case when turn_timer_seconds = 0 then null else now() + make_interval(secs => turn_timer_seconds) end
    where id = p_room_id;
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
    update public.gofish_rooms
    set status = 'finished', winner_id = next_user, current_turn = null,
        turn_deadline_at = null, end_reason = 'completed'
    where id = p_room_id;
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
  update public.gofish_rooms
  set current_turn = next_user,
      turn_deadline_at = case when turn_timer_seconds = 0 then null else now() + make_interval(secs => turn_timer_seconds) end
  where id = p_room_id;
  perform public.advance_gofish_bots(p_room_id);
end;
$$;

create or replace function public.fill_gofish_bots(p_room_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.gofish_rooms%rowtype;
  next_seat integer;
  bot_id uuid;
  added integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in to add bots.'; end if;
  if p_count not between 1 and 3 then raise exception 'Choose between one and three bots.'; end if;
  select * into target from public.gofish_rooms where id = p_room_id for update;
  if not found or target.host_id <> auth.uid() then raise exception 'Only the room host can add bots.'; end if;
  if target.status <> 'lobby' then raise exception 'Bots can only be added before the game starts.'; end if;
  while added < p_count loop
    select seat into next_seat from generate_series(1, 4) as seats(seat)
    where not exists (select 1 from public.gofish_players where room_id = p_room_id and seat = seats.seat and left_at is null)
    order by seat limit 1;
    exit when next_seat is null;
    bot_id := gen_random_uuid();
    insert into public.gofish_players(room_id, user_id, display_name, seat, is_bot)
    values (p_room_id, bot_id, 'Bot ' || next_seat, next_seat, true);
    insert into public.gofish_hands(room_id, user_id, cards)
    values (p_room_id, bot_id, '[]'::jsonb);
    added := added + 1;
  end loop;
  if added = 0 then raise exception 'This room already has four players.'; end if;
  update public.gofish_rooms
  set last_action = added::text || ' bot opponent' || case when added = 1 then '' else 's' end || ' joined the table.'
  where id = p_room_id;
  return added;
end;
$$;

create or replace function public.advance_gofish_bots(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.gofish_rooms%rowtype;
  bot public.gofish_players%rowtype;
  opponent public.gofish_players%rowtype;
  own_hand jsonb;
  target_hand jsonb;
  deck jsonb;
  transferred jsonb;
  drawn jsonb;
  rank integer;
  card_rank integer;
  current_seat integer;
  next_seat integer;
  next_user uuid;
  completed_books integer;
  total_books integer;
  keep_turn boolean;
  iterations integer := 0;
begin
  if auth.uid() is null or not public.is_gofish_member(p_room_id) then
    raise exception 'Only a room member can advance bot turns.';
  end if;
  select * into target from public.gofish_rooms where id = p_room_id for update;
  if not found or target.status <> 'playing' then return; end if;

  loop
    iterations := iterations + 1;
    if iterations > 80 then raise exception 'Could not advance the bot turn safely.'; end if;
    select * into bot from public.gofish_players
    where room_id = p_room_id and user_id = target.current_turn and is_bot and left_at is null;
    if not found then return; end if;

    select cards into own_hand from public.gofish_hands
    where room_id = p_room_id and user_id = bot.user_id for update;
    select cards into deck from public.gofish_decks where room_id = p_room_id for update;
    if jsonb_array_length(own_hand) = 0 and target.deck_count > 0 then
      drawn := deck -> 0;
      deck := deck - 0;
      target.deck_count := jsonb_array_length(deck);
      own_hand := own_hand || jsonb_build_array(drawn);
      update public.gofish_decks set cards = deck where room_id = p_room_id;
    end if;

    select (card ->> 'rank')::integer into rank
    from jsonb_array_elements(own_hand) as cards(card)
    order by random() limit 1;
    select player.* into opponent
    from public.gofish_players as player
    join public.gofish_hands as hand on hand.room_id = player.room_id and hand.user_id = player.user_id
    where player.room_id = p_room_id and player.left_at is null and player.user_id <> bot.user_id
      and jsonb_array_length(hand.cards) > 0
    order by random() limit 1;

    keep_turn := false;
    if found and rank is not null then
      select cards into target_hand from public.gofish_hands
      where room_id = p_room_id and user_id = opponent.user_id for update;
      transferred := public.gofish_take_rank(target_hand, rank);
      if jsonb_array_length(transferred) > 0 then
        target_hand := public.gofish_remove_rank(target_hand, rank);
        own_hand := own_hand || transferred;
        keep_turn := true;
        update public.gofish_hands set cards = target_hand
        where room_id = p_room_id and user_id = opponent.user_id;
        update public.gofish_rooms set last_action = bot.display_name || ' asked ' || opponent.display_name || ' for ' || rank || 's — got them!'
        where id = p_room_id;
      elsif target.deck_count > 0 then
        drawn := deck -> 0;
        deck := deck - 0;
        target.deck_count := jsonb_array_length(deck);
        own_hand := own_hand || jsonb_build_array(drawn);
        keep_turn := coalesce((drawn ->> 'rank')::integer = rank, false);
        update public.gofish_decks set cards = deck where room_id = p_room_id;
        update public.gofish_rooms
        set deck_count = target.deck_count,
            last_action = bot.display_name || ' went fishing' || case when keep_turn then ' and found the rank!' else '.' end
        where id = p_room_id;
      else
        update public.gofish_rooms set last_action = bot.display_name || ' went fishing, but the pond is empty.' where id = p_room_id;
      end if;
    elsif target.deck_count > 0 then
      drawn := deck -> 0;
      deck := deck - 0;
      target.deck_count := jsonb_array_length(deck);
      own_hand := own_hand || jsonb_build_array(drawn);
      update public.gofish_decks set cards = deck where room_id = p_room_id;
      update public.gofish_rooms set deck_count = target.deck_count, last_action = bot.display_name || ' drew a card from the pond.' where id = p_room_id;
    end if;

    completed_books := 0;
    for card_rank in 1..13 loop
      while public.gofish_count_rank(own_hand, card_rank) = 4 loop
        own_hand := public.gofish_remove_rank(own_hand, card_rank);
        completed_books := completed_books + 1;
      end loop;
    end loop;
    if completed_books > 0 then
      update public.gofish_players set books = books + completed_books
      where room_id = p_room_id and user_id = bot.user_id;
      update public.gofish_rooms set last_action = bot.display_name || ' completed ' || completed_books || ' book' ||
        case when completed_books = 1 then '' else 's' end || '!' where id = p_room_id;
    end if;
    if jsonb_array_length(own_hand) = 0 and target.deck_count > 0 then
      drawn := deck -> 0;
      deck := deck - 0;
      target.deck_count := jsonb_array_length(deck);
      own_hand := own_hand || jsonb_build_array(drawn);
      update public.gofish_decks set cards = deck where room_id = p_room_id;
      keep_turn := true;
    end if;
    update public.gofish_hands set cards = own_hand where room_id = p_room_id and user_id = bot.user_id;
    update public.gofish_rooms set deck_count = target.deck_count where id = p_room_id;

    select coalesce(sum(books), 0) into total_books
    from public.gofish_players where room_id = p_room_id and left_at is null;
    if total_books = 13 then
      select user_id into next_user from public.gofish_players
      where room_id = p_room_id and left_at is null order by books desc, seat limit 1;
      update public.gofish_rooms set status = 'finished', winner_id = next_user, current_turn = null,
        turn_deadline_at = null, end_reason = 'completed' where id = p_room_id;
      return;
    end if;

    if keep_turn and jsonb_array_length(own_hand) > 0 then
      update public.gofish_rooms set current_turn = bot.user_id,
        turn_deadline_at = case when turn_timer_seconds = 0 then null else now() + make_interval(secs => turn_timer_seconds) end
      where id = p_room_id;
      target.current_turn := bot.user_id;
      continue;
    end if;

    current_seat := bot.seat;
    select player.user_id, player.seat into next_user, next_seat
    from public.gofish_players as player
    join public.gofish_hands as hand on hand.room_id = player.room_id and hand.user_id = player.user_id
    where player.room_id = p_room_id and player.left_at is null and player.user_id <> bot.user_id
      and (jsonb_array_length(hand.cards) > 0 or target.deck_count > 0)
    order by case when player.seat > current_seat then 0 else 1 end, player.seat
    limit 1;
    if next_user is null then
      select user_id into next_user from public.gofish_players
      where room_id = p_room_id and left_at is null order by books desc, seat limit 1;
      update public.gofish_rooms set status = 'finished', winner_id = next_user, current_turn = null,
        turn_deadline_at = null, end_reason = 'completed' where id = p_room_id;
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
    end if;
    update public.gofish_rooms set current_turn = next_user,
      deck_count = target.deck_count,
      turn_deadline_at = case when turn_timer_seconds = 0 then null else now() + make_interval(secs => turn_timer_seconds) end
    where id = p_room_id;
    target.current_turn := next_user;
  end loop;
end;
$$;

create or replace function public.expire_gofish_turn(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.gofish_rooms%rowtype;
  next_user uuid;
  next_seat integer;
  current_seat integer;
  next_hand jsonb;
  deck jsonb;
  drawn jsonb;
  player_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to advance a timed turn.';
  end if;
  select * into target from public.gofish_rooms where id = p_room_id for update;
  if not found or target.status <> 'playing' then
    return;
  end if;
  if not exists (
    select 1 from public.gofish_players
    where room_id = p_room_id and user_id = auth.uid() and left_at is null
  ) then
    raise exception 'Only a player at this table can advance the turn.';
  end if;
  if target.turn_timer_seconds = 0 or target.turn_deadline_at is null or target.turn_deadline_at > now() then
    return;
  end if;

  select seat into current_seat from public.gofish_players
  where room_id = p_room_id and user_id = target.current_turn;
  select player.user_id, player.seat, player.display_name into next_user, next_seat, player_name
  from public.gofish_players as player
  join public.gofish_hands as hand on hand.room_id = player.room_id and hand.user_id = player.user_id
  where player.room_id = p_room_id
    and player.left_at is null
    and player.user_id <> target.current_turn
    and (jsonb_array_length(hand.cards) > 0 or target.deck_count > 0)
  order by case when player.seat > current_seat then 0 else 1 end, player.seat
  limit 1;

  if next_user is null then
    select user_id into next_user
    from public.gofish_players
    where room_id = p_room_id and left_at is null
    order by books desc, seat
    limit 1;
    update public.gofish_rooms
    set status = 'finished', winner_id = next_user, current_turn = null,
        turn_deadline_at = null, end_reason = 'completed',
        last_action = 'The final turn expired. The round is complete.'
    where id = p_room_id;
    return;
  end if;

  if target.deck_count > 0 then
    select cards into deck from public.gofish_decks where room_id = p_room_id for update;
    select cards into next_hand from public.gofish_hands
    where room_id = p_room_id and user_id = next_user for update;
    if jsonb_array_length(next_hand) = 0 then
      drawn := deck -> 0;
      deck := deck - 0;
      next_hand := jsonb_build_array(drawn);
      update public.gofish_hands set cards = next_hand where room_id = p_room_id and user_id = next_user;
      update public.gofish_decks set cards = deck where room_id = p_room_id;
      target.deck_count := jsonb_array_length(deck);
    end if;
  end if;

  update public.gofish_rooms
  set current_turn = next_user,
      deck_count = target.deck_count,
      turn_deadline_at = case when turn_timer_seconds = 0 then null else now() + make_interval(secs => turn_timer_seconds) end,
      last_action = 'Time ran out. ' || player_name || ' is up next.'
  where id = p_room_id;
  perform public.advance_gofish_bots(p_room_id);
end;
$$;

create or replace function public.end_gofish_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.gofish_rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to end the game.';
  end if;
  select * into target from public.gofish_rooms where id = p_room_id for update;
  if not found or target.host_id <> auth.uid() then
    raise exception 'Only the room host can end the game.';
  end if;
  if target.status <> 'playing' then
    raise exception 'Only an active game can be ended.';
  end if;
  update public.gofish_rooms
  set status = 'finished',
      winner_id = null,
      current_turn = null,
      turn_deadline_at = null,
      end_reason = 'host_ended',
      last_action = 'The host ended the game. No winner was recorded.'
  where id = p_room_id;
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
        winner_id = null,
        current_turn = null,
        turn_deadline_at = null,
        end_reason = 'abandoned',
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
revoke execute on function public.set_gofish_timer(uuid, integer) from public, anon, authenticated;
revoke execute on function public.ask_gofish_rank(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.fill_gofish_bots(uuid, integer) from public, anon, authenticated;
revoke execute on function public.advance_gofish_bots(uuid) from public, anon, authenticated;
revoke execute on function public.expire_gofish_turn(uuid) from public, anon, authenticated;
revoke execute on function public.end_gofish_room(uuid) from public, anon, authenticated;
revoke execute on function public.leave_gofish_room(uuid) from public, anon, authenticated;
grant execute on function public.create_gofish_room(text) to authenticated;
grant execute on function public.join_gofish_room(text, text) to authenticated;
grant execute on function public.start_gofish_room(uuid) to authenticated;
grant execute on function public.set_gofish_timer(uuid, integer) to authenticated;
grant execute on function public.ask_gofish_rank(uuid, uuid, integer) to authenticated;
grant execute on function public.fill_gofish_bots(uuid, integer) to authenticated;
grant execute on function public.advance_gofish_bots(uuid) to authenticated;
grant execute on function public.expire_gofish_turn(uuid) to authenticated;
grant execute on function public.end_gofish_room(uuid) to authenticated;
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

-- Public, opt-in card totals. These are casual player-reported scores because
-- the card games themselves run in the browser.
create table if not exists public.card_leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 28),
  total_wins integer not null default 0 check (total_wins between 0 and 1000000000),
  total_games integer not null default 0 check (total_games between total_wins and 1000000000),
  current_streak integer not null default 0 check (current_streak between 0 and 1000000000),
  best_streak integer not null default 0 check (best_streak between current_streak and 1000000000),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_tournaments (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 48),
  game_type text not null check (game_type in ('solitaire', 'freecell', 'blackjack')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  participant_count integer not null default 0 check (participant_count between 0 and 1000000),
  total_games integer not null default 0 check (total_games between 0 and 1000000000),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '7 days')
);

create table if not exists public.card_tournament_entries (
  tournament_id uuid not null references public.card_tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  wins integer not null default 0 check (wins between 0 and 1000000000),
  games integer not null default 0 check (games between wins and 1000000000),
  joined_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

alter table public.card_leaderboard enable row level security;
alter table public.card_tournaments enable row level security;
alter table public.card_tournament_entries enable row level security;

drop policy if exists "Authenticated players can read public card scores" on public.card_leaderboard;
create policy "Authenticated players can read public card scores"
  on public.card_leaderboard for select to authenticated using (true);

drop policy if exists "Authenticated players can read open card tournaments" on public.card_tournaments;
create policy "Authenticated players can read open card tournaments"
  on public.card_tournaments for select to authenticated using (ends_at > now());

drop policy if exists "Players can read their own tournament entries" on public.card_tournament_entries;
create policy "Players can read their own tournament entries"
  on public.card_tournament_entries for select to authenticated using (user_id = auth.uid());

revoke all on public.card_leaderboard, public.card_tournaments, public.card_tournament_entries
  from public, anon, authenticated;
grant select (display_name, total_wins, total_games, best_streak, updated_at)
  on public.card_leaderboard to authenticated;
grant select (id, name, game_type, starts_at, ends_at, participant_count, total_games)
  on public.card_tournaments to authenticated;
grant select (tournament_id, user_id, wins, games, joined_at)
  on public.card_tournament_entries to authenticated;

create or replace function public.get_my_card_club_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'joined', exists (
      select 1 from public.card_leaderboard where user_id = auth.uid()
    ),
    'tournament_ids', coalesce((
      select jsonb_agg(entry.tournament_id)
      from public.card_tournament_entries as entry
      join public.card_tournaments as tournament on tournament.id = entry.tournament_id
      where entry.user_id = auth.uid() and tournament.ends_at > now()
    ), '[]'::jsonb)
  );
$$;

create or replace function public.join_card_leaderboard(p_display_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to join the card leaderboard.';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 28 then
    raise exception 'Choose a display name between 1 and 28 characters.';
  end if;
  insert into public.card_leaderboard(user_id, display_name)
  values (auth.uid(), trim(p_display_name))
  on conflict (user_id) do update
    set display_name = excluded.display_name, updated_at = now();
end;
$$;

create or replace function public.record_card_game_result(p_game_type text, p_won boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or p_won is null or p_game_type is null or
     p_game_type not in ('solitaire', 'freecell', 'blackjack', 'gofish') then
    raise exception 'Invalid card game result.';
  end if;
  update public.card_leaderboard
  set total_games = total_games + 1,
      total_wins = total_wins + case when p_won then 1 else 0 end,
      current_streak = case when p_won then current_streak + 1 else 0 end,
      best_streak = greatest(best_streak, case when p_won then current_streak + 1 else current_streak end),
      updated_at = now()
  where user_id = auth.uid();
  if not found then
    raise exception 'Join the public leaderboard before submitting scores.';
  end if;
end;
$$;

create or replace function public.create_card_tournament(p_name text, p_game_type text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tournament_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a tournament.';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 48 or
     p_game_type not in ('solitaire', 'freecell', 'blackjack') then
    raise exception 'Choose a tournament name and supported card game.';
  end if;
  if not exists (select 1 from public.card_leaderboard where user_id = auth.uid()) then
    raise exception 'Join the card leaderboard before creating a tournament.';
  end if;
  if (select count(*) from public.card_tournaments
      where host_id = auth.uid() and ends_at > now()) >= 3 then
    raise exception 'You can host up to three active tournaments.';
  end if;
  insert into public.card_tournaments(host_id, name, game_type, starts_at, ends_at)
  values (auth.uid(), trim(p_name), p_game_type, now(), now() + interval '24 hours')
  returning id into tournament_id;
  insert into public.card_tournament_entries(tournament_id, user_id)
  values (tournament_id, auth.uid());
  update public.card_tournaments set participant_count = 1 where id = tournament_id;
  return tournament_id;
end;
$$;

create or replace function public.join_card_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a tournament.';
  end if;
  if not exists (select 1 from public.card_leaderboard where user_id = auth.uid()) then
    raise exception 'Join the card leaderboard before entering a tournament.';
  end if;
  if not exists (
    select 1 from public.card_tournaments
    where id = p_tournament_id and starts_at <= now() and ends_at > now()
  ) then
    raise exception 'That tournament is not currently open.';
  end if;
  insert into public.card_tournament_entries(tournament_id, user_id)
  values (p_tournament_id, auth.uid())
  on conflict (tournament_id, user_id) do nothing;
  update public.card_tournaments
  set participant_count = (
    select count(*)::integer from public.card_tournament_entries
    where tournament_id = p_tournament_id
  )
  where id = p_tournament_id;
end;
$$;

create or replace function public.record_card_tournament_result(p_tournament_id uuid, p_won boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or p_won is null then
    raise exception 'Invalid tournament result.';
  end if;
  update public.card_tournament_entries as entry
  set games = entry.games + 1,
      wins = entry.wins + case when p_won then 1 else 0 end
  from public.card_tournaments as tournament
  where entry.tournament_id = p_tournament_id
    and entry.user_id = auth.uid()
    and tournament.id = entry.tournament_id
    and tournament.starts_at <= now()
    and tournament.ends_at > now();
  if not found then
    raise exception 'Join an active tournament before submitting results.';
  end if;
  update public.card_tournaments
  set total_games = total_games + 1
  where id = p_tournament_id;
end;
$$;

create or replace function public.get_card_tournament_standings(p_tournament_id uuid)
returns table(display_name text, wins integer, games integer)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select board.display_name, entry.wins, entry.games
  from public.card_tournament_entries as entry
  join public.card_leaderboard as board on board.user_id = entry.user_id
  join public.card_tournaments as tournament on tournament.id = entry.tournament_id
  where entry.tournament_id = p_tournament_id
    and tournament.ends_at > now()
    and auth.uid() is not null
  order by entry.wins desc, entry.games desc, board.display_name
  limit 50;
$$;

revoke execute on function public.get_my_card_club_status() from public, anon, authenticated;
revoke execute on function public.join_card_leaderboard(text) from public, anon, authenticated;
revoke execute on function public.record_card_game_result(text, boolean) from public, anon, authenticated;
revoke execute on function public.create_card_tournament(text, text) from public, anon, authenticated;
revoke execute on function public.join_card_tournament(uuid) from public, anon, authenticated;
revoke execute on function public.record_card_tournament_result(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.get_card_tournament_standings(uuid) from public, anon, authenticated;
grant execute on function public.get_my_card_club_status() to authenticated;
grant execute on function public.join_card_leaderboard(text) to authenticated;
grant execute on function public.record_card_game_result(text, boolean) to authenticated;
grant execute on function public.create_card_tournament(text, text) to authenticated;
grant execute on function public.join_card_tournament(uuid) to authenticated;
grant execute on function public.record_card_tournament_result(uuid, boolean) to authenticated;
grant execute on function public.get_card_tournament_standings(uuid) to authenticated;

-- Mini golf rooms keep turn ownership, strokes, and bot play in trusted SQL.
create table if not exists public.minigolf_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  current_turn integer,
  hole integer not null default 1 check (hole between 1 and 9),
  winner_id uuid references auth.users(id) on delete set null,
  winner_seat integer,
  last_action text not null default 'Room created. Invite a friend or fill a seat with a bot.',
  created_at timestamptz not null default now()
);

create table if not exists public.minigolf_players (
  room_id uuid not null references public.minigolf_rooms(id) on delete cascade,
  seat integer not null check (seat between 1 and 4),
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  is_bot boolean not null default false,
  scores jsonb not null default '[]'::jsonb,
  hole_strokes integer not null default 0 check (hole_strokes between 0 and 20),
  remaining numeric not null default 45 check (remaining between 0 and 1000),
  holed boolean not null default false,
  left_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (room_id, seat),
  check ((is_bot and user_id is null) or (not is_bot and user_id is not null))
);

create unique index if not exists minigolf_players_active_users
  on public.minigolf_players(room_id, user_id)
  where user_id is not null and left_at is null;

alter table public.minigolf_rooms enable row level security;
alter table public.minigolf_players enable row level security;

create or replace function public.is_minigolf_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.minigolf_players
    where room_id = p_room_id and user_id = auth.uid() and left_at is null
  );
$$;

drop policy if exists "Mini golf members can read their room" on public.minigolf_rooms;
create policy "Mini golf members can read their room"
  on public.minigolf_rooms for select to authenticated
  using (public.is_minigolf_member(id));

drop policy if exists "Mini golf members can read the scorecard" on public.minigolf_players;
create policy "Mini golf members can read the scorecard"
  on public.minigolf_players for select to authenticated
  using (public.is_minigolf_member(room_id));

revoke all on public.minigolf_rooms, public.minigolf_players from public, anon, authenticated;
grant select (id, code, host_id, status, current_turn, hole, winner_id, winner_seat, last_action, created_at)
  on public.minigolf_rooms to authenticated;
grant select (room_id, seat, user_id, display_name, is_bot, scores, hole_strokes, remaining, holed, left_at, joined_at)
  on public.minigolf_players to authenticated;

create or replace function public.create_minigolf_room(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  room_id uuid;
  room_code text;
begin
  if auth.uid() is null then raise exception 'Sign in to create a game room.'; end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 24 then
    raise exception 'Choose a name between 1 and 24 characters.';
  end if;
  loop
    room_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.minigolf_rooms where code = room_code);
  end loop;
  insert into public.minigolf_rooms(code, host_id) values (room_code, auth.uid()) returning id into room_id;
  insert into public.minigolf_players(room_id, seat, user_id, display_name, remaining)
  values (room_id, 1, auth.uid(), trim(p_display_name), 45);
  return jsonb_build_object('room_id', room_id, 'room_code', room_code);
end;
$$;

create or replace function public.join_minigolf_room(p_room_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.minigolf_rooms%rowtype;
  next_seat integer;
begin
  if auth.uid() is null then raise exception 'Sign in to join a game room.'; end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 24 then
    raise exception 'Choose a name between 1 and 24 characters.';
  end if;
  select * into target from public.minigolf_rooms
  where code = upper(trim(p_room_code)) for update;
  if not found or target.status <> 'lobby' then
    raise exception 'That room code is invalid or the game has already started.';
  end if;
  if exists (select 1 from public.minigolf_players where room_id = target.id and user_id = auth.uid() and left_at is null) then
    update public.minigolf_players set display_name = trim(p_display_name)
    where room_id = target.id and user_id = auth.uid();
    return target.id;
  end if;
  select seat into next_seat from generate_series(1, 4) as seats(seat)
  where not exists (select 1 from public.minigolf_players where room_id = target.id and seat = seats.seat and left_at is null)
  order by seat limit 1;
  if next_seat is null then
    select seat into next_seat from public.minigolf_players
    where room_id = target.id and is_bot and left_at is null
    order by seat limit 1;
    if next_seat is null then raise exception 'This room already has four players.'; end if;
    update public.minigolf_players
    set user_id = auth.uid(), display_name = trim(p_display_name), is_bot = false,
        scores = '[]'::jsonb, hole_strokes = 0, remaining = 45, holed = false, left_at = null
    where room_id = target.id and seat = next_seat;
    return target.id;
  end if;
  insert into public.minigolf_players(room_id, seat, user_id, display_name, remaining)
  values (target.id, next_seat, auth.uid(), trim(p_display_name), 45)
  on conflict (room_id, seat) do update
    set user_id = excluded.user_id, display_name = excluded.display_name, is_bot = false,
        scores = '[]'::jsonb, hole_strokes = 0, remaining = 45, holed = false, left_at = null;
  return target.id;
end;
$$;

create or replace function public.fill_minigolf_bots(p_room_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.minigolf_rooms%rowtype;
  next_seat integer;
  added integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in to add bots.'; end if;
  if p_count not between 1 and 3 then raise exception 'Choose between one and three bots.'; end if;
  select * into target from public.minigolf_rooms where id = p_room_id for update;
  if not found or target.host_id <> auth.uid() then raise exception 'Only the room host can add bots.'; end if;
  if target.status <> 'lobby' then raise exception 'Bots can only be added before the game starts.'; end if;
  while added < p_count loop
    select seat into next_seat from generate_series(1, 4) as seats(seat)
    where not exists (select 1 from public.minigolf_players where room_id = p_room_id and seat = seats.seat and left_at is null)
    order by seat limit 1;
    exit when next_seat is null;
    insert into public.minigolf_players(room_id, seat, display_name, is_bot, remaining)
    values (p_room_id, next_seat, 'Bot ' || next_seat, true, 45);
    added := added + 1;
  end loop;
  if added = 0 then raise exception 'This room already has four players.'; end if;
  update public.minigolf_rooms set last_action = added::text || ' bot opponent' || case when added = 1 then '' else 's' end || ' joined the table.'
  where id = p_room_id;
  return added;
end;
$$;

create or replace function public.start_minigolf_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.minigolf_rooms%rowtype;
  distance numeric;
begin
  if auth.uid() is null then raise exception 'Sign in to start the game.'; end if;
  select * into target from public.minigolf_rooms where id = p_room_id for update;
  if not found or target.host_id <> auth.uid() then raise exception 'Only the room host can start the game.'; end if;
  if target.status <> 'lobby' then raise exception 'This game has already started.'; end if;
  if (select count(*) from public.minigolf_players where room_id = p_room_id and left_at is null) not between 2 and 4 then
    raise exception 'Mini golf needs 2–4 players.';
  end if;
  distance := 45;
  update public.minigolf_players
  set scores = '[]'::jsonb, hole_strokes = 0, remaining = distance, holed = false
  where room_id = p_room_id and left_at is null;
  update public.minigolf_rooms
  set status = 'playing',
      hole = 1,
      current_turn = (select min(seat) from public.minigolf_players where room_id = p_room_id and left_at is null),
      winner_id = null,
      winner_seat = null,
      last_action = 'Tee off! Take turns to aim and putt through all nine holes.'
  where id = p_room_id;
end;
$$;

create or replace function public.play_minigolf_shot(p_room_id uuid, p_power integer, p_angle numeric)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.minigolf_rooms%rowtype;
  player public.minigolf_players%rowtype;
  next_player public.minigolf_players%rowtype;
  current_seat integer;
  next_seat integer;
  hole_par integer;
  hole_distance numeric;
  shot_distance numeric;
  new_distance numeric;
  new_strokes integer;
  spins integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in to play.'; end if;
  if p_power is null or p_power not between 1 and 100 or p_angle is null or p_angle < -45 or p_angle > 45 then
    raise exception 'Choose a valid power and angle for your shot.';
  end if;
  select * into target from public.minigolf_rooms where id = p_room_id for update;
  if not found or target.status <> 'playing' then raise exception 'This room is not in an active game.'; end if;
  if not public.is_minigolf_member(p_room_id) then raise exception 'Join this room before playing.'; end if;
  select * into player from public.minigolf_players
  where room_id = p_room_id and user_id = auth.uid() and left_at is null for update;
  if not found or player.seat <> target.current_turn then raise exception 'Wait for your turn before putting.'; end if;

  hole_par := (array[2,3,3,4,2,4,3,4,3])[target.hole];
  hole_distance := (array[45,78,92,118,53,132,84,145,99])[target.hole];
  shot_distance := greatest(0, abs(player.remaining - p_power * (1.1 - abs(p_angle) / 180.0)) + abs(p_angle) * 0.16 + random() * 2.5);
  new_strokes := player.hole_strokes + 1;
  update public.minigolf_players
  set hole_strokes = new_strokes,
      remaining = shot_distance,
      holed = shot_distance <= 3 or new_strokes >= hole_par + 4,
      scores = case when shot_distance <= 3 or new_strokes >= hole_par + 4 then scores || jsonb_build_array(new_strokes) else scores end
  where room_id = p_room_id and seat = player.seat;
  update public.minigolf_rooms
  set last_action = player.display_name || ' took stroke ' || new_strokes || '.'
  where id = p_room_id;
  current_seat := player.seat;

  loop
    spins := spins + 1;
    if spins > 40 then raise exception 'Could not advance the mini-golf turn safely.'; end if;
    if not exists (select 1 from public.minigolf_players where room_id = p_room_id and left_at is null and not holed) then
      if target.hole = 9 then
        select * into next_player from public.minigolf_players as scored
        where scored.room_id = p_room_id and scored.left_at is null
        order by (select coalesce(sum(entry.value::integer), 0) from jsonb_array_elements_text(scored.scores) as entry(value)), scored.seat
        limit 1;
        update public.minigolf_rooms
        set status = 'finished', current_turn = null, winner_id = next_player.user_id, winner_seat = next_player.seat,
            last_action = next_player.display_name || ' wins the nine-hole course!'
        where id = p_room_id;
        return;
      end if;
      target.hole := target.hole + 1;
      hole_distance := (array[45,78,92,118,53,132,84,145,99])[target.hole];
      update public.minigolf_players set hole_strokes = 0, remaining = hole_distance, holed = false
      where room_id = p_room_id and left_at is null;
      select min(seat) into next_seat from public.minigolf_players where room_id = p_room_id and left_at is null;
      update public.minigolf_rooms set hole = target.hole, current_turn = next_seat,
        last_action = 'Hole ' || target.hole || ' is open. Take your shot.'
      where id = p_room_id;
      return;
    end if;

    select seat into next_seat from public.minigolf_players
    where room_id = p_room_id and left_at is null and not holed
    order by case when seat > current_seat then 0 else 1 end, seat limit 1;
    select * into next_player from public.minigolf_players where room_id = p_room_id and seat = next_seat for update;
    update public.minigolf_rooms set current_turn = next_seat where id = p_room_id;
    if not next_player.is_bot then return; end if;

    hole_par := (array[2,3,3,4,2,4,3,4,3])[target.hole];
    shot_distance := greatest(0, abs(next_player.remaining - greatest(1, least(100, next_player.remaining / 1.1)) * 1.1) + random() * 2.5);
    new_strokes := next_player.hole_strokes + 1;
    update public.minigolf_players
    set hole_strokes = new_strokes,
        remaining = shot_distance,
        holed = shot_distance <= 3 or new_strokes >= hole_par + 4,
        scores = case when shot_distance <= 3 or new_strokes >= hole_par + 4 then scores || jsonb_build_array(new_strokes) else scores end
    where room_id = p_room_id and seat = next_seat;
    update public.minigolf_rooms set last_action = next_player.display_name || ' took a bot stroke.' where id = p_room_id;
    current_seat := next_seat;
  end loop;
end;
$$;

create or replace function public.leave_minigolf_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.minigolf_rooms%rowtype;
  next_host uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to leave the room.'; end if;
  select * into target from public.minigolf_rooms where id = p_room_id for update;
  if not found or not exists (select 1 from public.minigolf_players where room_id = p_room_id and user_id = auth.uid() and left_at is null) then
    raise exception 'You are not an active player in this room.';
  end if;
  update public.minigolf_players set left_at = now()
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;
  if target.status = 'playing' then
    update public.minigolf_rooms set status = 'finished', current_turn = null, winner_id = null, winner_seat = null,
      last_action = 'A player left the table. The round has ended.'
    where id = p_room_id;
    return;
  end if;
  select user_id into next_host from public.minigolf_players
  where room_id = p_room_id and user_id is not null and left_at is null order by seat limit 1;
  if next_host is null then
    delete from public.minigolf_rooms where id = p_room_id;
  elsif target.host_id = auth.uid() then
    update public.minigolf_rooms set host_id = next_host where id = p_room_id;
  end if;
end;
$$;

revoke execute on function public.is_minigolf_member(uuid) from public, anon, authenticated;
revoke execute on function public.create_minigolf_room(text) from public, anon, authenticated;
revoke execute on function public.join_minigolf_room(text, text) from public, anon, authenticated;
revoke execute on function public.fill_minigolf_bots(uuid, integer) from public, anon, authenticated;
revoke execute on function public.start_minigolf_room(uuid) from public, anon, authenticated;
revoke execute on function public.play_minigolf_shot(uuid, integer, numeric) from public, anon, authenticated;
revoke execute on function public.leave_minigolf_room(uuid) from public, anon, authenticated;
grant execute on function public.is_minigolf_member(uuid) to authenticated;
grant execute on function public.create_minigolf_room(text) to authenticated;
grant execute on function public.join_minigolf_room(text, text) to authenticated;
grant execute on function public.fill_minigolf_bots(uuid, integer) to authenticated;
grant execute on function public.start_minigolf_room(uuid) to authenticated;
grant execute on function public.play_minigolf_shot(uuid, integer, numeric) to authenticated;
grant execute on function public.leave_minigolf_room(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'minigolf_rooms') then
    alter publication supabase_realtime add table public.minigolf_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'minigolf_players') then
    alter publication supabase_realtime add table public.minigolf_players;
  end if;
end;
$$;

notify pgrst, 'reload schema';
