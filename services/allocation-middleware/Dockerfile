FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY fixtures ./fixtures
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
# Runtime: DATA_FILE, ORG_ID, WEBHOOK_TOKEN, PUBLIC_BASE_URL,
# and SUPABASE_* or OPERATOR_TOKEN (see .env.example).
# Optional: SEED_ON_BOOT=1 (requires fixtures/ above).
CMD ["node", "src/http/server.mjs"]
