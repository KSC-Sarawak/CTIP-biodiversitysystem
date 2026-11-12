-- CTIP-116: a botanist's phone keeps a few "reserved" QR tags so a plant can be
-- tagged with no signal. A botanist may release (delete) a tag they reserved
-- themselves, only while it is still unassigned. They still cannot edit or delete
-- any other tag (see 20261104130000). The API checks that no plant is on the tag
-- and that the tag was never printed. Safe to run twice.

drop policy if exists "qr: botanist release own reserved" on public.qr_tags;
create policy "qr: botanist release own reserved" on public.qr_tags for delete to authenticated
  using (
    public.my_role() = 'botanist'
    and created_by = auth.uid()
    and batch_label = 'reserved'
    and status = 'unassigned'
  );
