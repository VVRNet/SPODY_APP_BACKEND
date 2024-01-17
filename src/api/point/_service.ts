import { Document, ObjectId, WithId } from 'mongodb'
import { CollPoint, PointUpdateType, SchemaPoint } from '../../db/point'
import { ExError } from '../../util/error'

// 현재 포인트 가져오기
export const PointGetCurrent = async (userId: ObjectId, classId?: ObjectId) => {
  let lastPointHistory: WithId<SchemaPoint> | null = null
  try {
    lastPointHistory = await CollPoint.findOne(
      {
        userId: userId,
        classId: (classId ?? null) as ObjectId | undefined,
      },
      { sort: { createAt: -1 }, limit: 1 },
    )
  } catch (e) {
    throw new ExError('failed to get user', {
      type: 'int',
      code: 'DB_GET_POINT',
      err: e,
      info: {
        userId: userId.toHexString(),
        classId: classId?.toHexString() ?? null,
      },
    })
  }
  return lastPointHistory?.current ?? 0
}

// 포인트 업데이트
export const PointUpdate = async (
  userId: ObjectId,
  pointChange: number,
  type: PointUpdateType,
  classId?: ObjectId,
  relatedId?: ObjectId,
  quizId?: ObjectId,
) => {
  const currentPoint = await PointGetCurrent(userId, classId)
  const newDoc: SchemaPoint = {
    userId: userId,
    classId: (classId ?? null) as ObjectId | undefined,
    current: currentPoint + pointChange,
    change: pointChange,
    type,
    relatedId: relatedId,
    quizId: quizId,
    createAt: new Date(),
  }
  try {
    await CollPoint.insertOne(newDoc)
  } catch (e) {
    throw new ExError('failed to update point', {
      type: 'int',
      code: 'DB_UPDATE_POINT',
      err: e,
      info: {
        userId: userId.toHexString(),
        classId: classId?.toHexString() ?? null,
      },
    })
  }
  return newDoc
}

// 포인트 히스토리 가져오기
export const PointGetHistory = async (
  userId: ObjectId,
  page: number,
  pageSize: number,
  classId?: ObjectId,
  dateFrom?: Date,
  dateTo?: Date,
) => {
  const pageSkipCount = ((page ?? 1) - 1) * pageSize
  const condMatch: Record<string, any> = {
    userId: userId,
    classId: classId ?? null,
  }
  if (dateFrom != null && dateTo != null) {
    condMatch.recordAt = {
      $gte: dateFrom,
      $lte: dateTo,
    }
  } else {
    if (dateFrom != null) {
      condMatch.recordAt = { $gte: dateFrom }
    }
    if (dateTo != null) {
      condMatch.recordAt = { $lte: dateTo }
    }
  }
  const pipelines: Document[] = [
    {
      $match: condMatch,
    },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          {
            $sort: {
              createAt: 1,
            },
          },
          { $skip: pageSkipCount },
          { $limit: pageSize },
        ],
      },
    },
    {
      $project: {
        result: '$data',
        total: { $arrayElemAt: ['$metadata.total', 0] },
      },
    },
  ]

  type historyPointType = {
    result: SchemaPoint[]
    total?: number
  }
  let historyPoint: historyPointType
  try {
    historyPoint = (await CollPoint.aggregate<historyPointType>(pipelines).toArray())[0]
  } catch (e) {
    throw new ExError('failed to search point history', {
      type: 'int',
      code: 'DB_FIND_POINTHISTORY',
      info: { userId: userId.toHexString(), classId: classId?.toHexString() ?? null },
    })
  }

  return {
    total: historyPoint.total ?? 0,
    last: (historyPoint.total ?? 0) - pageSkipCount <= pageSize,
    list: historyPoint.result,
  }
}
