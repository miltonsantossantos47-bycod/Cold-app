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

-- ---------- Contas com Google: historial de chats e ligação código <-> conta ----------
alter table acessos add column if not exists user_id uuid;
create index if not exists acessos_user on acessos (user_id);

create table if not exists chats (
  user_id         uuid    not null,
  id              text    not null,
  titulo          text    not null default '',
  titulo_definido boolean not null default false,
  perfil          jsonb   not null default '{}',
  msgs            jsonb   not null default '[]',
  criado          bigint  not null default 0,
  atualizado      bigint  not null default 0,
  apagado         boolean not null default false,
  primary key (user_id, id)
);
create index if not exists chats_user on chats (user_id, atualizado desc);
alter table chats enable row level security;

-- ---------- Planos reservados a um email (o plano aparece quando a pessoa entra com esse Google) ----------
alter table acessos add column if not exists email text;
alter table acessos add column if not exists email_chave text;
create index if not exists acessos_email_chave on acessos (email_chave);

-- ---------- Pedidos de plano (a pessoa pede, paga por Express, e tu confirmas no painel) ----------
create table if not exists pedidos (
  ref           text primary key,
  user_id       uuid not null,
  email         text not null default '',
  nome          text not null default '',
  tipo          text not null,                 -- basico | estudante | intensivo | personalizado
  trocas_dia    int  not null,
  dias          int  not null,
  preco_kz      int  not null,
  quando        text not null default 'depois',  -- agora | depois
  estado        text not null default 'pendente', -- pendente | confirmado | cancelado
  codigo        text,
  criado_em     timestamptz not null default now(),
  confirmado_em timestamptz
);
create index if not exists pedidos_user on pedidos (user_id, criado_em desc);
create index if not exists pedidos_estado on pedidos (estado);
alter table pedidos enable row level security;


-- ===== Cache de prompts: tokens de cache no registo de uso (idempotente) =====
alter table uso_diario add column if not exists cache_escrita_5m bigint not null default 0;
alter table uso_diario add column if not exists cache_escrita_1h bigint not null default 0;
alter table uso_diario add column if not exists cache_leitura bigint not null default 0;

create or replace function registar_uso_cache(
  p_codigo text, p_dia date, p_in int, p_out int, p_escrita_5m int, p_escrita_1h int, p_leitura int)
returns void language sql as $$
  insert into uso_diario (codigo, dia, trocas, tokens_in, tokens_out, cache_escrita_5m, cache_escrita_1h, cache_leitura)
  values (p_codigo, p_dia, 1, p_in, p_out, p_escrita_5m, p_escrita_1h, p_leitura)
  on conflict (codigo, dia) do update
  set trocas           = uso_diario.trocas + 1,
      tokens_in        = uso_diario.tokens_in + excluded.tokens_in,
      tokens_out       = uso_diario.tokens_out + excluded.tokens_out,
      cache_escrita_5m = uso_diario.cache_escrita_5m + excluded.cache_escrita_5m,
      cache_escrita_1h = uso_diario.cache_escrita_1h + excluded.cache_escrita_1h,
      cache_leitura    = uso_diario.cache_leitura + excluded.cache_leitura;
$$;
