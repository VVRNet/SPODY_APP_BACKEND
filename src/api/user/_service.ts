import { ObjectId } from 'mongodb'
import { CollUser } from '../../db/user'
import { ExError } from '../../util/error'

export const UserGetFromID = async (id: ObjectId) => {
  try {
    return await CollUser.findOne({
      _id: id,
    })
  } catch (e) {
    throw new ExError('fail to get user', {
      type: 'int',
      code: 'DB_GET_USER',
      err: e,
    })
  }
}

// export const UserGetFromIDWithClass = async (id: ObjectId) => {
//   type userWithClass = SchemaUser & { class: SchemaClass[] }
//   let userInfoWithClass: userWithClass[]
//   try {
//     userInfoWithClass = await CollUser.aggregate<userWithClass>([
//       {
//         $match: { _id: id },
//       },
//       {
//         $lookup: {
//           from: 'class',
//           localField: '_id',
//           foreignField: 'userId',
//           as: 'class',
//         },
//       },
//     ]).toArray()
//   } catch (e) {
//     throw new ExError('failed to search org with class', {
//       type: 'int',
//       code: 'DB_SEARCH_ORG',
//       err: e,
//       info: {
//         name: request.query.name,
//       },
//     })
//   }
// }
