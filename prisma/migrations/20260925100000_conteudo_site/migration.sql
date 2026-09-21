-- Conteúdo editável das páginas informativas (landing page): um registro por página.
CREATE TABLE "Conteudo_Site" (
    "chave" VARCHAR(60) NOT NULL,
    "valor" JSONB NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conteudo_Site_pkey" PRIMARY KEY ("chave")
);
