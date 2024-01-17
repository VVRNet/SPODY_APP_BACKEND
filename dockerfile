FROM node:lts-alpine
WORKDIR /app
COPY . .
RUN npm install --omit=dev && npm cache clean –-force
RUN npm run build
EXPOSE 8080
CMD [ "node", "dist/index.js" ]
