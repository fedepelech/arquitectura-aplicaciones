# Frontend Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY ./monolito/restaurant-frontend/package.json ./monolito/restaurant-frontend/package-lock.json ./
RUN npm install --prefix ./monolito/restaurant-frontend
COPY ./monolito/restaurant-frontend ./monolito/restaurant-frontend
WORKDIR /app/monolito/restaurant-frontend
EXPOSE 3001
CMD ["npm", "start"]
