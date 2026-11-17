-- =====================================================================
-- Dubla Brasil AI — estrutura do servidor (Supabase)
--
-- Como usar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar de novo sem problema: nada é apagado nem duplicado.
--
-- O que este arquivo cria:
--   • administradores: quem pode cadastrar, editar e excluir.
--     O PRIMEIRO usuário criado em Authentication vira administrador.
--   • cenas: vídeos para dublar (personagens e falas ficam dentro da cena).
--   • sons: sons curtos do Modo Imitação.
--   • midias: pasta de arquivos (vídeos, trilhas, capas e sons).
--   • permissões: qualquer pessoa só LÊ o que está publicado;
--     só administrador logado cadastra, edita e exclui.
-- =====================================================================


-- ---------- Administradores ----------

create table if not exists public.administradores (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.administradores enable row level security;

-- Cada pessoa logada só consegue ver se ELA MESMA é administradora.
drop policy if exists "ver o próprio cadastro de admin" on public.administradores;
create policy "ver o próprio cadastro de admin"
  on public.administradores for select
  to authenticated
  using (user_id = auth.uid());

-- Responde se quem está logado é administrador (usado pelas permissões).
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.administradores where user_id = auth.uid());
$$;

grant execute on function public.eh_admin() to anon, authenticated;

-- O primeiro usuário cadastrado vira administrador automaticamente.
create or replace function public.primeiro_usuario_vira_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.administradores) then
    insert into public.administradores (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists primeiro_usuario_vira_admin on auth.users;
create trigger primeiro_usuario_vira_admin
  after insert on auth.users
  for each row execute function public.primeiro_usuario_vira_admin();

-- Se você já tinha criado um usuário antes de rodar este arquivo, ele vira o administrador.
insert into public.administradores (user_id)
select id from auth.users order by created_at limit 1
on conflict do nothing;


-- ---------- Atualização automática da data de edição ----------

create or replace function public.marcar_atualizacao()
returns trigger
language plpgsql
as $$
begin
  new.atualizada_em := now();
  return new;
end;
$$;


-- ---------- Cenas ----------

create table if not exists public.cenas (
  id            text primary key,
  titulo        text not null,
  descricao     text not null default '',
  idioma        text not null default 'Português (Brasil)',
  duracao_ms    integer not null default 0,
  video_path    text not null,          -- caminho do vídeo na pasta "midias"
  fundo_path    text,                   -- trilha de fundo (sem vozes), opcional
  capa_path     text,                   -- imagem de capa, opcional
  personagens   jsonb not null default '[]'::jsonb,  -- [{id, nome, cor}]
  falas         jsonb not null default '[]'::jsonb,  -- [{id, personagemId, texto, inicioMs, fimMs}]
  publicada     boolean not null default false,
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index if not exists cenas_publicadas on public.cenas (publicada, atualizada_em desc);

drop trigger if exists cenas_marcar_atualizacao on public.cenas;
create trigger cenas_marcar_atualizacao
  before update on public.cenas
  for each row execute function public.marcar_atualizacao();

alter table public.cenas enable row level security;

drop policy if exists "todos leem cenas publicadas" on public.cenas;
create policy "todos leem cenas publicadas"
  on public.cenas for select
  to anon, authenticated
  using (publicada or public.eh_admin());

drop policy if exists "admin cadastra cenas" on public.cenas;
create policy "admin cadastra cenas"
  on public.cenas for insert
  to authenticated
  with check (public.eh_admin());

drop policy if exists "admin edita cenas" on public.cenas;
create policy "admin edita cenas"
  on public.cenas for update
  to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

drop policy if exists "admin exclui cenas" on public.cenas;
create policy "admin exclui cenas"
  on public.cenas for delete
  to authenticated
  using (public.eh_admin());


-- ---------- Sons (Modo Imitação) ----------

create table if not exists public.sons (
  id            text primary key,
  titulo        text not null,
  categoria     text not null default 'Outros',
  emoji         text not null default '',
  audio_path    text not null,          -- caminho do áudio na pasta "midias"
  duracao_ms    integer not null default 0,
  publicada     boolean not null default false,
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index if not exists sons_publicados on public.sons (publicada, criada_em desc);

drop trigger if exists sons_marcar_atualizacao on public.sons;
create trigger sons_marcar_atualizacao
  before update on public.sons
  for each row execute function public.marcar_atualizacao();

alter table public.sons enable row level security;

drop policy if exists "todos leem sons publicados" on public.sons;
create policy "todos leem sons publicados"
  on public.sons for select
  to anon, authenticated
  using (publicada or public.eh_admin());

drop policy if exists "admin cadastra sons" on public.sons;
create policy "admin cadastra sons"
  on public.sons for insert
  to authenticated
  with check (public.eh_admin());

drop policy if exists "admin edita sons" on public.sons;
create policy "admin edita sons"
  on public.sons for update
  to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

drop policy if exists "admin exclui sons" on public.sons;
create policy "admin exclui sons"
  on public.sons for delete
  to authenticated
  using (public.eh_admin());


-- ---------- Pasta de arquivos "midias" ----------
-- Pública para leitura (o app toca os vídeos direto pelo link).
-- Limite de 50 MB por arquivo (o máximo do plano grátis do Supabase).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'midias', 'midias', true, 52428800,
  array['video/mp4', 'video/webm', 'video/quicktime',
        'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
        'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "todos leem midias" on storage.objects;
create policy "todos leem midias"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'midias');

drop policy if exists "admin envia midias" on storage.objects;
create policy "admin envia midias"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'midias' and public.eh_admin());

drop policy if exists "admin troca midias" on storage.objects;
create policy "admin troca midias"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'midias' and public.eh_admin())
  with check (bucket_id = 'midias' and public.eh_admin());

drop policy if exists "admin apaga midias" on storage.objects;
create policy "admin apaga midias"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'midias' and public.eh_admin());


-- ---------- Conferência ----------
-- O resultado abaixo mostra o que foi criado. "administradores" mostra 1
-- se você já criou o seu usuário em Authentication; senão mostra 0, e o
-- primeiro usuário que você criar vira administrador.

select
  (select count(*) from public.administradores) as administradores,
  (select count(*) from public.cenas)           as cenas,
  (select count(*) from public.sons)            as sons,
  (select count(*) from storage.buckets where id = 'midias') as pasta_midias;

-- Para adicionar OUTRO administrador depois (troque o e-mail e rode só esta linha):
-- insert into public.administradores (user_id) select id from auth.users where email = 'email@exemplo.com' on conflict do nothing;
