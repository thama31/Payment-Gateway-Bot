FROM node:22-slim
RUN npm install -g pnpm@10.26.1
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm --filter @workspace/api-server run build
ENV NODE_ENV=production
ENV START_BOT=true
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
