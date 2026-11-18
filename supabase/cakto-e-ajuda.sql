-- Dubla Brasil AI — Pagamentos da Cakto (liberar/encerrar Premium sozinho) e mensagens de Ajuda.
-- Rode DEPOIS de assinatura.sql (SQL Editor → New query → colar → Run). Pode rodar mais de uma vez.

-- =====================================================================
-- 1) CAKTO
-- =====================================================================

-- Tudo o que a Cakto mandar fica registrado aqui (para o administrador conferir).
create table if not exists public.pagamentos_log (
  id          bigint generated always as identity primary key,
  recebido_em timestamptz not null default now(),
  evento      text,
  email       text,
  valido      boolean not null default false,
  resultado   text,
  corpo       jsonb
);
alter table public.pagamentos_log enable row level security;
drop policy if exists "admin vê pagamentos" on public.pagamentos_log;
create policy "admin vê pagamentos" on public.pagamentos_log for select to authenticated using (public.eh_admin());

-- Quem pagou antes de criar a conta no app (o Premium é entregue quando a conta com o mesmo e-mail for criada).
create table if not exists public.assinaturas_pendentes (
  email        text primary key,
  premium_ate  timestamptz not null,
  referencia   text,
  criado_em    timestamptz not null default now()
);
alter table public.assinaturas_pendentes enable row level security;
drop policy if exists "admin vê pendentes" on public.assinaturas_pendentes;
create policy "admin vê pendentes" on public.assinaturas_pendentes for select to authenticated using (public.eh_admin());

-- Aplica um aviso da Cakto. Só o servidor (Edge Function com a chave secreta) pode chamar.
--   liberar   → Premium por mais 32 dias a partir de hoje (pagamento aprovado / renovação)
--   encerrar  → Premium acaba agora (reembolso / chargeback)
--   cancelar  → não renova: o Premium vale até o fim do período já pago
create or replace function public.cakto_aplicar(p_email text, p_acao text, p_referencia text, p_evento text, p_corpo jsonb)
returns text language plpgsql volatile security definer set search_path = public
as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  alvo uuid;
  r text;
begin
  if e = '' then
    r := 'sem e-mail no aviso';
  else
    select id into alvo from auth.users where lower(email) = e limit 1;
    if p_acao = 'liberar' then
      if alvo is not null then
        insert into public.assinantes as a (user_id, premium_ate, origem, referencia)
        values (alvo, now() + interval '32 days', 'checkout', p_referencia)
        on conflict (user_id) do update
          set premium_ate = greatest(a.premium_ate, now() + interval '32 days'),
              origem = 'checkout', referencia = coalesce(p_referencia, a.referencia), atualizado_em = now();
        r := 'Premium liberado';
      else
        insert into public.assinaturas_pendentes as p (email, premium_ate, referencia)
        values (e, now() + interval '32 days', p_referencia)
        on conflict (email) do update set premium_ate = greatest(p.premium_ate, now() + interval '32 days'), referencia = coalesce(p_referencia, p.referencia);
        r := 'pago, aguardando a pessoa criar a conta com este e-mail';
      end if;
    elsif p_acao = 'encerrar' then
      update public.assinantes set premium_ate = now(), atualizado_em = now() where user_id = alvo;
      delete from public.assinaturas_pendentes where email = e;
      r := 'Premium encerrado';
    elsif p_acao = 'cancelar' then
      update public.assinantes set origem = 'checkout (cancelada)', atualizado_em = now() where user_id = alvo;
      r := 'assinatura cancelada: vale até o fim do período pago';
    else
      r := 'evento só registrado';
    end if;
  end if;
  insert into public.pagamentos_log (evento, email, valido, resultado, corpo) values (p_evento, e, true, r, p_corpo);
  return r;
end
$$;

