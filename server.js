const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const { createClient } = require('@supabase/supabase-js')

// --- CORREÇÃO DO CORS AQUI ---
// origin: '*' libera o acesso para o seu frontend, não importa a URL dele.
fastify.register(cors, { 
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
})

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE 

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: Variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE não definidas.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Rota básica para checar se está Online
fastify.get('/', async () => { return { status: 'Online' } })

// 1. BUSCAR DADOS (Load Inicial)
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
       // upsert garante que cria se não existir
       await supabase.from('profiles').upsert(newProfile)
       return newProfile
  }
  return data 
})

// --- ROTA: PEGAR ATIVIDADE DO BANCO ---
fastify.get('/get-activity', async (request, reply) => {
  const { user_id, difficulty } = request.query
  const diff = difficulty || 'easy' 

  try {
    // 1. Pega IDs que o usuário já respondeu
    const { data: history } = await supabase
      .from('user_history')
      .select('question_id')
      .eq('user_id', user_id)

    const answeredIds = history ? history.map(h => h.question_id) : []
    // Gambiarra técnica: Se lista vazia, o filtro "not.in" falha. Usamos ID falso.
    const filterIds = answeredIds.length > 0 ? answeredIds : ['00000000-0000-0000-0000-000000000000']

    // 2. Busca 20 perguntas dessa dificuldade que NÃO estão no histórico
    const { data: questions, error } = await supabase
      .from('questions')
      .select('*')
      .eq('difficulty', diff)
      .not('id', 'in', `(${filterIds.join(',')})`)
      .limit(20)

    if (error) throw error
    if (!questions || questions.length < 1) { // Mudei para < 1 para evitar travar se tiver poucas perguntas no banco
       return reply.send({ success: false, error: "Sem novas perguntas para esta dificuldade!" })
    }

    // 3. Embaralha e pega até 5
    const selected = questions.sort(() => 0.5 - Math.random()).slice(0, 5)

    // 4. Formata para o Frontend
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

// 2. PASSAR DE NÍVEL
fastify.post('/complete-level', async (request, reply) => {
  const { user_id, xp_reward, questions_ids } = request.body 
  
  // 1. Salva histórico
  if (questions_ids && questions_ids.length > 0) {
      const inserts = questions_ids.map(qid => ({ user_id, question_id: qid }))
      await supabase.from('user_history').insert(inserts)
  }

  // 2. Atualiza Nível e XP
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
    // Configuração OBRIGATÓRIA para o Render (0.0.0.0 e process.env.PORT)
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
    console.log(`Servidor rodando!`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
