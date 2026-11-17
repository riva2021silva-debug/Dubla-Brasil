-- Dubla Brasil AI — Assinatura Premium (R$ 19,90/mês) e limite de 3 dublagens grátis por dia.
-- Rode DEPOIS de esquema.sql e galeria.sql (no SQL Editor do Supabase: New query → colar → Run).
-- Pode rodar mais de uma vez sem problema.

-- ===== Quem é assinante =====
-- Ninguém grava aqui pelo app: só o administrador (pelas funções abaixo) ou o sistema de pagamento (pelo servidor).
create table if not exists public.assinantes (
  user_id uuid primary key references auth.users on delete cascade,
  premium_ate timestamptz not null,
  origem text not null default 'manual',          -- manual | checkout | google_play
  referencia text,                                 -- código da compra na plataforma de pagamento
  atualizado_em timestamptz not null default now()
);
alter table public.assinantes enable row level security;

drop policy if exists "ver a própria assinatura" on public.assinantes;
create policy "ver a própria assinatura"
  on public.assinantes for select
  to authenticated
  using (user_id = auth.uid() or public.eh_admin());

-- ===== Uso diário (para o limite grátis) =====
create table if not exists public.uso_diario (
  user_id uuid not null references auth.users on delete cascade,
  dia date not null,
  dublagens int not null default 0,
  primary key (user_id, dia)
);
alter table public.uso_diario enable row level security;

drop policy if exists "ver o próprio uso" on public.uso_diario;
create policy "ver o próprio uso"
  on public.uso_diario for select
  to authenticated
  using (user_id = auth.uid() or public.eh_admin());

-- O "dia" vira à meia-noite de Brasília.
create or replace function public.hoje_br()
returns date language sql stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.sou_premium()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.eh_admin()
      or exists (select 1 from public.assinantes where user_id = auth.uid() and premium_ate > now())
$$;

-- Plano da pessoa: premium?, até quando, quantas dublagens grátis usou hoje e o limite.
create or replace function public.meu_plano()
returns json language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'premium', public.sou_premium(),
    'premium_ate', (select premium_ate from public.assinantes where user_id = auth.uid()),
    'usadas_hoje', coalesce((select dublagens from public.uso_diario where user_id = auth.uid() and dia = public.hoje_br()), 0),
    'limite', 3
  )
$$;

-- Conta uma dublagem nova. Devolve ok=false quando a pessoa grátis já usou as 3 de hoje.
create or replace function public.usar_dublagem()
returns json language plpgsql volatile security definer set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'Entre no app para dublar.';
  end if;
  if public.sou_premium() then
    return json_build_object('ok', true, 'premium', true, 'usadas', 0, 'limite', 3);
  end if;
  insert into public.uso_diario as u (user_id, dia, dublagens)
  values (auth.uid(), public.hoje_br(), 1)
  on conflict (user_id, dia) do update set dublagens = u.dublagens + 1
    where u.dublagens < 3
  returning dublagens into n;
  if n is null then
    return json_build_object('ok', false, 'premium', false, 'usadas', 3, 'limite', 3);
  end if;
  return json_build_object('ok', true, 'premium', false, 'usadas', n, 'limite', 3);
end
$$;

-- ===== Funções do administrador =====
-- Dá (ou tira, com dias = 0) o Premium para alguém, achando a pessoa pelo e-mail ou pelo apelido.
create or replace function public.admin_definir_premium(busca text, dias int)
returns json language plpgsql volatile security definer set search_path = public
as $$
declare
  alvo uuid;
  ate timestamptz;
begin
  if not public.eh_admin() then
    raise exception 'Só o administrador pode fazer isso.';
  end if;
  select u.id into alvo from auth.users u where lower(u.email) = lower(trim(busca)) limit 1;
  if alvo is null then
    select p.user_id into alvo from public.perfis p where lower(p.apelido) = lower(trim(leading '@' from trim(busca))) limit 1;
  end if;
  if alvo is null then
    raise exception 'Ninguém encontrado com esse e-mail ou apelido.';
  end if;
  if dias <= 0 then
    delete from public.assinantes where user_id = alvo;
    return json_build_object('user_id', alvo, 'premium_ate', null);
  end if;
  insert into public.assinantes as a (user_id, premium_ate, origem)
  values (alvo, now() + make_interval(days => dias), 'manual')
  on conflict (user_id) do update
    set premium_ate = greatest(a.premium_ate, now()) + make_interval(days => dias),
        atualizado_em = now()
  returning premium_ate into ate;
  return json_build_object('user_id', alvo, 'premium_ate', ate);
end
$$;

-- Lista de assinantes para a área do administrador.
create or replace function public.admin_listar_assinantes()
returns table (user_id uuid, email text, apelido text, premium_ate timestamptz, origem text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Só o administrador pode fazer isso.';
  end if;
  return query
    select a.user_id, u.email::text, p.apelido, a.premium_ate, a.origem
    from public.assinantes a
    left join auth.users u on u.id = a.user_id
    left join public.perfis p on p.user_id = a.user_id
    order by a.premium_ate desc;
end
$$;

revoke all on function public.usar_dublagem() from public, anon;
revoke all on function public.admin_definir_premium(text, int) from public, anon;
revoke all on function public.admin_listar_assinantes() from public, anon;
grant execute on function public.hoje_br(), public.sou_premium(), public.meu_plano() to anon, authenticated;
grant execute on function public.usar_dublagem(), public.admin_definir_premium(text, int), public.admin_listar_assinantes() to authenticated;

select 'assinatura pronta' as resultado;
