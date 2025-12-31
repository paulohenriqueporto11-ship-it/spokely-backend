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
  return { status: 'Online', system: 'Spokely Backend' }
})

// --- SISTEMA DE PERFIL E FILA ---
fastify.post('/join-queue', async (request, reply) => {
  const { user_id } = request.body
  if (!user_id) return reply.status(400).send({ error: 'Falta user_id' })

  // Cria perfil se não existir
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user_id, is_pro: false, xp: 0 }, { onConflict: 'id' })
  
  if (profileError) return reply.status(400).send({ error: 'Erro ao criar perfil.' })

  // Insere na fila
  const { error: queueError } = await supabase
    .from('queue')
    .insert({ user_id, status: 'waiting' })

  if (queueError && queueError.code !== '23505') {
    return reply.status(500).send({ error: 'Erro fila' })
  }
  return { success: true, message: 'Entrou na fila' }
})

fastify.get('/queue-status', async (request, reply) => {
  const { user_id } = request.query
  if (!user_id) return reply.status(400).send({ error: 'Falta user_id' })

  const { data, error } = await supabase.rpc('get_queue_position', { p_user_id: user_id })
  
  if (error) return reply.status(500).send({ error: 'Erro banco' })
  if (!data || data.length === 0) return { in_queue: false }

  return { in_queue: true, ...data[0] }
})

// --- SISTEMA DE QUIZ E GAMIFICATION ---

// Rota Genérica: Dar XP (usada pelo Quiz e pelas Quests)
fastify.post('/add-xp', async (request, reply) => {
  const { user_id, xp_amount, source } = request.body // source é só pra log (ex: 'quiz', 'quest')

  if (!user_id || !xp_amount) return reply.status(400).send({ error: 'Dados inválidos' })

  // Chama a função segura do banco
  const { data, error } = await supabase.rpc('add_xp', { 
    p_user_id: user_id, 
    p_amount: xp_amount 
  })

  if (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Erro ao salvar XP' })
  }

  return { 
    success: true, 
    new_level: data[0].new_level,
    current_xp: data[0].new_xp,
    leveled_up: data[0].leveled_up 
  }
})

// Rota Legado (só pra não quebrar se tiver cache)
fastify.post('/complete-quest', async (request, reply) => {
  // Redireciona a lógica internamente
  return await fastify.inject({
    method: 'POST',
    url: '/add-xp',
    payload: request.body
  })
})

// --- START ---
const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
