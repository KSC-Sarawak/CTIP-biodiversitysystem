alter table specimens disable trigger trg_guard_specimen;
update specimens set endangered_override = true where qr_id = 'NIAH-0901';
alter table specimens enable trigger trg_guard_specimen;
select qr_id, endangered_override from specimens where qr_id in ('NIAH-0901','NIAH-0902');