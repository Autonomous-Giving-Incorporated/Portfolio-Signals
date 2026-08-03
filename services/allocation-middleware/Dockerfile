FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
# DATA_FILE, ORG_ID, OPERATOR_TOKEN, WEBHOOK_TOKEN required at runtime
CMD ["node", "src/http/server.mjs"]
