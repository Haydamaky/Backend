FROM node:18

WORKDIR /usr/src/app

COPY package.json ./
COPY package-lock.json ./
COPY prisma ./prisma/



RUN npm install

COPY . .

EXPOSE 3000

CMD [ "npm", "run", "start:dev" ]