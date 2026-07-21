-- CreateEnum
CREATE TYPE "StatusPedidoEnum" AS ENUM ('Pendente', 'Pago', 'Cancelado', 'Expirado');

-- CreateEnum
CREATE TYPE "StatusIngressoEnum" AS ENUM ('Valido', 'Utilizado', 'Cancelado');

-- CreateEnum
CREATE TYPE "StatusAprovacaoEnum" AS ENUM ('EmAnalise', 'Aprovado', 'Reprovado');

-- CreateEnum
CREATE TYPE "StatusInscricaoCompeticaoEnum" AS ENUM ('AguardandoPagamento', 'EmAnalise', 'Aprovado', 'Reprovado');

-- CreateEnum
CREATE TYPE "ModalidadeCompeticaoEnum" AS ENUM ('Solo', 'Dupla', 'Grupo');

-- CreateEnum
CREATE TYPE "StatusContaAdminEnum" AS ENUM ('Ativo', 'Inativo');

-- CreateEnum
CREATE TYPE "StatusEventoEnum" AS ENUM ('Bloqueado', 'VendasAbertas', 'VendasEncerradas', 'Encerrado');

-- CreateEnum
CREATE TYPE "NivelPermissaoAdminEnum" AS ENUM ('ADMIN_GERAL', 'ADMIN_CONTEUDO');

-- CreateEnum
CREATE TYPE "MetodoPagamentoEnum" AS ENUM ('Pix', 'CartaoCredito', 'CartaoDebito', 'Boleto', 'SaldoConta');

-- CreateEnum
CREATE TYPE "StatusPagamentoEnum" AS ENUM ('Pendente', 'Aprovado', 'Recusado', 'Estornado');

-- CreateEnum
CREATE TYPE "TipoCredencialEnum" AS ENUM ('PARTICIPANTE', 'STAFF', 'EXPOSITOR', 'COSPLAYER');

-- CreateTable
CREATE TABLE "Usuario" (
    "id_usuario" SERIAL NOT NULL,
    "id_responsavel" INTEGER,
    "nome_completo" VARCHAR(150) NOT NULL,
    "cpf" VARCHAR(11),
    "cnpj" VARCHAR(14),
    "passaporte" VARCHAR(20),
    "data_nascimento" DATE NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "senha" VARCHAR(255) NOT NULL,
    "telefone" VARCHAR(20),
    "genero" VARCHAR(50),
    "sexualidade" VARCHAR(50),
    "cidade" VARCHAR(100),
    "data_cadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "Responsavel" (
    "id_responsavel" SERIAL NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "nome_completo" VARCHAR(150) NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "url_documento_rg" TEXT,

    CONSTRAINT "Responsavel_pkey" PRIMARY KEY ("id_responsavel")
);

