NEXUS / GEEKTOPIA — Backend
===========================

API do sistema NEXUS, do CCPOP (Conselho de Cultura POP de Ponta Grossa), para vender ingressos e organizar a Geektopia e os Pockets. O site fica no repositório geektopia-frontend.

O que precisa para rodar
------------------------

- Node.js 22 ou mais novo (testado com v22.23.4)
- npm 10 (testado com 10.9.9)
- Arquivo .env na raiz desta pasta, ao lado do package.json (enviado junto com o trabalho)
- Internet (o banco de dados fica no Supabase)

Como rodar
----------

    npm install
    npm run dev

A API sobe em http://localhost:3333/api.

Se o Prisma reclamar do client, rode npx prisma generate e tente de novo.

Dependências
------------

- express 5.2.1
- @prisma/client 7.9.1
- @prisma/adapter-pg 7.9.1
- pg 8.22.0
- @supabase/supabase-js 2.116.0
- mercadopago 3.4.0
- jsonwebtoken 9.0.3
- bcryptjs 3.0.3
- cors 2.8.6
- helmet 8.3.0
- express-rate-limit 8.7.0
- multer 2.2.0
- sharp 0.35.4
- pdfkit 0.20.2
- qrcode 1.5.4
- nodemailer 10.0.10
- dotenv 17.4.2

Só para desenvolvimento:

- prisma 7.9.1
- nodemon 3.1.14
- @types/node 26.1.1

Banco de dados: PostgreSQL (hospedado no Supabase).

Funcionalidades
---------------

Usuário:

- Cadastro com termos de uso e login
- Perfil e notificações
- Comprar ingressos e pagar pelo Mercado Pago
- Ingresso com QR code e PDF
- Pedir espaço como expositor
- Inscrever-se em competições
- Enviar eventos da comunidade para divulgação

Administrador:

- Criar e gerenciar edições (lotes, programação, competições, convidados, espaços)
- Aprovar ou recusar solicitações
- Gerenciar usuários
- Editar a página inicial e a página Geektopia
- Check-in por QR code
- Relatórios do público e das vendas

Estrutura
---------

- src/routes rotas da API
- src/controllers regras de cada rota
- src/services pagamento, imagens, notificações e relatórios
- prisma banco de dados (schema e migrações)
- tests testes automatizados

Testes
------

    npm test

O Mercado Pago é simulado nos testes, então nenhum teste gera cobrança.
