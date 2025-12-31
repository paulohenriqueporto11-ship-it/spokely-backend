// Importando as ferramentas
const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors') // <--- NOVO: Importa o CORS
const { createClient } = require('@supabase/supabase-js')

// LIBERAR O CORS (Isso conserta o erro de conexão do Front)
fastify.register(cors, {
  origin: true // Libera para qualquer site acessar (perfeito pro MVP)
})

// Pegando as chaves do "cofre" (Variáveis de Ambiente do Render)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE 

if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO: Faltam as chaves do Supabase nas variáveis de ambiente!')
  process.exit(1)
}

// Conectando no Banco
const supabase = createClient(supabaseUrl, supabaseKey)

// Rota 1: Raiz (só pra ver se tá vivo)
fastify.get('/', async (request, reply) => {
  return { hello: 'Zeniith Backend is Online! 🚀' }
})

// Rota 2: Consultar posição na fila (Polling)
fastify.get('/queue-status', async (request, reply) => {
  const { user_id } = request.query

  if (!user_id) {
    return reply.status(400).send({ error: 'user_id é obrigatório' })
  }

  // Chama a RPC que criamos no Banco
  const { data, error } = await supabase
    .rpc('get_queue_position', { p_user_id: user_id })

  if (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Erro ao consultar fila' })
  }

  // Retorna a posição calculada
  return data[0] 
})

// Ligando o servidor
const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