-- CreateTable
CREATE TABLE "Perfil" (
    "id_usuario" INTEGER NOT NULL,
    "nickname" VARCHAR(30),
    "avatar_url" TEXT,

    CONSTRAINT "Perfil_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "Participante" (
    "id_usuario" INTEGER NOT NULL,
    "status_verificacao" BOOLEAN NOT NULL DEFAULT false,
    "autorizado_por_responsavel" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Participante_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "Competidor" (
    "id_usuario" INTEGER NOT NULL,
    "nickname_competidor" VARCHAR(30),
    "pronomes" VARCHAR(20),
    "modalidade_principal" VARCHAR(50),
    "url_portfolio" TEXT,
    "link_redes_sociais" TEXT,
    "url_autorizacao_menor" TEXT,

    CONSTRAINT "Competidor_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "Expositor" (
    "id_usuario" INTEGER NOT NULL,
    "tipo_expositor" VARCHAR(50),
    "nome_loja_projeto" VARCHAR(100),
    "url_portfolio" TEXT,
    "status_aprovacao" "StatusAprovacaoEnum" NOT NULL DEFAULT 'EmAnalise',

    CONSTRAINT "Expositor_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "Administrador" (
    "id_usuario" INTEGER NOT NULL,
    "nivel_permissao" "NivelPermissaoAdminEnum",
    "status_conta" "StatusContaAdminEnum" NOT NULL DEFAULT 'Ativo',
    "departamento" VARCHAR(50),

    CONSTRAINT "Administrador_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "Organizador_Externo" (
    "id_usuario" INTEGER NOT NULL,
    "instituicao_empresa" VARCHAR(100),
    "cargo_funcao" VARCHAR(50),
    "telefone_comercial" VARCHAR(20),
    "status_aprovacao" "StatusAprovacaoEnum" NOT NULL DEFAULT 'EmAnalise',

    CONSTRAINT "Organizador_Externo_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "Credencial" (
    "id_credencial" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_geektopia" INTEGER NOT NULL,
    "id_ingresso" INTEGER,
    "nome_exibicao" VARCHAR(100),
    "tipo_usuario" "TipoCredencialEnum",
    "codigo_qr" VARCHAR(255),

    CONSTRAINT "Credencial_pkey" PRIMARY KEY ("id_credencial")
);

-- CreateTable
CREATE TABLE "Ajudante_Expositor" (
    "id_ajudante" SERIAL NOT NULL,
    "id_solicitacao" INTEGER NOT NULL,
    "nome_completo" VARCHAR(150),
    "cpf" VARCHAR(11),

    CONSTRAINT "Ajudante_Expositor_pkey" PRIMARY KEY ("id_ajudante")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id_pedido" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "data_pedido" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valor_total_bruto" DECIMAL(10,2),
    "status_pedido" "StatusPedidoEnum" NOT NULL DEFAULT 'Pendente',

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id_pedido")
);

-- CreateTable
CREATE TABLE "Item_Pedido" (
    "id_item" SERIAL NOT NULL,
    "id_pedido" INTEGER NOT NULL,
    "id_lote" INTEGER,
    "quantidade" INTEGER,
    "preco_unitario_momento" DECIMAL(10,2),
    "subtotal" DECIMAL(10,2),

    CONSTRAINT "Item_Pedido_pkey" PRIMARY KEY ("id_item")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id_pagamento" SERIAL NOT NULL,
    "id_pedido" INTEGER NOT NULL,
    "status_pagamento" "StatusPagamentoEnum" NOT NULL DEFAULT 'Pendente',
    "valor_total" DECIMAL(10,2) NOT NULL,
    "metodo_pagamento" "MetodoPagamentoEnum",
    "codigo_transacao" VARCHAR(255),
    "data_pagamento" TIMESTAMP(3),

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id_pagamento")
);

-- CreateTable
CREATE TABLE "Evento_Externo" (
    "id_evento_externo" SERIAL NOT NULL,
    "id_organizador" INTEGER NOT NULL,
    "nome_evento" VARCHAR(150) NOT NULL,
    "data_evento" TIMESTAMP(3),
    "local" VARCHAR(200),
    "descricao" TEXT,
    "url_saiba_mais" TEXT,
    "regras_idade_minima" TEXT,

    CONSTRAINT "Evento_Externo_pkey" PRIMARY KEY ("id_evento_externo")
);

-- CreateTable
CREATE TABLE "Geektopia" (
    "id_geektopia" SERIAL NOT NULL,
    "nome_edicao" VARCHAR(150) NOT NULL,
    "data_inicio" TIMESTAMP(3),
    "data_fim" TIMESTAMP(3),
    "local" VARCHAR(200),
    "descricao" TEXT,
    "banner_url" TEXT,
    "status_evento" "StatusEventoEnum" NOT NULL DEFAULT 'Bloqueado',
    "regras_idade_minima" TEXT,
    "aviso_documentacao" TEXT,
    "qnt_dias" INTEGER,

    CONSTRAINT "Geektopia_pkey" PRIMARY KEY ("id_geektopia")
);

-- CreateTable
CREATE TABLE "Lote" (
    "id_lote" SERIAL NOT NULL,
    "id_geektopia" INTEGER NOT NULL,
    "nome_lote" VARCHAR(50),
    "valor_ingresso" DECIMAL(10,2),
    "quantidade_total" INTEGER,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id_lote")
);

-- CreateTable
CREATE TABLE "Espaco" (
    "id_espaco" SERIAL NOT NULL,
    "tipo_espaco" VARCHAR(100),
    "largura_espaco" DECIMAL(5,2),
    "comprimento_espaco" DECIMAL(5,2),
    "qtd_mesas" INTEGER,
    "largura_mesa" DECIMAL(5,2),
    "comprimento_mesa" DECIMAL(5,2),
    "quantidade_cadeiras" INTEGER,
    "qtd_credenciais_inclusas" INTEGER,
    "valor_base" DECIMAL(10,2),
    "valor_taxa_ajudante" DECIMAL(10,2),
    "valor_taxa_mesa_extra" DECIMAL(10,2),
    "valor_taxa_cadeira_extra" DECIMAL(10,2),
    "descricao" TEXT,

    CONSTRAINT "Espaco_pkey" PRIMARY KEY ("id_espaco")
);

-- CreateTable
CREATE TABLE "Solicitacao_Espaco" (
    "id_solicitacao" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_geektopia" INTEGER NOT NULL,
    "id_espaco" INTEGER NOT NULL,
    "id_pedido" INTEGER,
    "qtd_ajudantes_extras" INTEGER DEFAULT 0,
    "valor_taxa_ajudante_momento" DECIMAL(10,2),
    "qtd_mesas_extras" INTEGER DEFAULT 0,
    "valor_taxa_mesa_extra_momento" DECIMAL(10,2),
    "qtd_cadeiras_extras" INTEGER DEFAULT 0,
    "valor_taxa_cadeira_extra_momento" DECIMAL(10,2),
    "valor_total_final" DECIMAL(10,2),
    "status_solicitacao" "StatusAprovacaoEnum" NOT NULL DEFAULT 'EmAnalise',
    "url_contrato_assinado" TEXT,

    CONSTRAINT "Solicitacao_Espaco_pkey" PRIMARY KEY ("id_solicitacao")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id_feedback" SERIAL NOT NULL,
    "id_geektopia" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "nota" INTEGER,
    "comentario" TEXT,
    "data_envio" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id_feedback")
);

-- CreateTable
CREATE TABLE "Competicao" (
    "id_competicao" SERIAL NOT NULL,
    "id_geektopia" INTEGER NOT NULL,
    "nome_competicao" VARCHAR(100),
    "modalidade" "ModalidadeCompeticaoEnum",
    "valor_taxa_inscricao" DECIMAL(10,2),
    "regras_url" TEXT,

    CONSTRAINT "Competicao_pkey" PRIMARY KEY ("id_competicao")
);

-- CreateTable
CREATE TABLE "Equipe_Competicao" (
    "id_equipe" SERIAL NOT NULL,
    "id_competicao" INTEGER NOT NULL,
    "id_lider" INTEGER NOT NULL,
    "nome_equipe" VARCHAR(100) NOT NULL,
    "link_portfolio_grupo" TEXT,

    CONSTRAINT "Equipe_Competicao_pkey" PRIMARY KEY ("id_equipe")
);

-- CreateTable
CREATE TABLE "Programacao" (
    "id_programacao" SERIAL NOT NULL,
    "id_geektopia" INTEGER NOT NULL,
    "id_competicao" INTEGER,
    "titulo_atividade" VARCHAR(150) NOT NULL,
    "data_hora_inicio" TIMESTAMP(3) NOT NULL,
    "data_hora_fim" TIMESTAMP(3),

    CONSTRAINT "Programacao_pkey" PRIMARY KEY ("id_programacao")
);

-- CreateTable
CREATE TABLE "Ingresso" (
    "id_ingresso" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_geektopia" INTEGER NOT NULL,
    "id_lote" INTEGER NOT NULL,
    "id_item" INTEGER,
    "codigo_qr" VARCHAR(255) NOT NULL,
    "status_ingresso" "StatusIngressoEnum" NOT NULL DEFAULT 'Valido',
    "data_checkin" TIMESTAMP(3),
    "nome_titular" VARCHAR(255),
    "documento_titular" VARCHAR(50),

    CONSTRAINT "Ingresso_pkey" PRIMARY KEY ("id_ingresso")
);

-- CreateTable
CREATE TABLE "Inscricao_Competicao" (
    "id_inscricao" SERIAL NOT NULL,
    "id_competicao" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_equipe" INTEGER,
    "id_pedido" INTEGER,
    "url_portfolio_apresentacao" TEXT,
    "link_audio_apresentacao" TEXT,
    "status_inscricao" "StatusInscricaoCompeticaoEnum" NOT NULL DEFAULT 'AguardandoPagamento',
    "data_inscricao" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inscricao_Competicao_pkey" PRIMARY KEY ("id_inscricao")
);

-- CreateTable
CREATE TABLE "Historia_Institucional" (
    "id_historia" SERIAL NOT NULL,
    "titulo" VARCHAR(150),
    "texto_historia" TEXT,

    CONSTRAINT "Historia_Institucional_pkey" PRIMARY KEY ("id_historia")
);

-- CreateTable
CREATE TABLE "Galeria_Edicoes_Passadas" (
    "id_galeria" SERIAL NOT NULL,
    "nome_edicao_passada" VARCHAR(150),
    "ano" INTEGER,
    "url_foto" TEXT,

    CONSTRAINT "Galeria_Edicoes_Passadas_pkey" PRIMARY KEY ("id_galeria")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cpf_key" ON "Usuario"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cnpj_key" ON "Usuario"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_passaporte_key" ON "Usuario"("passaporte");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Responsavel_cpf_key" ON "Responsavel"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_id_usuario_key" ON "Perfil"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_nickname_key" ON "Perfil"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "Credencial_codigo_qr_key" ON "Credencial"("codigo_qr");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_id_pedido_key" ON "Pagamento"("id_pedido");

-- CreateIndex
CREATE UNIQUE INDEX "Ingresso_codigo_qr_key" ON "Ingresso"("codigo_qr");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_id_responsavel_fkey" FOREIGN KEY ("id_responsavel") REFERENCES "Responsavel"("id_responsavel") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perfil" ADD CONSTRAINT "Perfil_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participante" ADD CONSTRAINT "Participante_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competidor" ADD CONSTRAINT "Competidor_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Participante"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expositor" ADD CONSTRAINT "Expositor_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Administrador" ADD CONSTRAINT "Administrador_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organizador_Externo" ADD CONSTRAINT "Organizador_Externo_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credencial" ADD CONSTRAINT "Credencial_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credencial" ADD CONSTRAINT "Credencial_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credencial" ADD CONSTRAINT "Credencial_id_ingresso_fkey" FOREIGN KEY ("id_ingresso") REFERENCES "Ingresso"("id_ingresso") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ajudante_Expositor" ADD CONSTRAINT "Ajudante_Expositor_id_solicitacao_fkey" FOREIGN KEY ("id_solicitacao") REFERENCES "Solicitacao_Espaco"("id_solicitacao") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item_Pedido" ADD CONSTRAINT "Item_Pedido_id_pedido_fkey" FOREIGN KEY ("id_pedido") REFERENCES "Pedido"("id_pedido") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item_Pedido" ADD CONSTRAINT "Item_Pedido_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "Lote"("id_lote") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_id_pedido_fkey" FOREIGN KEY ("id_pedido") REFERENCES "Pedido"("id_pedido") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento_Externo" ADD CONSTRAINT "Evento_Externo_id_organizador_fkey" FOREIGN KEY ("id_organizador") REFERENCES "Organizador_Externo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitacao_Espaco" ADD CONSTRAINT "Solicitacao_Espaco_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Expositor"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitacao_Espaco" ADD CONSTRAINT "Solicitacao_Espaco_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitacao_Espaco" ADD CONSTRAINT "Solicitacao_Espaco_id_espaco_fkey" FOREIGN KEY ("id_espaco") REFERENCES "Espaco"("id_espaco") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitacao_Espaco" ADD CONSTRAINT "Solicitacao_Espaco_id_pedido_fkey" FOREIGN KEY ("id_pedido") REFERENCES "Pedido"("id_pedido") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competicao" ADD CONSTRAINT "Competicao_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipe_Competicao" ADD CONSTRAINT "Equipe_Competicao_id_competicao_fkey" FOREIGN KEY ("id_competicao") REFERENCES "Competicao"("id_competicao") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipe_Competicao" ADD CONSTRAINT "Equipe_Competicao_id_lider_fkey" FOREIGN KEY ("id_lider") REFERENCES "Competidor"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programacao" ADD CONSTRAINT "Programacao_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programacao" ADD CONSTRAINT "Programacao_id_competicao_fkey" FOREIGN KEY ("id_competicao") REFERENCES "Competicao"("id_competicao") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingresso" ADD CONSTRAINT "Ingresso_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingresso" ADD CONSTRAINT "Ingresso_id_geektopia_fkey" FOREIGN KEY ("id_geektopia") REFERENCES "Geektopia"("id_geektopia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingresso" ADD CONSTRAINT "Ingresso_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "Lote"("id_lote") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingresso" ADD CONSTRAINT "Ingresso_id_item_fkey" FOREIGN KEY ("id_item") REFERENCES "Item_Pedido"("id_item") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscricao_Competicao" ADD CONSTRAINT "Inscricao_Competicao_id_competicao_fkey" FOREIGN KEY ("id_competicao") REFERENCES "Competicao"("id_competicao") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscricao_Competicao" ADD CONSTRAINT "Inscricao_Competicao_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Competidor"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscricao_Competicao" ADD CONSTRAINT "Inscricao_Competicao_id_equipe_fkey" FOREIGN KEY ("id_equipe") REFERENCES "Equipe_Competicao"("id_equipe") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscricao_Competicao" ADD CONSTRAINT "Inscricao_Competicao_id_pedido_fkey" FOREIGN KEY ("id_pedido") REFERENCES "Pedido"("id_pedido") ON DELETE SET NULL ON UPDATE CASCADE;
