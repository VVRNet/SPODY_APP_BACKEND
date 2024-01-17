import { Db, MongoClient, MongoClientOptions, ServerApiVersion } from 'mongodb'
import { DbInfo } from '../util/env.type'
import { ExError } from '../util/error'
import { InitCollAdmin } from './admin'
import { InitCollAgreement } from './agreement'
import { InitCollCategory } from './category'
import { InitCollClass } from './class'
import { InitCollDisconnUser } from './disconnUser'
import { InitCollEmailValidate } from './emailValidate'
import { InitCollFollow } from './follow'
import { InitCollGame } from './game'
import { InitCollHistory } from './history'
import { InitCollHistoryVs } from './historyVs'
import { InitCollKeyword } from './keyword'
import { InitCollPoint } from './point'
import { InitCollQuiz } from './quiz'
import { InitCollQuizReport } from './quizReport'
import { InitCollSubject } from './subject'
import { InitCollUser } from './user'
import { InitCollUserFindId } from './userFindId'
import { InitCollUserLeave } from './userLeave'

export let DatabaseClient: MongoClient
export let Database: Db

// DB 초기화
export const MongoInit = async (env: string, dbInfo: DbInfo, isEnvLocal: boolean) => {
  let uri = `mongodb+srv://${dbInfo.host}/?w=majority`
  if (isEnvLocal) {
    uri = uri.replaceAll('-pri.', '.')
  }
  const options: MongoClientOptions = {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    retryReads: true,
    retryWrites: true,
  }
  if (env === 'local') {
    options.auth = {
      username: dbInfo.id,
      password: dbInfo.pw,
    }
  } else {
    options.authSource = '$external'
    options.authMechanism = 'MONGODB-AWS'
  }
  DatabaseClient = new MongoClient(uri, options)

  try {
    // Establish and verify connection.
    Database = DatabaseClient.db(dbInfo.database)
    await Database.command({ ping: 1 })
  } catch (e) {
    throw new ExError('BOOTSTRAP FAIL - fail to connect DB', {
      type: 'int',
      code: 'INIT_DB_CONN',
      err: e,
    })
  }

  // collection 별 초기화
  InitCollAdmin()
  InitCollAgreement()
  InitCollCategory()
  InitCollClass()
  InitCollEmailValidate()
  InitCollFollow()
  InitCollGame()
  InitCollHistory()
  InitCollHistoryVs()
  InitCollKeyword()
  InitCollQuiz()
  InitCollQuizReport()
  InitCollSubject()
  InitCollUser()
  InitCollUserLeave()
  InitCollDisconnUser()
  InitCollPoint()
  InitCollUserFindId()
}
