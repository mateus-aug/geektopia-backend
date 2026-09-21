ALTER TABLE "Evento_Externo"
  ADD COLUMN "data_fim" TIMESTAMP(3),
  ADD COLUMN "status_aprovacao" "StatusAprovacaoEnum" NOT NULL DEFAULT 'EmAnalise',
  ADD COLUMN "publicado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "motivo_recusa" VARCHAR(300),
  ADD COLUMN "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
