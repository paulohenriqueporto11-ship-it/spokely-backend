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
  console.error('ERRO CRÍTICO: Faltam as chaves do Supabase no Render!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// --- ROTAS ---

fastify.get('/', async () => { return { status: 'Online' } })

// ROTA NOVA: BUSCAR PERFIL (Conserta o bug do "--")
fastify.get('/get-profile', async (request, reply) => {
  const { user_id } = request.query
  if (!user_id) return reply.status(400).send({ error: 'Falta user_id' })

  // Busca os dados na tabela profiles
  const { data, error } = await supabase
    .from('profiles')
    .select('level, xp')
    .eq('id', user_id)
    .single()

  if (error) {
    // Se não achar, cria um perfil zerado na hora
    if (error.code === 'PGRST116') {
       await supabase.from('profiles').insert({ id: user_id, xp: 0, level: 1 })
       return { level: 1, xp: 0 }
    }
    return reply.status(500).send({ error: 'Erro ao buscar perfil' })
  }

  return data // Retorna { level: 5, xp: 350 }
})

// Rota de XP (Mantida igual)
fastify.post('/add-xp', async (request, reply) => {
  const { user_id, xp_amount } = request.body
  if (!user_id || !xp_amount) return reply.status(400).send({ error: 'Dados inválidos' })

  const { data, error } = await supabase.rpc('add_xp', { 
    p_user_id: user_id, p_amount: xp_amount 
  })

  if (error) return reply.status(500).send({ error: 'Erro XP' })

  return { 
    success: true, 
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
