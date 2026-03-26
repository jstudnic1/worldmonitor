FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY deploy/reality-chat-service/package.json ./package.json
COPY api ./api
COPY server/reality-chat-service.mjs ./server/reality-chat-service.mjs

EXPOSE 8080

CMD ["node", "server/reality-chat-service.mjs"]
