import { ObjectId } from 'mongodb'
import { CollKeyword } from '../../db/keyword'
import { CollSubject } from '../../db/subject'
import { ExError } from '../../util/error'
import { OpenAiAsk } from '../../util/openAi'

export const SubjectGetFromID = async (id: ObjectId) => {
  try {
    return await CollSubject.findOne({
      _id: id,
    })
  } catch (e) {
    throw new ExError('fail to get subject', {
      type: 'int',
      code: 'DB_GET_SUBJECT',
      err: e,
    })
  }
}

export const KeywordGetWithWord = async (language: string, word: string) => {
  // 해당언어 키워드 DB에 있는지 확인
  try {
    const keyword = await CollKeyword.findOne({
      trans: { $elemMatch: { language: language, word: word } },
    })
    return keyword
  } catch (e) {
    throw new ExError('failed to get keyword', {
      type: 'int',
      code: 'DB_GET_KEYWORD',
      err: e,
      info: {
        language: language,
        word: word,
      },
    })
  }
}
export const KeywordGetFromId = async (id: ObjectId) => {
  // 해당언어 키워드 DB에 있는지 확인
  try {
    const keyword = await CollKeyword.findOne({
      _id: id,
    })
    return keyword
  } catch (e) {
    throw new ExError('failed to get keyword', {
      type: 'int',
      code: 'DB_GET_KEYWORD',
      err: e,
      info: {
        id: id.toHexString(),
      },
    })
  }
}

export const KeywordInsert = async (language: string, word: string) => {
  // DB에 없으면 키워드 gpt에 번역요청 해서 언어별 등록
  const languageMap = {
    ko: '한국어',
    en: '영어',
    ja: '히라가나/카타가나',
    zh: '중국어',
    es: '스페인어',
    fi: '핀란드어',
    fr: '프랑스어',
  }
  const promptLanguage = languageMap[language as 'ko']
  if (promptLanguage == null) {
    throw new ExError('failed to insert keyword', {
      type: 'int',
      code: 'KEYWORD_WRONG_LANGUAGE',
      info: {
        language: language,
        word: word,
      },
    })
  }

  // 프롬프트
  const prompt = `${languageMap[language as 'ko']} 단어 "${word}" 를 ${Object.entries(languageMap)
    .map((l) => l[1])
    .join(
      ',',
    )}로 번역해줘. 결과는 각 언어의 ISO 639-1 코드를 필드명으로 하는 json object로 줘. 형식은
{"ko":"","en":"","ja":"","zh":"","es":"","fi":"","fr":""}`

  const resRaw = await OpenAiAsk(prompt)
  const trans: { language: string; word: string }[] = []
  try {
    const res = JSON.parse(resRaw)
    if (typeof res !== 'object') {
      throw new ExError('gpt answer is wrong format', {
        type: 'int',
        code: 'OPENAI_WRONG',
        info: { message: prompt, response: JSON.stringify(resRaw) },
      })
    }
    for (const l in languageMap) {
      const keyword = res[l]
      if (l === language) {
        trans.push({ language: l, word: word })
        continue
      }
      if (keyword == null) {
        throw new ExError('gpt answer is wrong format', {
          type: 'int',
          code: 'OPENAI_WRONG',
          info: { message: prompt, response: JSON.stringify(resRaw) },
        })
      }
      trans.push({ language: l, word: keyword })
    }
  } catch (e) {
    if (ExError.isExError(e)) {
      throw e
    }
    throw new ExError('gpt request failed', {
      type: 'int',
      code: 'OPENAI_WRONG',
      info: { message: prompt, response: JSON.stringify(resRaw) },
      err: e,
    })
  }

  try {
    const newKeywordResult = await CollKeyword.insertOne({ trans: trans })
    return newKeywordResult.insertedId
  } catch (e) {
    throw new ExError('failed to insert keyword', {
      type: 'int',
      code: 'DB_INSERT_KEYWORD',
      err: e,
    })
  }
}
