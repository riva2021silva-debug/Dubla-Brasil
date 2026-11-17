-- Dubla Brasil AI — "Excluir minha conta" (exigência da Google Play e da App Store).
-- Rode no SQL Editor do Supabase (New query → colar → Run). Pode rodar mais de uma vez.
-- Apaga a pessoa e, em cascata, o apelido, as publicações, comentários, curtidas, denúncias, uso e assinatura.
-- (Os arquivos de vídeo da galeria são apagados pelo app antes, pela API de arquivos.)
create or replace function public.apagar_minha_conta()
returns void language plpgsql volatile security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta primeiro.';
  end if;
  if public.eh_admin() then
    raise exception 'A conta do administrador não pode ser apagada pelo app.';
  end if;
  delete from auth.users where id = auth.uid();
end
$$;

revoke all on function public.apagar_minha_conta() from public, anon;
grant execute on function public.apagar_minha_conta() to authenticated;

select 'exclusão de conta pronta' as resultado;
