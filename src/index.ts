import 'reflect-metadata'
import 'source-map-support/register'

import { fastifyHelmet } from '@fastify/helmet'
import fastifyMultipart from '@fastify/multipart'
import { fastifyRequestContext } from '@fastify/request-context'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import fastifyWebsocket from '@fastify/websocket'
import fastify, { FastifyRequest } from 'fastify'
import { env } from 'process'
import { ApiAgreementPost } from './api/agreement/admin/post'
import { ApiAgreementGet } from './api/agreement/get'
import { ApiAuthAdminSignin } from './api/auth/admin/signin'
import { ApiAuthCheckMail } from './api/auth/checkMail'
import { ApiAuthLeave } from './api/auth/leave'
import { ApiAuthPwChange } from './api/auth/pwChange'
import { ApiAuthPwMailCheck } from './api/auth/pwMailCheck'
import { ApiAuthPwMailReq } from './api/auth/pwMailReq'
import { ApiAuthRefresh } from './api/auth/refresh'
import { ApiAuthSignin } from './api/auth/signin'
import { ApiAuthSignout } from './api/auth/signout'
import { ApiAuthSignup } from './api/auth/signup'
import { ApiAuthSignupMailCheck } from './api/auth/signupMailCheck'
import { ApiAuthSignupMailReq } from './api/auth/signupMailReq'
import { ApiCategoryAdd } from './api/category/add'
import { ApiCategoryRelationAdd } from './api/category/addRelation'
import { ApiCategoryDelete } from './api/category/delete'
import { ApiCategoryRelationDelete } from './api/category/deleteRelation'
import { ApiCategoryList } from './api/category/list'
import { ApiCategoryModify } from './api/category/modify'
import { ApiClassAdd } from './api/class/add'
import { ApiClassDelete } from './api/class/delete'
import { ApiClassList } from './api/class/list'
import { ApiClassModify } from './api/class/modify'
import { ApiFollowAdd } from './api/follow/add'
import { ApiFollowDelete } from './api/follow/delete'
import { ApiFollowList } from './api/follow/list'
import { ApiGameGetInvited } from './api/game/getInvited'
import { ApiGameInternalBroadcast } from './api/game/internalBroadcast'
import { ApiGameInternalLeave } from './api/game/internalLeave'
import { ApiGameInvite } from './api/game/invite'
import { ApiGameKick } from './api/game/kick'
import { ApiGameLeave } from './api/game/leave'
import { ApiGameGetList } from './api/game/list'
import { ApiGameReady } from './api/game/ready'
import { ApiGamePostResult } from './api/game/result'
import { ApiGameStart } from './api/game/start'
import { ApiGameUnready } from './api/game/unready'
import { ApiGameUpdateQuiz } from './api/game/updateQuiz'
import { ApiHistoryAge } from './api/history/age'
import { ApiHistoryCount } from './api/history/count'
import { ApiHistoryGame } from './api/history/game'
import { ApiHistoryHome } from './api/history/home'
import { ApiHistoryUserMe } from './api/history/list'
import { ApiHistoryDailyList } from './api/history/listDaily'
import { ApiHistoryVs } from './api/history/vs'
import { ApiPointHistory } from './api/point/history'
import { ApiQuizGet } from './api/quiz/get'
import { ApiQuizList } from './api/quiz/list'
import { ApiQuizKeywordRecommend } from './api/quiz/listKeywordRecommend'
import { ApiQuizModify } from './api/quiz/modify'
import { ApiQuizRecommend } from './api/quiz/quiz'
import { ApiQuizConfirm } from './api/quiz/quizConfirm'
import { ApiQuizRecommendOne } from './api/quiz/quizOne'
import { ApiQuizSetSearchable } from './api/quiz/setSearchable'
import { ApiSubjectAdd } from './api/subject/add'
import { ApiSubjectDelete } from './api/subject/delete'
import { ApiSubjectKeywordRecommend } from './api/subject/keywordRecommend'
import { ApiSubjectList } from './api/subject/list'
import { ApiSubjectUpdateAge } from './api/subject/updateAge'
import { ApiSubjectUpdateFavorite } from './api/subject/updateFavorite'
import { ApiSubjectUpdateProgress } from './api/subject/updateProgress'
import { ApiUserCheckFindId } from './api/user/checkFindId'
import { ApiUserInfoGet } from './api/user/infoGet'
import { ApiUserInfoImage } from './api/user/infoImage'
import { ApiUserInfoUpdate } from './api/user/infoUpdate'
import { ApiUserSearchEmail } from './api/user/searchEmail'
import { ApiUserSearchFindId } from './api/user/searchFindId'
import { ApiUserSearchOrg } from './api/user/searchOrg'
import { MongoInit } from './db/common'
import { AgoraInit } from './util/agoraToken'
import { Env, EnvInit } from './util/env'
import { ErrorHandlerFastify } from './util/error.handler'
import { IpManagerStart } from './util/ipManager'
import { JwtInit } from './util/jwt'
import { OpenAiInit } from './util/openAi'
import { DisconnManagerStart } from './websocket/disconnManager'
import { WebsocketGameAttend } from './websocket/gameAttend'
import { WebsocketGameCreate } from './websocket/gameCreate'
import { WebsocketGameJoin } from './websocket/gameJoin'
import { WebsocketGameRejoin } from './websocket/gameRejoin'
import { WebsocketTest } from './websocket/testWebsocket'

