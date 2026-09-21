-- Fluxo do competidor: equipes com integrantes e justificativa da análise.

-- AlterTable
ALTER TABLE "Equipe_Competicao" ADD COLUMN     "integrantes" TEXT;

-- AlterTable
ALTER TABLE "Inscricao_Competicao" ADD COLUMN     "observacao_admin" TEXT;
