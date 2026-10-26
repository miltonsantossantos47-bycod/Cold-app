-- Cola isto no Supabase: menu "SQL Editor" -> "New query" -> cola -> "Run".
-- Cria a tabela onde o Cold guarda o uso por código e por dia.

create table if not exists uso_diario (
  codigo     text   not null,
  dia        date   not null,
  trocas     int    not null default 0,
  tokens_in  bigint not null default 0,
  tokens_out bigint not null default 0,
  primary key (codigo, dia)
);

-- Sem políticas: só o servidor (service role) consegue ler e escrever.
alter table uso_diario enable row level security;

create or replace function registar_uso(p_codigo text, p_dia date, p_in int, p_out int)
returns void
language sql
as $$
  insert into uso_diario (codigo, dia, trocas, tokens_in, tokens_out)
  values (p_codigo, p_dia, 1, p_in, p_out)
  on conflict (codigo, dia) do update
  set trocas     = uso_diario.trocas + 1,
      tokens_in  = uso_diario.tokens_in + excluded.tokens_in,
      tokens_out = uso_diario.tokens_out + excluded.tokens_out;
$$;
