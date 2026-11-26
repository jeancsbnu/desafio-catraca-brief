# Imagem da Catraca (multi-stage). Alvos usados pelo Compose:
#   runtime — aplicação (compose.yaml)
#   gates   — lint, typecheck e testes (compose.gates.yaml)

FROM node:24-bookworm-slim AS base
ENV TZ=America/Sao_Paulo
WORKDIR /app

# Dependências completas (build e gates).
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Compilação do TypeScript para dist/.
FROM deps AS build
COPY . .
RUN npm run build

# Gates: código-fonte completo (inclusive testes) com as dependências de desenvolvimento.
FROM deps AS gates
ENV NODE_ENV=test
COPY . .
CMD ["npm", "run", "gates"]

# Só as dependências de produção.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Aplicação.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY bin/catraca /usr/local/bin/catraca
RUN chmod 0755 /usr/local/bin/catraca
USER node
EXPOSE 3000
HEALTHCHECK --interval=2s --timeout=3s --start-period=60s --retries=15 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
