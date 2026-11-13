insert into public.species (scientific_name, common_name) values ('Testus va26', 'VA-26 test plant');
update public.species set common_name = 'VA-26 edited' where scientific_name = 'Testus va26';
delete from public.species where scientific_name = 'Testus va26';
select table_name, action, new_value->>'common_name' as name, new_value->>'email' as email, changed_at from public.audit_logs order by changed_at desc limit 5;