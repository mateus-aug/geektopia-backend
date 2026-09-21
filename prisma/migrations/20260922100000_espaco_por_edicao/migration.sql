-- Espaços de exposição passam a pertencer a uma edição (o local, as mesas e os
-- preços mudam de uma Geektopia para outra).

-- AlterTable
ALTER TABLE "Espaco" ADD COLUMN "id_geektopia" INTEGER;

-- Espaços já usados em solicitações: ficam na edição da solicitação. Se o mesmo
-- espaço foi pedido em mais de uma edição, ele é copiado para cada edição extra
-- e as solicitações passam a apontar para a cópia da sua própria edição.
DO $$
DECLARE
  r RECORD;
  atual INTEGER;
  novo INTEGER;
BEGIN
  FOR r IN SELECT DISTINCT id_espaco, id_geektopia FROM "Solicitacao_Espaco" ORDER BY id_espaco, id_geektopia LOOP
    SELECT id_geektopia INTO atual FROM "Espaco" WHERE id_espaco = r.id_espaco;
    IF atual IS NULL THEN
      UPDATE "Espaco" SET id_geektopia = r.id_geektopia WHERE id_espaco = r.id_espaco;
    ELSIF atual <> r.id_geektopia THEN
      INSERT INTO "Espaco" (tipo_espaco, largura_espaco, comprimento_espaco, qtd_mesas, largura_mesa, comprimento_mesa,
                            quantidade_cadeiras, qtd_credenciais_inclusas, valor_base, valor_taxa_ajudante,
                            valor_taxa_mesa_extra, valor_taxa_cadeira_extra, descricao, id_geektopia)
      SELECT tipo_espaco, largura_espaco, comprimento_espaco, qtd_mesas, largura_mesa, comprimento_mesa,
             quantidade_cadeiras, qtd_credenciais_inclusas, valor_base, valor_taxa_ajudante,
             valor_taxa_mesa_extra, valor_taxa_cadeira_extra, descricao, r.id_geektopia
      FROM "Espaco" WHERE id_espaco = r.id_espaco
      RETURNING id_espaco INTO novo;
      UPDATE "Solicitacao_Espaco" SET id_espaco = novo WHERE id_espaco = r.id_espaco AND id_geektopia = r.id_geektopia;
    END IF;
  END LOOP;
END $$;

-- Espaços que ninguém pediu ainda: vão para a Geektopia Principal vigente (a
-- diretoria pode movê-los depois). Sem Principal, ficam sem edição.
UPDATE "Espaco"
SET id_geektopia = (SELECT id_geektopia FROM "Geektopia" WHERE tipo_edicao = 'Principal' LIMIT 1)
WHERE id_geektopia IS NULL;

-- CreateIndex
CREATE INDEX "Espaco_id_geektopia_idx" ON "Espaco"("id_geektopia");

-- AddForeignKey
ALTER TABLE "Espaco" ADD CONSTRAINT "Espaco_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE RESTRICT ON UPDATE CASCADE;
