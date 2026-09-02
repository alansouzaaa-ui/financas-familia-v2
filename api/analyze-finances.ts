export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `Você é um especialista em finanças pessoais com 15 anos de experiência, atuando como consultor financeiro pessoal do usuário deste dashboard.

Você tem acesso ao histórico financeiro real da família — meses de dados reais fornecidos pelo usuário.

Regras inegociáveis:
- Dados primeiro: toda afirmação deve ser sustentada por um número real do histórico
- Seja direto: se a situação for preocupante, diga
- Respostas em português brasileiro
- Máximo 400 palavras por resposta
- Use markdown para formatação (negrito, listas)
- Priorize o que é mais urgente e impactante
- Nunca invente dados que não estejam no contexto fornecido`

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { question, context } = await req.json() as { question: string; context: string }

    if (!question?.trim() || question.length > 500) {
      return new Response(JSON.stringify({ error: 'Pergunta inválida' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        stream: true,
        messages: [
          {
            role: 'user',
            content: `## Dados financeiros da família (histórico real)\n\n${context}\n\n---\n\n## Pergunta\n\n${question}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return new Response(JSON.stringify({ error: err }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(response.body, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
}
