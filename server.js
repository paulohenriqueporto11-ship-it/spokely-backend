const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const { createClient } = require('@supabase/supabase-js')

// 1. Configura CORS para aceitar TUDO
fastify.register(cors, { 
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
})

// 2. DEBUG DAS VARIÁVEIS (Isso vai aparecer no LOG do Render)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE 

console.log("--- INICIANDO DEBUG ---")
console.log("PORTA DO RENDER:", process.env.PORT)
console.log("TEM URL DO SUPABASE?", supabaseUrl ? "SIM" : "NÃO (ERRO AQUI)")
console.log("TEM KEY DO SUPABASE?", supabaseKey ? "SIM" : "NÃO (ERRO AQUI)")

// Se não tiver as chaves, a gente NÃO mata o servidor, só avisa.
let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey)
} else {
    console.error("CRÍTICO: Rodando sem conexão com banco de dados!")
}

// 3. ROTA DE DEBUG (Acesse isso no navegador)
fastify.get('/', async (request, reply) => { 
    return { 
        status: 'O SERVIDOR ESTÁ VIVO', 
        supabase_connected: !!supabase,
        env_check: {
            url_configured: !!supabaseUrl,
            key_configured: !!supabaseKey
        }
    } 
})

// Rota Perfil (Protegida contra falha do banco)
fastify.get('/get-profile', async (request, reply) => {
  if (!supabase) return reply.status(500).send({ error: "ERRO CRÍTICO: Backend sem credenciais do Supabase." })
  
  const { user_id } = request.query
  // ... resto do seu código ...
  // Para o teste de debug, vamos retornar algo simples se o banco conectar
  return { status: "Conexão OK", user_id }
})

// INICIALIZAÇÃO BLINDADA
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    // O Host 0.0.0.0 é OBRIGATÓRIO no Render
    await fastify.listen({ port: port, host: '0.0.0.0' })
    console.log(`SERVIDOR RODANDO NA PORTA ${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
