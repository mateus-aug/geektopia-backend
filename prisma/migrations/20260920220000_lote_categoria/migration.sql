-- Categoria do lote de ingresso (Inteira, Meia, Meet & Greet, Meia solidária),
-- usada para agrupar os lotes na página pública do evento.

-- CreateEnum
CREATE TYPE "CategoriaIngressoEnum" AS ENUM ('Inteira', 'Meia', 'MeetGreet', 'MeiaSolidaria', 'Outro');

-- AlterTable: os lotes existentes nascem como Inteira
ALTER TABLE "Lote" ADD COLUMN     "categoria" "CategoriaIngressoEnum" NOT NULL DEFAULT 'Inteira';

-- Classificação inicial dos lotes que já existem, pelo nome (o admin pode ajustar
-- depois na aba Ingressos). Ordem importa: solidária e meet & greet antes de meia.
UPDATE "Lote" SET "categoria" = 'MeetGreet'     WHERE "nome_lote" ILIKE '%meet%';
UPDATE "Lote" SET "categoria" = 'MeiaSolidaria' WHERE "categoria" = 'Inteira' AND "nome_lote" ILIKE '%solid%';
UPDATE "Lote" SET "categoria" = 'Meia'          WHERE "categoria" = 'Inteira' AND "nome_lote" ILIKE '%meia%';
