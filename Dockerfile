FROM node:20-alpine
ENV NODE_ENV=production
ENV PORT=8080
ENV COMMAND_PREFIX=! 
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN adduser -D appuser && chown -R appuser /app
USER appuser
RUN npm run build
EXPOSE 8080
CMD ["node","dist/index.js"]