-- Central de notificações dentro do site (sininho): avisos ao participante e ao admin.
CREATE TABLE "Notificacao" (
    "id_notificacao" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "texto" TEXT,
    "link" VARCHAR(300),
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id_notificacao")
);

CREATE INDEX "Notificacao_id_usuario_lida_criada_em_idx" ON "Notificacao"("id_usuario", "lida", "criada_em");

ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
