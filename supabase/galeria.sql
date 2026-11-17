-- =====================================================================
-- Dubla Brasil AI — Galeria de dubs (rode DEPOIS do esquema.sql)
--
-- Como usar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar de novo sem problema: nada é apagado nem duplicado.
--
-- O que este arquivo cria:
--   • perfis: o apelido de cada pessoa (login anônimo, sem e-mail).
--   • publicacoes: os dubs publicados na galeria.
--   • reacoes: 👍 / 👎 (uma por pessoa em cada dub).
--   • comentarios: comentários nos dubs.
--   • denuncias: pessoas avisando que um dub é impróprio.
--   • pasta "dubs": os vídeos publicados (até 15 MB cada).
--   • permissões: cada pessoa só mexe no que é dela; o administrador
--     pode ocultar ou apagar qualquer publicação ou comentário.
-- =====================================================================


-- ---------- Perfis (apelidos) ----------

create table if not exists public.perfis (
  user_id   uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  apelido   text not null,
  criado_em timestamptz not null default now(),
  constraint apelido_tamanho check (char_length(apelido) between 3 and 20),
  constraint apelido_caracteres check (apelido ~ '^[A-Za-z0-9_.À-ÿ]+$')
);

create unique index if not exists perfis_apelido_unico on public.perfis (lower(apelido));

alter table public.perfis enable row level security;

drop policy if exists "todos veem apelidos" on public.perfis;
create policy "todos veem apelidos"
  on public.perfis for select
  to anon, authenticated
  using (true);

drop policy if exists "cada um cria o próprio perfil" on public.perfis;
create policy "cada um cria o próprio perfil"
  on public.perfis for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "cada um muda o próprio apelido" on public.perfis;
create policy "cada um muda o próprio apelido"
  on public.perfis for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ---------- Publicações ----------

create table if not exists public.publicacoes (
  id            uuid primary key default gen_random_uuid(),
  autor_id      uuid not null default auth.uid() references public.perfis (user_id) on delete cascade,
  cena_id       text references public.cenas (id) on delete set null,
  cena_titulo   text not null,
  papeis        text[] not null default '{}',   -- nomes dos personagens dublados
  video_path    text not null,                  -- caminho na pasta "dubs"
  capa_path     text,
  duracao_ms    integer not null default 0,
  oculta        boolean not null default false, -- moderação do administrador
  curtidas      integer not null default 0,
  descurtidas   integer not null default 0,
  comentarios   integer not null default 0,
  denuncias     integer not null default 0,
  criada_em     timestamptz not null default now()
);

create index if not exists publicacoes_feed on public.publicacoes (oculta, criada_em desc);
create index if not exists publicacoes_autor on public.publicacoes (autor_id);

alter table public.publicacoes enable row level security;

drop policy if exists "todos veem publicações visíveis" on public.publicacoes;
create policy "todos veem publicações visíveis"
  on public.publicacoes for select
  to anon, authenticated
  using (not oculta or autor_id = auth.uid() or public.eh_admin());

drop policy if exists "quem tem apelido publica" on public.publicacoes;
create policy "quem tem apelido publica"
  on public.publicacoes for insert
  to authenticated
  with check (
    autor_id = auth.uid()
    and exists (select 1 from public.perfis where user_id = auth.uid())
    and not oculta and curtidas = 0 and descurtidas = 0 and comentarios = 0 and denuncias = 0
  );

-- Só o administrador altera publicações (ocultar/mostrar). Os contadores mudam pelos gatilhos abaixo.
drop policy if exists "admin modera publicações" on public.publicacoes;
create policy "admin modera publicações"
  on public.publicacoes for update
  to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

drop policy if exists "autor ou admin apaga publicação" on public.publicacoes;
create policy "autor ou admin apaga publicação"
  on public.publicacoes for delete
  to authenticated
  using (autor_id = auth.uid() or public.eh_admin());


-- ---------- Reações (👍 / 👎) ----------

