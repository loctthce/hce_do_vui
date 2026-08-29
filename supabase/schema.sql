create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  display_name text not null,
  role text not null check (role in ('admin', 'player')),
  created_at timestamptz not null default now()
);

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_by uuid,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  question_type text not null check (question_type in ('true_false', 'multiple_choice')),
  prompt text not null,
  points integer not null default 1000,
  time_limit_seconds integer not null default 20,
  position integer not null,
  created_at timestamptz not null default now()
);

create table if not exists question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  position integer not null,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  quiz_id uuid not null references quizzes(id) on delete cascade,
  host_user_id uuid,
  host_name text not null,
  status text not null default 'lobby' check (status in ('lobby', 'question', 'reveal', 'finished')),
  current_question_index integer not null default 0,
  started_at timestamptz,
  question_started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_name text not null,
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (room_id, player_name)
);

create table if not exists player_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  player_id uuid not null references room_players(id) on delete cascade,
  selected_option_id uuid references question_options(id) on delete set null,
  is_correct boolean not null default false,
  response_time_ms integer not null default 0,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  unique (room_id, question_id, player_id)
);

create index if not exists idx_questions_quiz_position on questions (quiz_id, position);
create index if not exists idx_options_question_position on question_options (question_id, position);
create index if not exists idx_room_players_room on room_players (room_id);
create index if not exists idx_player_answers_room_question on player_answers (room_id, question_id);

alter table quizzes enable row level security;
alter table questions enable row level security;
alter table question_options enable row level security;
alter table rooms enable row level security;
alter table room_players enable row level security;
alter table player_answers enable row level security;
alter table profiles enable row level security;

create policy "public read quizzes" on quizzes for select using (true);
create policy "public read questions" on questions for select using (true);
create policy "public read options" on question_options for select using (true);
create policy "public read rooms" on rooms for select using (true);
create policy "public read players" on room_players for select using (true);
create policy "public read answers" on player_answers for select using (true);

create policy "service role manage quizzes" on quizzes for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manage questions" on questions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manage options" on question_options for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manage rooms" on rooms for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manage players" on room_players for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manage answers" on player_answers for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manage profiles" on profiles for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
