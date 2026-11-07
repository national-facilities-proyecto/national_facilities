FROM node:22.14-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV VITE_DATA_SOURCE=api
ENV VITE_API_URL=https://national-facilities-git-467967883872.southamerica-west1.run.app/api
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080