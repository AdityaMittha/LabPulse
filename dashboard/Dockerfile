# Multi-stage build for production-ready Cloud Run deployment
FROM node:20-slim as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Inject live production AWS parameters for Vite compilation
RUN echo "VITE_API_BASE_URL=https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com/v1" > .env.production
RUN echo "VITE_COGNITO_USER_POOL_ID=ap-south-1_3c8VUE5RQ" >> .env.production
RUN echo "VITE_COGNITO_CLIENT_ID=6u26jrfopqhvd04mhlhugnig23" >> .env.production
RUN echo "VITE_AWS_REGION=ap-south-1" >> .env.production

# Build the production bundle
RUN npm run build

# Serve the static files using a lightweight Node server
FROM node:20-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
