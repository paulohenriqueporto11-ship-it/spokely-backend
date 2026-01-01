const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const { createClient } = require('@supabase/supabase-js')

fastify.register(cors, { origin: true })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE 

if (!supabaseUrl || !supabaseKey) process.exit(1)

const supabase = createClient(supabaseUrl, supabaseKey)

// --- ROTAS ---

fastify.get('/', async () => { return { status: 'Online' } })

// BUSCAR PERFIL COMPLETO
fastify.get('/get-profile', async (request, reply) => {
  const { user_id } = request.query
  if (!user_id) return reply.status(400).send({ error: 'Falta user_id' })

  const { data, error } = await supabase
    .from('profiles')
    .select('level, xp, lives') // <--- Agora busca vidas
    .eq('id', user_id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
       // Cria perfil padrão se não existir
       const newProfile = { id: user_id, xp: 0, level: 1, lives: 5 }
       await supabase.from('profiles').insert(newProfile)
       return newProfile
    }
    return reply.status(500).send({ error: 'Erro perfil' })
  }
  return data 
})

// GANHAR XP (Passar de nível)
fastify.post('/add-xp', async (request, reply) => {
  const { user_id, xp_amount } = request.body
  
  const { data, error } = await supabase.rpc('add_xp', { 
    p_user_id: user_id, p_amount: xp_amount 
  })

  if (error) return reply.status(500).send({ error: 'Erro XP' })

  return { 
    success: true, 
    new_level: data[0].new_level,
    current_xp: data[0].new_xp
  }
})

// PERDER VIDA (Errou ou saiu)
fastify.post('/lose-life', async (request, reply) => {
  const { user_id } = request.body
  
  // 1. Busca vidas atuais
  const { data: current, error: fetchError } = await supabase
    .from('profiles')
    .select('lives')
    .eq('id', user_id)
    .single()

  if (fetchError || !current) return reply.status(500).send({ error: 'Erro ao buscar' })

  // 2. Desconta (sem deixar baixar de 0)
  let newLives = current.lives - 1
  if (newLives < 0) newLives = 0

  // 3. Salva
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ lives: newLives })
    .eq('id', user_id)

  if (updateError) return reply.status(500).send({ error: 'Erro ao atualizar' })

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
