// Importando as ferramentas
const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const { createClient } = require('@supabase/supabase-js')

// 1. Configurar CORS
fastify.register(cors, { origin: true })

// 2. Configurar Supabase
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE 

if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO: Faltam as chaves do Supabase no Render!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// --- ROTAS DA FILA (MANTIDAS) ---

fastify.post('/join-queue', async (request, reply) => {
  const { user_id } = request.body
  if (!user_id) return reply.status(400).send({ error: 'Falta user_id' })

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user_id, is_pro: false, xp: 0 }, { onConflict: 'id' })
  
  if (profileError) return reply.status(400).send({ error: 'Erro perfil' })

  const { error: queueError } = await supabase
    .from('queue')
    .insert({ user_id, status: 'waiting' })

  if (queueError && queueError.code !== '23505') {
    return reply.status(500).send({ error: 'Erro fila' })
  }
  return { success: true }
})

fastify.get('/queue-status', async (request, reply) => {
  const { user_id } = request.query
  if (!user_id) return reply.status(400).send({ error: 'Falta user_id' })

  const { data, error } = await supabase.rpc('get_queue_position', { p_user_id: user_id })
  
  if (error) return reply.status(500).send({ error: 'Erro banco' })
  if (!data || data.length === 0) return { in_queue: false }

  return { in_queue: true, ...data[0] }
})

// --- NOVA ROTA: SESSÃO DE FOCO (XP) ---

fastify.post('/complete-session', async (request, reply) => {
  const { user_id, minutes } = request.body

  if (!user_id || !minutes) return reply.status(400).send({ error: 'Dados inválidos' })

  // Regra: 10 XP por minuto
  const xpEarned = minutes * 10 

  // Chama a função do banco (add_xp)
  const { data, error } = await supabase.rpc('add_xp', { 
    p_user_id: user_id, 
    p_amount: xpEarned 
  })

  if (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Erro ao salvar XP. Você rodou o SQL de add_xp?' })
  }

  // Retorna os dados novos pro front
  return { 
    success: true, 
    xp_earned: xpEarned,
    new_level: data[0].new_level,
    current_xp: data[0].new_xp,
    leveled_up: data[0].leveled_up 
  }
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
