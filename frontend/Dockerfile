# Dev-mode image running the Vite dev server. Production build is deployed
# to Vercel directly (Phase 14), not via this Dockerfile.
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
