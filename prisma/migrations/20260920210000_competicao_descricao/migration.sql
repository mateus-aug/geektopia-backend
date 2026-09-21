-- Descrição da competição (texto livre: o que é, como funciona, premiação).
-- O campo regras_url continua existindo, mas o painel passa a usar a descrição.

-- AlterTable
ALTER TABLE "Competicao" ADD COLUMN     "descricao" TEXT;
