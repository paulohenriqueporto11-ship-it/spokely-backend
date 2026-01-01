const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors') // Importando o pacote que está no seu package.json
const { createClient } = require('@supabase/supabase-js')

// --- CONFIGURAÇÃO CORRETA DO CORS ---
// O segredo: registrar o CORS *antes* de qualquer rota.
// origin: '*' libera geral (navegador, celular, postman).
fastify.register(cors, { 
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
})
// ------------------------------------

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE 

if (!supabaseUrl || !supabaseKey) {
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Rota de teste
fastify.get('/', async () => { return { status: 'Online e com CORS liberado' } })

// 1. BUSCAR DADOS
fastify.get('/get-profile', async (request, reply) => {
  const { user_id } = request.query
  if (!user_id) return reply.status(400).send({ error: 'Falta ID' })

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

// 2. BUSCAR ATIVIDADE
fastify.get('/get-activity', async (request, reply) => {
  const { user_id, difficulty } = request.query
  const diff = difficulty || 'easy' 

  try {
    const { data: history } = await supabase
      .from('user_history')
      .select('question_id')
      .eq('user_id', user_id)

    const answeredIds = history ? history.map(h => h.question_id) : []
    const filterIds = answeredIds.length > 0 ? answeredIds : ['00000000-0000-0000-0000-000000000000']

    const { data: questions, error } = await supabase
      .from('questions')
      .select('*')
      .eq('difficulty', diff)
      .not('id', 'in', `(${filterIds.join(',')})`)
      .limit(20)

    if (error) throw error
    
    // Se não tiver perguntas suficientes, retorna erro controlado
    if (!questions || questions.length < 1) { 
       return reply.send({ success: false, error: "Sem novas perguntas!" })
    }

    const selected = questions.sort(() => 0.5 - Math.random()).slice(0, 5)

    const formatted = selected.map(q => {
      const opts = q.content.options
      const ans = q.content.answer
      return {
        id: q.id,
        t: q.content.question,
        o: opts,
        c: opts.indexOf(ans) 
      }
    })

    return { success: true, questions: formatted }

  } catch (err) {
    fastify.log.error(err)
    return reply.status(500).send({ error: 'Erro no servidor' })
  }
})

// 3. COMPLETAR NÍVEL
fastify.post('/complete-level', async (request, reply) => {
  const { user_id, xp_reward, questions_ids } = request.body 
  
  if (questions_ids && questions_ids.length > 0) {
      const inserts = questions_ids.map(qid => ({ user_id, question_id: qid }))
      await supabase.from('user_history').insert(inserts)
  }

  const { data: current } = await supabase
    .from('profiles').select('current_level, xp').eq('id', user_id).single()

  if (!current) return reply.status(400).send({ error: 'User not found' })

  const nextLevel = current.current_level + 1
  const newXp = current.xp + (xp_reward || 50)

  await supabase
    .from('profiles')
    .update({ current_level: nextLevel, xp: newXp })
    .eq('id', user_id)

  return { success: true, new_level: nextLevel, current_xp: newXp }
})

// 4. PERDER VIDA
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
    // Escuta na porta do Render (process.env.PORT) e no host 0.0.0.0
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
    console.log(`Servidor rodando!`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
