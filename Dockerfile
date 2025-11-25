FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
ENV PORT=8080
ENV COMMAND_PREFIX=!
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
RUN adduser -D appuser && chown -R appuser /app
USER appuser
EXPOSE 8080
CMD ["node","dist/index.js"]
