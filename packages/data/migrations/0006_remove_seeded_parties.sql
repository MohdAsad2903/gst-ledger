-- 0006_remove_seeded_parties.sql
-- Migration 6: Remove fabricated parties seeded in migration 0005.
-- Hard delete all rows matching id prefix 'party-%'.

DELETE FROM parties WHERE id LIKE 'party-%';