-- Registra avisos recusados (segredo errado) — sem mexer em ninguém.
create or replace function public.cakto_recusado(p_evento text, p_email text, p_corpo jsonb)
returns void language sql volatile security definer set search_path = public
as $$ insert into public.pagamentos_log (evento, email, valido, resultado, corpo) values (p_evento, lower(p_email), false, 'recusado: segredo não confere', p_corpo) $$;

revoke all on function public.cakto_aplicar(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.cakto_recusado(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cakto_aplicar(text, text, text, text, jsonb), public.cakto_recusado(text, text, jsonb) to service_role;

-- Quem pagou antes e cria a conta depois (ou entra com o e-mail) recebe o Premium.
create or replace function public.entregar_pendente()
returns trigger language plpgsql security definer set search_path = public
as $$
declare p record;
begin
  if new.email is null then return new; end if;
  select * into p from public.assinaturas_pendentes where email = lower(new.email);
  if found then
    insert into public.assinantes as a (user_id, premium_ate, origem, referencia)
    values (new.id, p.premium_ate, 'checkout', p.referencia)
    on conflict (user_id) do update set premium_ate = greatest(a.premium_ate, excluded.premium_ate), origem = 'checkout', atualizado_em = now();
    delete from public.assinaturas_pendentes where email = p.email;
  end if;
  return new;
end
$$;
drop trigger if exists entregar_pendente on auth.users;
create trigger entregar_pendente after insert or update of email on auth.users
  for each row execute function public.entregar_pendente();

-- Para o administrador ver os últimos avisos da Cakto.
create or replace function public.admin_listar_pagamentos()
returns table (recebido_em timestamptz, evento text, email text, valido boolean, resultado text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador pode fazer isso.'; end if;
  return query select l.recebido_em, l.evento, l.email, l.valido, l.resultado from public.pagamentos_log l order by l.id desc limit 50;
end
$$;
revoke all on function public.admin_listar_pagamentos() from public, anon;
grant execute on function public.admin_listar_pagamentos() to authenticated;

-- =====================================================================
-- 2) AJUDA — mensagens dos usuários para o administrador
-- =====================================================================
create table if not exists public.mensagens_ajuda (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo        text not null check (tipo in ('problema', 'duvida', 'pagamento', 'sugestao')),
  texto       text not null check (char_length(btrim(texto)) between 5 and 2000),
  contato     text check (contato is null or char_length(contato) <= 120),
  aparelho    text check (aparelho is null or char_length(aparelho) <= 300),
  versao      text check (versao is null or char_length(versao) <= 20),
  status      text not null default 'nova' check (status in ('nova', 'lida', 'resolvida')),
  resposta    text check (resposta is null or char_length(resposta) <= 2000),
  criada_em   timestamptz not null default now(),
  respondida_em timestamptz
);
create index if not exists mensagens_ajuda_status on public.mensagens_ajuda (status, criada_em desc);
alter table public.mensagens_ajuda enable row level security;

drop policy if exists "cada um vê as próprias mensagens" on public.mensagens_ajuda;
create policy "cada um vê as próprias mensagens" on public.mensagens_ajuda for select to authenticated
  using (user_id = auth.uid() or public.eh_admin());

-- Qualquer pessoa com sessão (até sem e-mail) pode mandar, até 5 por dia, sempre como "nova" e sem resposta.
drop policy if exists "cada um manda mensagem" on public.mensagens_ajuda;
create policy "cada um manda mensagem" on public.mensagens_ajuda for insert to authenticated
  with check (
    user_id = auth.uid() and status = 'nova' and resposta is null and respondida_em is null
    and (select count(*) from public.mensagens_ajuda m where m.user_id = auth.uid() and m.criada_em > now() - interval '1 day') < 5
  );

drop policy if exists "admin responde" on public.mensagens_ajuda;
create policy "admin responde" on public.mensagens_ajuda for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "admin apaga mensagem" on public.mensagens_ajuda;
create policy "admin apaga mensagem" on public.mensagens_ajuda for delete to authenticated using (public.eh_admin());

select 'cakto e ajuda prontos' as resultado;
