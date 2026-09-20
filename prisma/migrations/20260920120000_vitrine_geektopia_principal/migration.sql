-- Vitrine da Geektopia Principal: convidados, fotos da edição, textos/cor
-- editáveis, logo do expositor e o estado "PrincipalAnterior".

-- AlterEnum
ALTER TYPE "TipoEdicaoGeektopiaEnum" ADD VALUE 'PrincipalAnterior';

-- AlterTable
ALTER TABLE "Expositor" ADD COLUMN     "url_logo" TEXT;

-- AlterTable
ALTER TABLE "Geektopia" ADD COLUMN     "cor_destaque" VARCHAR(7),
ADD COLUMN     "destaques" JSONB,
ADD COLUMN     "tagline" VARCHAR(200),
ADD COLUMN     "texto_sobre" TEXT;

-- CreateTable
CREATE TABLE "Convidado" (
    "id_convidado" SERIAL NOT NULL,
    "id_geektopia" INTEGER NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "titulo_papel" VARCHAR(100),
    "descricao" TEXT,
    "foto_url" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Convidado_pkey" PRIMARY KEY ("id_convidado")
);

-- CreateTable
CREATE TABLE "Foto_Edicao" (
    "id_foto" SERIAL NOT NULL,
    "id_geektopia" INTEGER NOT NULL,
    "url_foto" TEXT NOT NULL,
    "legenda" VARCHAR(200),
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Foto_Edicao_pkey" PRIMARY KEY ("id_foto")
);

-- CreateIndex
CREATE INDEX "Convidado_id_geektopia_ordem_idx" ON "Convidado"("id_geektopia", "ordem");

-- CreateIndex
CREATE INDEX "Foto_Edicao_id_geektopia_ordem_idx" ON "Foto_Edicao"("id_geektopia", "ordem");

-- AddForeignKey
ALTER TABLE "Convidado" ADD CONSTRAINT "Convidado_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto_Edicao" ADD CONSTRAINT "Foto_Edicao_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE CASCADE ON UPDATE CASCADE;

-- Garante no próprio banco que só existe UMA edição Principal por vez.
-- O Prisma não expressa índice parcial no schema, por isso é SQL manual.
CREATE UNIQUE INDEX "Geektopia_unico_principal" ON "Geektopia" ("tipo_edicao") WHERE "tipo_edicao" = 'Principal';
