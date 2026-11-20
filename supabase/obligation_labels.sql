-- Custom title for a recurring payment (for example "Rent #14" or "Rent Unit B"),
-- so homes with many units are easy to tell apart. Safe to run more than once.
alter table obligations add column if not exists label text;
