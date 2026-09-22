# Dev-mode image. Bind-mounted src/prisma in docker-compose gives hot reload
# via tsx watch. A separate multi-stage production Dockerfile (build -> slim
# runtime) is added in the Phase 14 deploy work — this one is for local dev.
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4000

CMD ["npm", "run", "dev"]
