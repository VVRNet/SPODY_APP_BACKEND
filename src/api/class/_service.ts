import { ObjectId, WithId } from 'mongodb'
import { CollClass, SchemaClass } from '../../db/class'
import { ExError } from '../../util/error'

export const ClassGetFromID = async (id: ObjectId) => {
  try {
    return await CollClass.findOne({
      _id: id,
    })
  } catch (e) {
    throw new ExError('fail to get class', {
      type: 'int',
      code: 'DB_GET_CLASS',
      err: e,
    })
  }
}

// 유저종류와 classId값이 맞는지, 유저의 소속으로 존재하는 반인지 확인
export const ClassCheckAvailable = async (
  userType: 'std' | 'org' | 'admin',
  userId: ObjectId,
  classId?: ObjectId,
): Promise<WithId<SchemaClass> | null> => {
  if (
    userType === 'admin' ||
    (classId != null && userType !== 'org') ||
    (classId == null && userType !== 'std')
  ) {
    throw new ExError('wrong user/class id', {
      type: 'ext',
      code: 'PARAM_TYPE_NOTMATCH',
    })
  }
  if (classId == null) {
    return null
  }

  let classInfo: WithId<SchemaClass> | null = null
  try {
    classInfo = await CollClass.findOne({
      _id: classId,
      userId: userId,
    })
  } catch (e) {
    throw new ExError('failed to get class', {
      type: 'int',
      code: 'DB_GET_CLASS',
      err: e,
    })
  }
  if (classInfo == null) {
    throw new ExError('class not existed', {
      type: 'ext',
      code: 'CLASS_NOTFOUND',
    })
  }
  return classInfo
}
