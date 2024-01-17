import { ObjectId } from 'mongodb'
import { CollQuiz } from '../../db/quiz'
import { ExError } from '../../util/error'

export const QuizGetFromId = async (id: ObjectId) => {
  try {
    return await CollQuiz.findOne({
      _id: id,
    })
  } catch (e) {
    throw new ExError('fail to get quiz', {
      type: 'int',
      code: 'DB_GET_QUIZ',
      err: e,
    })
  }
}
