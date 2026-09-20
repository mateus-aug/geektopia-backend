-- Classificação indicativa da edição (0 = livre, ou 10/12/14/16/18 anos).
-- Nulo significa "não informada". O texto livre regras_idade_minima continua
-- existindo para observações (ex.: "menores só acompanhados").

-- AlterTable
ALTER TABLE "Geektopia" ADD COLUMN     "classificacao_etaria" INTEGER;

-- O Prisma não expressa CHECK no schema, por isso é SQL manual.
ALTER TABLE "Geektopia" ADD CONSTRAINT "Geektopia_classificacao_etaria_check"
  CHECK ("classificacao_etaria" IS NULL OR "classificacao_etaria" IN (0, 10, 12, 14, 16, 18));
