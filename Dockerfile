FROM node:20 AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app .

CMD ["node", "dist/index.js"]