import OpenAI from 'openai'
import { ExError } from './error'

let openai: OpenAI

export const OpenAiInit = (apikey: string) => {
  openai = new OpenAI({
    apiKey: apikey,
  })
}

export const OpenAiAsk = async (prompt: string, isQuizReuqest = false) => {
  // , useChoice: boolean) => {
  let response: OpenAI.Chat.Completions.ChatCompletion
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        ...(isQuizReuqest
          ? [
              {
                role: 'system' as 'system',
                content:
                  "You are an education expert bot that provides simple 4-choice quizzes on various subjects for teenagers. you are fluent in many languages,too. The quizzes you create must always be new and diverse every time. Don't use caches or similar methods that produce similar answers. Since it's a bot, all answers must be json string.",
              },
            ]
          : []),
        { role: 'user', content: prompt },
      ],
      temperature: isQuizReuqest ? 0.9 : 0.2,
    })
  } catch (e: any) {
    throw new ExError('fail to get openai chat', {
      type: 'int',
      code:
        typeof e.message === 'string' && (e.message as string).includes('503')
          ? 'OPENAI_TIMEOUT'
          : 'OPENAI_FAILED',
      info: {
        message: prompt,
      },
      err: e,
    })
  }
  const answer = response.choices[0].message.content
  if (answer == null) {
    throw new ExError('wrong response from openai', {
      type: 'int',
      code: 'OPENAI_WRONG',
      info: {
        message: prompt,
      },
    })
  }
  return answer
}
