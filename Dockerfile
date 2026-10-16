FROM node:20-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Lockfile is ignored on purpose (it was corrupted locally); runtime deps are pinned in package.json.
COPY package.json ./
RUN npm install --no-package-lock --no-audit --no-fund
COPY . .
RUN rm -f package-lock.json && npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
