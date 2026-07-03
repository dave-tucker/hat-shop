FROM node:20-alpine AS deps
WORKDIR /app
COPY services/front-end/package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY services/front-end/ .
# All service URLs baked at build time by Next.js/webpack.
# Defaults match compose service names; override via --build-arg for k8s.
ARG CLUSTER_NAME=local
ARG CATALOGUE_URL=http://catalogue:8080
ARG ORDERS_URL=http://orders:8080
ARG CARTS_URL=http://carts:8080
ARG PAYMENTS_URL=http://payments:8080
ARG SHIPPING_URL=http://shipping:8080
ARG USER_URL=http://user:8080
ENV CLUSTER_NAME=$CLUSTER_NAME \
    CATALOGUE_URL=$CATALOGUE_URL \
    ORDERS_URL=$ORDERS_URL \
    CARTS_URL=$CARTS_URL \
    PAYMENTS_URL=$PAYMENTS_URL \
    SHIPPING_URL=$SHIPPING_URL \
    USER_URL=$USER_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
