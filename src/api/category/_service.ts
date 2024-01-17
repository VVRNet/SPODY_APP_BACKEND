import { ObjectId } from 'mongodb'
import { CollCategory } from '../../db/category'
import { ExError } from '../../util/error'

export const CategoryGetFromID = async (id: ObjectId) => {
  try {
    return await CollCategory.findOne({
      _id: id,
    })
  } catch (e) {
    throw new ExError('failed to get category', {
      type: 'int',
      code: 'DB_GET_CATEGORY',
      err: e,
    })
  }
}

export const CategoryGetWithWord = async (language: string, word: string) => {
  // 해당언어 키워드 DB에 있는지 확인
  try {
    const category = await CollCategory.findOne({
      trans: { $elemMatch: { language: language, word: word } },
    })
    return category
  } catch (e) {
    throw new ExError('failed to get keyword', {
      type: 'int',
      code: 'DB_GET_CATEGORY',
      err: e,
      info: {
        language: language,
        word: word,
      },
    })
  }
}