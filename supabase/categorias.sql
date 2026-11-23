-- Categorias (versão 5.8): gênero de cada cena (Ação, Comédia, Anime…), para filtrar na tela de Cenas.
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
alter table public.cenas add column if not exists genero text;
select 'categorias prontas' as resultado;
