FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm i --no-save vite
COPY . .
RUN npx vite build
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/server.js"]
