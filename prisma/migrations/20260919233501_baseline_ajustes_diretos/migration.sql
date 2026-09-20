-- Migração de "nivelamento" (baseline).
--
-- Este arquivo não foi gerado automaticamente a partir de uma mudança nova:
-- ele documenta duas alterações que já existiam no banco de dados do Supabase
-- mas nunca tinham virado uma migração de verdade (foram feitas direto pelo
-- banco, ou nasceram junto com uma alteração de schema.prisma que não chegou
-- a rodar `prisma migrate dev`). Quando aplicado com `prisma migrate resolve
-- --applied`, ele só atualiza o controle interno do Prisma — o banco já está
-- neste estado, então nenhum comando abaixo precisa (nem deve) ser executado
-- de fato.

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "estado" VARCHAR(2);

-- CreateEnum
CREATE TYPE "TipoEdicaoGeektopiaEnum" AS ENUM ('Principal', 'Pocket');

-- AlterTable
ALTER TABLE "Geektopia" ADD COLUMN "tipo_edicao" "TipoEdicaoGeektopiaEnum" NOT NULL DEFAULT 'Pocket';
