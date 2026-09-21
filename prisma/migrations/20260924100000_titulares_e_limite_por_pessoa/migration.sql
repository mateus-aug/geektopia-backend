-- Ingresso por titular (como Sympla): os dados de cada pessoa são guardados no item do
-- pedido e viram o Ingresso quando o pagamento é aprovado.
ALTER TABLE "Item_Pedido" ADD COLUMN "titulares" JSONB;

-- Limite de ingressos deste lote por pessoa (documento do titular) na edição, ex.: meia-entrada = 1.
ALTER TABLE "Lote" ADD COLUMN "limite_por_pessoa" INTEGER;
