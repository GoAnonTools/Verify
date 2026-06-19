# Build: docker build -t goanon-yivi-relay-node -f relay/node/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY relay/node/server.mjs ./server.mjs
EXPOSE 8787
USER node
CMD ["node", "server.mjs"]
