FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY backend ./backend
COPY frontend ./frontend
ENV PORT=3000
EXPOSE 3000
CMD ["node", "backend/server-completed.js"]