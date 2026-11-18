-- Dubla Brasil AI · Dueto ("Dublar junto") e Notificações no app.
-- Rode DEPOIS de galeria.sql e perfil.sql. Pode rodar mais de uma vez sem problema.

-- ---------- Dueto: uma publicação pode ser "dublada junto" com outra ----------

alter table public.publicacoes add column if not exists dueto_de uuid references public.publicacoes (id) on delete set null;
alter table public.publicacoes add column if not exists dueto_apelido text;

-- O apelido de quem fez o dub original é preenchido pelo servidor (ninguém consegue inventar).
create or replace function public.preencher_dueto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dueto_de is null then
    new.dueto_apelido := null;
  else
    select pf.apelido into new.dueto_apelido
      from public.publicacoes p join public.perfis pf on pf.user_id = p.autor_id
     where p.id = new.dueto_de and not p.oculta;
    if new.dueto_apelido is null then
      new.dueto_de := null; -- o dub original não existe mais (ou foi ocultado)
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists publicacoes_dueto on public.publicacoes;
create trigger publicacoes_dueto
  before insert on public.publicacoes
  for each row execute function public.preencher_dueto();

-- ---------- Notificações ----------

create table if not exists public.notificacoes (
  id            uuid primary key default gen_random_uuid(),
  para          uuid not null references auth.users (id) on delete cascade,
  de            uuid references auth.users (id) on delete cascade,
  de_apelido    text,
  tipo          text not null check (tipo in ('curtida', 'comentario', 'dueto')),
  publicacao_id uuid references public.publicacoes (id) on delete cascade,
  cena_titulo   text,
  texto         text,
  lida          boolean not null default false,
  criada_em     timestamptz not null default now()
);

create index if not exists notificacoes_para on public.notificacoes (para, criada_em desc);
-- Uma curtida da mesma pessoa no mesmo dub avisa uma vez só (curtir, descurtir e curtir de novo não repete).
create unique index if not exists notificacoes_curtida_unica on public.notificacoes (para, de, publicacao_id) where tipo = 'curtida';

alter table public.notificacoes enable row level security;

drop policy if exists "cada um vê as suas notificações" on public.notificacoes;
create policy "cada um vê as suas notificações"
  on public.notificacoes for select
  to authenticated
  using (para = auth.uid());

drop policy if exists "cada um marca as suas como lidas" on public.notificacoes;
create policy "cada um marca as suas como lidas"
  on public.notificacoes for update
  to authenticated
  using (para = auth.uid())
  with check (para = auth.uid());

drop policy if exists "cada um apaga as suas" on public.notificacoes;
create policy "cada um apaga as suas"
  on public.notificacoes for delete
  to authenticated
  using (para = auth.uid());

-- Ninguém cria notificação pelo app: só os gatilhos abaixo. E só dá para mudar o "lida".
revoke insert, update on public.notificacoes from anon, authenticated;
grant select, delete on public.notificacoes to authenticated;
grant update (lida) on public.notificacoes to authenticated;

create or replace function public.criar_notificacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dono   uuid;
  titulo text;
  quem   uuid;
  alvo   uuid;
begin
  if tg_table_name = 'reacoes' then
    if new.valor <> 1 then return new; end if;
    quem := new.user_id;  alvo := new.publicacao_id;
  elsif tg_table_name = 'comentarios' then
    quem := new.autor_id; alvo := new.publicacao_id;
  else -- publicacoes (dueto)
    if new.dueto_de is null then return new; end if;
    quem := new.autor_id; alvo := new.dueto_de;
  end if;

  select autor_id, cena_titulo into dono, titulo from public.publicacoes where id = alvo;
  if dono is null or dono = quem then return new; end if; -- não avisa a própria pessoa

  if tg_table_name = 'reacoes' then
    insert into public.notificacoes (para, de, de_apelido, tipo, publicacao_id, cena_titulo)
    values (dono, quem, (select apelido from public.perfis where user_id = quem), 'curtida', alvo, titulo)
    on conflict (para, de, publicacao_id) where tipo = 'curtida' do nothing;
  elsif tg_table_name = 'comentarios' then
    insert into public.notificacoes (para, de, de_apelido, tipo, publicacao_id, cena_titulo, texto)
    values (dono, quem, (select apelido from public.perfis where user_id = quem), 'comentario', alvo, titulo, left(new.texto, 120));
  else
    -- O aviso abre o DUETO novo (para a pessoa ver como ficou).
    insert into public.notificacoes (para, de, de_apelido, tipo, publicacao_id, cena_titulo)
    values (dono, quem, (select apelido from public.perfis where user_id = quem), 'dueto', new.id, titulo);
  end if;

  -- Guarda só as 200 mais novas de cada pessoa.
  delete from public.notificacoes n
   where n.para = dono
     and n.id in (select id from public.notificacoes where para = dono order by criada_em desc offset 200);
  return new;
end;
$$;

drop trigger if exists notificar_curtida on public.reacoes;
create trigger notificar_curtida
  after insert or update of valor on public.reacoes
  for each row execute function public.criar_notificacao();

drop trigger if exists notificar_comentario on public.comentarios;
create trigger notificar_comentario
  after insert on public.comentarios
  for each row execute function public.criar_notificacao();

drop trigger if exists notificar_dueto on public.publicacoes;
create trigger notificar_dueto
  after insert on public.publicacoes
  for each row execute function public.criar_notificacao();
