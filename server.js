// Importando as ferramentas
const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const { createClient } = require('@supabase/supabase-js')

// 1. Configurar CORS (Libera o Front para acessar o Back)
fastify.register(cors, {
  origin: true // Libera geral para o MVP
})

// 2. Configurar Supabase (Pega chaves do Render)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE 

if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO CRÍTICO: Faltam as chaves do Supabase (URL ou KEY) no Render!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// --- ROTAS ---

// Rota de Teste (Raiz)
fastify.get('/', async () => {
  return { status: 'Online', system: 'Spokely MVP' }
})

// Rota: Entrar na Fila
fastify.post('/join-queue', async (request, reply) => {
  const { user_id } = request.body

  if (!user_id) return reply.status(400).send({ error: 'Falta user_id' })

  // Passo A: Garante que o usuário existe na tabela 'profiles'
  // (Sem isso, o banco bloqueia a entrada na fila por segurança)
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user_id, is_pro: false, xp: 0 }, { onConflict: 'id' })
  
  if (profileError) {
    fastify.log.error(profileError)
    return reply.status(400).send({ error: 'Erro ao criar perfil. Verifique se o ID é válido.' })
  }

  // Passo B: Insere na Fila
  const { error: queueError } = await supabase
    .from('queue')
    .insert({ user_id, status: 'waiting' })

  if (queueError) {
    // Se der erro de duplicidade (já está na fila), avisa mas não quebra
    if (queueError.code === '23505') {
       return { success: true, message: 'Usuário já está na fila.' }
    }
    fastify.log.error(queueError)
    return reply.status(500).send({ error: 'Erro ao entrar na fila.' })
  }

  return { success: true, message: 'Entrou na fila com sucesso!' }
})

// Rota: Ver Posição (Polling)
fastify.get('/queue-status', async (request, reply) => {
  const { user_id } = request.query

  if (!user_id) return reply.status(400).send({ error: 'user_id obrigatório' })

  // Chama a função inteligente do Banco de Dados
  const { data, error } = await supabase
    .rpc('get_queue_position', { p_user_id: user_id })

  if (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Erro interno no banco.' })
  }

  // Se o array vier vazio, o usuário não está na fila
  if (!data || data.length === 0) {
    return { in_queue: false }
  }

  // Retorna: { in_queue: true, queue_pos: 1, total_waiting: 5, ... }
  return { in_queue: true, ...data[0] }
})

// --- INICIAR SERVIDOR ---
const start = async () => {
  try {
    // Ouve na porta que o Render mandar ou na 3000
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
