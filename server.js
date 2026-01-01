const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const { createClient } = require('@supabase/supabase-js')

fastify.register(cors, { origin: true })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE 

if (!supabaseUrl || !supabaseKey) process.exit(1)

const supabase = createClient(supabaseUrl, supabaseKey)

fastify.get('/', async () => { return { status: 'Online' } })

// 1. BUSCAR DADOS (Load Inicial)
fastify.get('/get-profile', async (request, reply) => {
  const { user_id } = request.query
  if (!user_id) return reply.status(400).send({ error: 'Falta ID' })

  // Tenta buscar. Se não achar, cria.
  let { data, error } = await supabase
    .from('profiles')
    .select('current_level, xp, lives')
    .eq('id', user_id)
    .single()

  if (error || !data) {
       const newProfile = { id: user_id, xp: 0, current_level: 1, lives: 5 }
       await supabase.from('profiles').upsert(newProfile)
       return newProfile
  }
  return data 
})

// 2. PASSAR DE NÍVEL (A Mágica do Destravamento)
fastify.post('/complete-level', async (request, reply) => {
  const { user_id, xp_reward } = request.body
  
  // Busca dados atuais
  const { data: current } = await supabase
    .from('profiles').select('current_level, xp').eq('id', user_id).single()

  if (!current) return reply.status(400).send({ error: 'User not found' })

  // Lógica Arcade: Sempre sobe 1 nível no mapa
  const nextLevel = current.current_level + 1
  const newXp = current.xp + (xp_reward || 50)

  // Salva
  await supabase
    .from('profiles')
    .update({ current_level: nextLevel, xp: newXp })
    .eq('id', user_id)

  return { success: true, new_level: nextLevel, current_xp: newXp }
})

// 3. PERDER VIDA
fastify.post('/lose-life', async (request, reply) => {
  const { user_id } = request.body
  
  const { data: current } = await supabase
    .from('profiles').select('lives').eq('id', user_id).single()

  let newLives = (current?.lives || 5) - 1
  if (newLives < 0) newLives = 0

  await supabase.from('profiles').update({ lives: newLives }).eq('id', user_id)

  return { success: true, lives: newLives }
})

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
  } catch (err) {
    process.exit(1)
  }
}
start()
