-- Idade no ingresso.
--   idade_minima: idade exigida quando o ingresso foi emitido (copia o valor
--     efetivo do lote/edicao naquele momento, entao nao muda depois).
--   data_nascimento_titular: data de nascimento de quem vai usar o ingresso.
-- Somente o campo: quem preenche e valida e o fluxo de ingressos.

-- AlterTable
ALTER TABLE "Ingresso" ADD COLUMN     "data_nascimento_titular" DATE,
ADD COLUMN     "idade_minima" INTEGER;

-- O Prisma nao expressa CHECK no schema, por isso e SQL manual.
ALTER TABLE "Ingresso" ADD CONSTRAINT "Ingresso_idade_minima_check"
  CHECK ("idade_minima" IS NULL OR "idade_minima" IN (0, 10, 12, 14, 16, 18));