declare module '@fastify/request-context' {
  interface RequestContextData {
    userId: string
    userType: 'std' | 'org' | 'admin'
    classId: string
    className?: string
  }
}

const start = async () => {
  // 환경변수 및 util 초기화
  await EnvInit()
  await MongoInit(Env().env, Env().dbInfo, Env().env === 'local')
  JwtInit(Env().jwtInfos)
  OpenAiInit(Env().gptApikey)
  AgoraInit(Env().agoraId, Env().agoraCert)

  // 서버 초기화
  const app = fastify({
    logger: {
      base: null,
      timestamp: true,
      serializers: {
        req: (req: FastifyRequest) => ({
          method: req.method,
          url: req.url,
          ip: req.ip,
        }),
      },
    },
  })
  app.register(fastifyHelmet, { global: true })
  app.setErrorHandler(ErrorHandlerFastify)
  app.register(fastifyMultipart, {
    addToBody: true,
    // sharedSchemaId:
  })
  app.register(fastifyRequestContext)
  app.register(fastifyWebsocket)

  // Swagger 설정
  if (['dev', 'local', null].includes(env.ENV ?? null)) {
    await app.register(swagger, {
      swagger: {
        info: {
          title: '스포디 API',
          version: `${env.ENV} - ${env.VERSION} - ${new Date().toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
          })}`,
          description: `[ 응답코드 ]
200 : 정상
400 : 잘못된 요청 내용으로 인한 에러
401 : 인증 토큰 만료 (jwt refresh 필요)
500 : 서버 내부 에러`,
        },
        host: env.ENV === 'dev' ? 'dev-api.z-meal.com' : 'localhost:8080',
        schemes: [env.ENV === 'dev' ? 'https' : 'http'],
        consumes: ['application/json'],
        produces: ['application/json'],
      },
    })

    await app.register(swaggerUi, {
      routePrefix: '/apidoc',
      logLevel: 'silent',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        defaultModelRendering: 'model',
        displayRequestDuration: true,
        defaultModelsExpandDepth: 10,
        defaultModelExpandDepth: 10,
      },
      staticCSP: true,
      transformSpecificationClone: true,
    })
  }

  // 헬스체크 API 등록
  app.get('/health', { schema: { hide: true }, logLevel: 'silent' }, async (_request, _reply) => {
    return ''
  })

  // API - 인증
  ApiAuthSignupMailReq(app, '/auth/signup-mail-req')
  ApiAuthSignupMailCheck(app, '/auth/signup-mail-check')
  ApiAuthSignup(app, '/auth/signup')
  ApiAuthPwMailReq(app, '/auth/pw-mail-req')
  ApiAuthPwMailCheck(app, '/auth/pw-mail-check')
  ApiAuthPwChange(app, '/auth/pw')
  ApiAuthSignin(app, '/auth/signin')
  ApiAuthSignout(app, '/auth/signout', 'USER')
  ApiAuthRefresh(app, '/auth/refresh')
  ApiAuthCheckMail(app, '/auth/check-mail')
  ApiAuthLeave(app, '/auth/leave', 'USER')
  ApiAuthAdminSignin(app, '/admin/auth/signin')

  // API - 약관
  ApiAgreementGet(app, '/admin/agreement')
  ApiAgreementPost(app, '/admin/agreement', 'ADMIN')

  // API - 유저
  ApiUserInfoGet(app, '/user/info', 'USER')
  ApiUserInfoUpdate(app, '/user/info', 'USER')
  ApiUserSearchEmail(app, '/user/search/email', 'USER')
  ApiUserSearchOrg(app, '/user/search/org', 'USER')
  ApiUserInfoImage(app, '/user/info/image', 'USER')
  ApiUserSearchFindId(app, '/user/search/findId', 'USER')
  ApiUserCheckFindId(app, '/user/check/findId', 'USER')

  // API - 팔로우
  ApiFollowList(app, '/follow', 'USER')
  ApiFollowAdd(app, '/follow', 'USER')
  ApiFollowDelete(app, '/follow', 'USER')
  // ApiUserFriendList(app, '/user/friend', 'STD')
  // ApiUserFriendInviteList(app, '/user/invite', 'STD')
  // ApiUserFriendInvite(app, '/user/friend/invite', 'STD')
  // ApiUserFriendReply(app, '/user/friend/replay', 'STD')
  // ApiUserFriendDeny(app, '/user/friend/deny', 'STD')

  // API - 기관-반
  ApiClassList(app, '/class', 'ORG')
  ApiClassAdd(app, '/class', 'ORG')
  ApiClassModify(app, '/class', 'ORG')
  ApiClassDelete(app, '/class', 'ORG')

  // API - 과목
  ApiSubjectKeywordRecommend(app, '/subject/keyword', 'USER')
  ApiSubjectList(app, '/subject', 'USER')
  ApiSubjectAdd(app, '/subject', 'USER')
  ApiSubjectDelete(app, '/subject', 'USER')
  ApiSubjectUpdateFavorite(app, '/subject/favorite', 'USER')
  ApiSubjectUpdateProgress(app, '/subject/progress', 'USER')
  ApiSubjectUpdateAge(app, '/subject/age', 'USER')

  // API - 퀴즈
  ApiQuizKeywordRecommend(app, '/quiz/keyword', 'USER')
  ApiQuizRecommend(app, '/quiz', 'USER')
  ApiQuizRecommendOne(app, '/quiz/one', 'USER')
  ApiQuizConfirm(app, '/quiz', 'USER')
  ApiQuizGet(app, '/quiz', 'USER')
  ApiQuizModify(app, '/quiz', 'ANY')
  ApiQuizList(app, '/quiz/list', 'USER')
  ApiQuizSetSearchable(app, '/quiz/searchable', 'ANY')

  // API - 게임
  ApiGameGetInvited(app, '/game/invited', 'USER')
  ApiGameGetList(app, '/game/list', 'USER')
  ApiGamePostResult(app, '/game/result', 'USER')
  // ApiGamePostResult(app, '/game/result')
  ApiGameLeave(app, '/game/leave', 'USER')
  ApiGameReady(app, '/game/ready', 'USER')
  ApiGameUnready(app, '/game/unready', 'USER')
  ApiGameInvite(app, '/game/invite', 'USER')
  ApiGameStart(app, '/game/start', 'USER')
  ApiGameKick(app, '/game/kick', 'USER')
  ApiGameUpdateQuiz(app, '/game/quiz', 'USER')
  ApiGameInternalBroadcast(app, '/game/broadcast')
  ApiGameInternalLeave(app, '/game/broadcast/leave')

  // 웹소켓 - 게임
  WebsocketGameCreate(app, '/game/create')
  WebsocketGameJoin(app, '/game/join')
  WebsocketGameRejoin(app, '/game/rejoin')
  WebsocketTest(app, '/game/test')
  WebsocketGameAttend(app, '/game/attend')

  // API - 기록
  ApiHistoryUserMe(app, '/history/me', 'USER')
  ApiHistoryDailyList(app, '/history/list', 'USER')
  ApiHistoryHome(app, '/history/home', 'USER')
  ApiHistoryGame(app, '/history/game', 'USER')
  ApiHistoryCount(app, '/history/count', 'USER')
  ApiHistoryAge(app, '/history/age', 'USER')
  ApiHistoryVs(app, '/history/vs', 'USER')

  // API - 카테고리
  ApiCategoryAdd(app, '/category', 'USER')
  ApiCategoryDelete(app, '/category', 'USER')
  ApiCategoryList(app, '/category/list', 'USER')
  ApiCategoryModify(app, '/category', 'USER')
  ApiCategoryRelationAdd(app, '/category/relation/add', 'USER')
  ApiCategoryRelationDelete(app, '/category/relation/delete', 'USER')

  // API - 포인트
  ApiPointHistory(app, '/point/history', 'USER')

  // ApiQuizTest(app, '/upup')
  IpManagerStart()
  DisconnManagerStart()

  // 서버 기동
  app.listen({ port: 8080, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    console.log(`Server listening at ${address}`)
  })
}

start()
