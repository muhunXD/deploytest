# 1) Build the React app
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# vite build outputs to /dist by default
RUN npm run build

# Use Nginx to serve static files
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx listens on port 80 inside the container
EXPOSE 80

# Start Nginx in the foreground (so Docker keeps it running)
CMD ["nginx", "-g", "daemon off;"]
