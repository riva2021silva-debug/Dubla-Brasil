-- Dubla Brasil AI · Modo Cantar: uma "cena" pode ser uma música (karaokê com nota de afinação).
-- tipo: 'cena' (dublagem) ou 'musica' (cantar). voz_path: a voz do cantor separada pela IA (para dar a nota).
-- Pode rodar mais de uma vez.

alter table public.cenas add column if not exists tipo text not null default 'cena';
alter table public.cenas add column if not exists voz_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cenas_tipo_valido') then
    alter table public.cenas add constraint cenas_tipo_valido check (tipo in ('cena', 'musica'));
  end if;
end $$;

select 'modo cantar pronto' as resultado;
