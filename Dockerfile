# Single container: builds the React app, then serves it from the Express backend.
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app/backend
ENV NODE_ENV=production PORT=8080
COPY backend/package*.json backend/.npmrc ./
RUN npm install --omit=dev
COPY backend/ ./
COPY --from=frontend /fe/dist ./public
EXPOSE 8080
CMD ["node", "src/server.js"]