create table if not exists public.reacoes (
  publicacao_id uuid not null references public.publicacoes (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  valor         smallint not null check (valor in (-1, 1)),
  primary key (publicacao_id, user_id)
);

alter table public.reacoes enable row level security;

drop policy if exists "cada um vê as próprias reações" on public.reacoes;
create policy "cada um vê as próprias reações"
  on public.reacoes for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "cada um reage" on public.reacoes;
create policy "cada um reage"
  on public.reacoes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "cada um muda a própria reação" on public.reacoes;
create policy "cada um muda a própria reação"
  on public.reacoes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "cada um tira a própria reação" on public.reacoes;
create policy "cada um tira a própria reação"
  on public.reacoes for delete
  to authenticated
  using (user_id = auth.uid());


-- ---------- Comentários ----------

create table if not exists public.comentarios (
  id            uuid primary key default gen_random_uuid(),
  publicacao_id uuid not null references public.publicacoes (id) on delete cascade,
  autor_id      uuid not null default auth.uid() references public.perfis (user_id) on delete cascade,
  texto         text not null check (char_length(btrim(texto)) between 1 and 300),
  criado_em     timestamptz not null default now()
);

create index if not exists comentarios_publicacao on public.comentarios (publicacao_id, criado_em);

alter table public.comentarios enable row level security;

drop policy if exists "todos leem comentários" on public.comentarios;
create policy "todos leem comentários"
  on public.comentarios for select
  to anon, authenticated
  using (true);

drop policy if exists "quem tem apelido comenta" on public.comentarios;
create policy "quem tem apelido comenta"
  on public.comentarios for insert
  to authenticated
  with check (autor_id = auth.uid() and exists (select 1 from public.perfis where user_id = auth.uid()));

drop policy if exists "autor ou admin apaga comentário" on public.comentarios;
create policy "autor ou admin apaga comentário"
  on public.comentarios for delete
  to authenticated
  using (autor_id = auth.uid() or public.eh_admin());


-- ---------- Denúncias ----------

create table if not exists public.denuncias (
  publicacao_id uuid not null references public.publicacoes (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criada_em     timestamptz not null default now(),
  primary key (publicacao_id, user_id)
);

alter table public.denuncias enable row level security;

drop policy if exists "cada um denuncia" on public.denuncias;
create policy "cada um denuncia"
  on public.denuncias for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "cada um vê as próprias denúncias" on public.denuncias;
create policy "cada um vê as próprias denúncias"
  on public.denuncias for select
  to authenticated
  using (user_id = auth.uid() or public.eh_admin());


-- ---------- Contadores (mantidos automaticamente) ----------

create or replace function public.atualizar_contadores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pub uuid := coalesce(new.publicacao_id, old.publicacao_id);
begin
  update public.publicacoes p set
    curtidas    = (select count(*) from public.reacoes r where r.publicacao_id = pub and r.valor = 1),
    descurtidas = (select count(*) from public.reacoes r where r.publicacao_id = pub and r.valor = -1),
    comentarios = (select count(*) from public.comentarios c where c.publicacao_id = pub),
    denuncias   = (select count(*) from public.denuncias d where d.publicacao_id = pub)
  where p.id = pub;
  return null;
end;
$$;

drop trigger if exists contar_reacoes on public.reacoes;
create trigger contar_reacoes after insert or update or delete on public.reacoes
  for each row execute function public.atualizar_contadores();

drop trigger if exists contar_comentarios on public.comentarios;
create trigger contar_comentarios after insert or delete on public.comentarios
  for each row execute function public.atualizar_contadores();

drop trigger if exists contar_denuncias on public.denuncias;
create trigger contar_denuncias after insert or delete on public.denuncias
  for each row execute function public.atualizar_contadores();


-- ---------- Pasta "dubs" (vídeos publicados) ----------
-- Cada pessoa só envia para a própria pasta: dubs/<id-da-pessoa>/arquivo

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dubs', 'dubs', true, 15728640, array['video/mp4', 'video/webm', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "todos assistem dubs" on storage.objects;
create policy "todos assistem dubs"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'dubs');

drop policy if exists "cada um envia para a própria pasta" on storage.objects;
create policy "cada um envia para a própria pasta"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'dubs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "autor ou admin apaga dub" on storage.objects;
create policy "autor ou admin apaga dub"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'dubs' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_admin()));


-- ---------- Conferência ----------
select
  (select count(*) from public.perfis)      as perfis,
  (select count(*) from public.publicacoes) as publicacoes,
  (select count(*) from storage.buckets where id = 'dubs') as pasta_dubs;
