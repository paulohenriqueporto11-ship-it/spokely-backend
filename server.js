const fastify = require('fastify')({ logger: true })
const { createClient } = require('@supabase/supabase-js')

// --- A SOLUÇÃO NUCLEAR PARA CORS ---
// Em vez de usar plugin, injetamos os headers manualmente em TUDO.

// 1. Responde a todas as verificações prévias (Preflight) com "SIM"
fastify.options('/*', async (request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*")
  reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
  return reply.send({})
})

// 2. Garante que toda resposta real também leve os headers
fastify.addHook('onSend', (request, reply, payload, done) => {
  reply.header("Access-Control-Allow-Origin", "*")
  reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
  done()
})
// ------------------------------------

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE 

// Debug para garantir que as vars existem
if (!supabaseUrl || !supabaseKey) {
    console.error("FALTAM VARIAVEIS DE AMBIENTE")
    // Não vamos matar o processo, apenas avisar
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Rota Raiz
fastify.get('/', async (request, reply) => { 
    return { status: 'Online - CORS Manual Ativado' } 
})

// 1. GET PROFILE
fastify.get('/get-profile', async (request, reply) => {
  const { user_id } = request.query
  if (!user_id) return reply.status(400).send({ error: 'Falta ID' })

  // Se o supabase falhar, devolve mock para não travar o front
  if (!supabaseUrl) return { id: user_id, xp: 100, current_level: 2, lives: 3, mock: true }

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

// 2. GET ACTIVITY
fastify.get('/get-activity', async (request, reply) => {
  const { user_id, difficulty } = request.query
  const diff = difficulty || 'easy' 

  try {
    const { data: history } = await supabase.from('user_history').select('question_id').eq('user_id', user_id)
    const answeredIds = history ? history.map(h => h.question_id) : []
    const filterIds = answeredIds.length > 0 ? answeredIds : ['00000000-0000-0000-0000-000000000000']

    const { data: questions, error } = await supabase
      .from('questions')
      .select('*')
      .eq('difficulty', diff)
      .not('id', 'in', `(${filterIds.join(',')})`)
      .limit(20)

    if (!questions || questions.length < 1) { 
       return reply.send({ success: false, error: "Sem novas perguntas!" })
    }

    const selected = questions.sort(() => 0.5 - Math.random()).slice(0, 5)
    const formatted = selected.map(q => ({
        id: q.id, t: q.content.question, o: q.content.options, c: q.content.options.indexOf(q.content.answer) 
    }))

    return { success: true, questions: formatted }
  } catch (err) {
    fastify.log.error(err)
    return reply.status(500).send({ error: 'Erro no servidor' })
  }
})

// 3. COMPLETE LEVEL
fastify.post('/complete-level', async (request, reply) => {
  const { user_id, xp_reward, questions_ids } = request.body 
  
  if (questions_ids && questions_ids.length > 0) {
      const inserts = questions_ids.map(qid => ({ user_id, question_id: qid }))
      await supabase.from('user_history').insert(inserts)
  }

  const { data: current } = await supabase.from('profiles').select('current_level, xp').eq('id', user_id).single()
  if (!current) return reply.status(400).send({ error: 'User not found' })

  const nextLevel = current.current_level + 1
  const newXp = current.xp + (xp_reward || 50)

  await supabase.from('profiles').update({ current_level: nextLevel, xp: newXp }).eq('id', user_id)
  return { success: true, new_level: nextLevel, current_xp: newXp }
})

// 4. LOSE LIFE
fastify.post('/lose-life', async (request, reply) => {
  const { user_id } = request.body
  const { data: current } = await supabase.from('profiles').select('lives').eq('id', user_id).single()
  let newLives = (current?.lives || 5) - 1
  if (newLives < 0) newLives = 0
  await supabase.from('profiles').update({ lives: newLives }).eq('id', user_id)
  return { success: true, lives: newLives }
})

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
    console.log(`Servidor rodando na porta ${process.env.PORT || 3000}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
