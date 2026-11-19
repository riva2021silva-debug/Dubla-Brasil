-- Dubla Brasil AI · Aviso de espaço: o administrador vê quanto as pastas de arquivos ("midias" e "dubs") ocupam,
-- para o app avisar a hora de liberar espaço. Só lê os tamanhos; não muda nada. Pode rodar mais de uma vez.

create or replace function public.admin_uso_armazenamento()
returns table (pasta text, arquivos bigint, bytes bigint)
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if not public.eh_admin() then
    raise exception 'Só o administrador pode fazer isso.';
  end if;
  return query
    select o.bucket_id::text, count(*)::bigint, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
      from storage.objects o
     group by o.bucket_id;
end;
$$;

revoke all on function public.admin_uso_armazenamento() from public, anon;
grant execute on function public.admin_uso_armazenamento() to authenticated;

select 'aviso de espaço pronto' as resultado;
