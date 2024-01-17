import { FastifyInstance } from 'fastify'

export const WebsocketTest = (app: FastifyInstance, path: string): void => {
  app.get(
    path,
    {
      websocket: true,
      schema: {
        tags: ['게임'],
        summary: '[웹소켓] 테스트용입니다!',
        description: `웹소켓 테스트!`,
      },
    },
    async (connection /* SocketStream */, req /* FastifyRequest */) => {
      connection.socket.on('message', (message: string) => {
        connection.socket.send('_')
      })
    },
  )
}
