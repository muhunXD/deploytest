FROM node:20-alpine

WORKDIR /app

# install only what package.json says
COPY package*.json ./
RUN npm ci

# copy the rest of the server code
COPY . .

EXPOSE 4000

# run minimal server
CMD ["npm", "start"]
