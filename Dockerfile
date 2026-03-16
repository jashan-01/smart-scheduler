FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Build the app
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# NEXT_PUBLIC_ vars must be present at build time for Next.js to inline them
ENV NEXT_PUBLIC_USER_1_EMAIL=jashan@conci.in
ENV NEXT_PUBLIC_USER_1_NAME=Jashan
ENV NEXT_PUBLIC_USER_2_EMAIL=deepak@conci.in
ENV NEXT_PUBLIC_USER_2_NAME=Deepak
ENV NEXT_PUBLIC_USER_3_EMAIL=monica@conci.in
ENV NEXT_PUBLIC_USER_3_NAME=Monica
ENV NEXT_PUBLIC_APP_URL=https://smart-scheduler-377865870788.us-central1.run.app

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
