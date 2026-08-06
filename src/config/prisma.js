// adicionando o dotenv 
require('dotenv').config()


const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

// Cria a piscina de conexões usando a DATABASE_URL do .env
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// Inicializa o Prisma utilizando o adaptador
const prisma = new PrismaClient({ adapter });

module.exports = prisma;