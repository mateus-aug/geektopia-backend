-- Idade mínima por lote de ingresso (10/12/14/16/18).
-- Nulo = o lote herda a classificação indicativa da edição
-- (Geektopia.classificacao_etaria). Só o campo: a validação na venda
-- fica a cargo do fluxo de ingressos.

-- AlterTable
ALTER TABLE "Lote" ADD COLUMN     "idade_minima" INTEGER;

-- O Prisma não expressa CHECK no schema, por isso é SQL manual.
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_idade_minima_check"
  CHECK ("idade_minima" IS NULL OR "idade_minima" IN (10, 12, 14, 16, 18));
