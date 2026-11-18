-- Dubla Brasil AI — Foto de perfil. Rode no SQL Editor do Supabase (New query → colar → Run). Pode rodar mais de uma vez.
-- A foto fica na pasta "dubs", dentro da pasta da própria pessoa (as regras de envio dessa pasta já existem).
alter table public.perfis add column if not exists foto_path text;

-- Cada um só pode apontar para uma foto na própria pasta.
alter table public.perfis drop constraint if exists foto_na_propria_pasta;
alter table public.perfis add constraint foto_na_propria_pasta
  check (foto_path is null or (char_length(foto_path) <= 120 and foto_path like user_id::text || '/avatar-%'));

select 'perfil pronto' as resultado;
