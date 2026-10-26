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

-- ---------- Assinaturas (planos por trocas/dia) ----------
-- Cola isto no SQL Editor e carrega em "Run". Podes correr mais do que uma vez sem estragar nada.

create table if not exists acessos (
  codigo        text primary key,
  nome          text not null default '',
  contacto      text not null default '',
  plano         text not null,               -- teste | basico | estudante | intensivo
  limite_diario int,                         -- opcional: limite próprio (manda sobre o do plano)
  inicio        date,                        -- 1.º dia de validade (no teste, preenche-se no 1.º uso)
  valido_ate    date,                        -- último dia de validade (inclusive, hora de Luanda)
  ativo         boolean not null default true,
  notas         text not null default '',
  criado_em     timestamptz not null default now()
);
alter table acessos enable row level security;

create table if not exists pagamentos (
  id        bigint generated always as identity primary key,
  codigo    text not null,
  plano     text not null,
  valor_kz  int  not null default 0,
  dias      int  not null,
  criado_em timestamptz not null default now()
);
alter table pagamentos enable row level security;
