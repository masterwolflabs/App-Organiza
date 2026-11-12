-- Migration: color de fondo y de borde de cada acción del Horario (Emanuel, 12 nov 2026). Idempotente.
-- Clic derecho (o mantener 2 s en el celular) en la tarjeta → pintar. Hex «#rrggbb»; null = sin color.
alter table public.organiza_items add column if not exists bg_color text;
alter table public.organiza_items add column if not exists border_color text;
