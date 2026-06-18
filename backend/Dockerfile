FROM node:22.12.0-alpine

# Crear el directorio de trabajo
WORKDIR /app

# Copiar el package.json
COPY package.json ./

# Instalar las dependencias de producción
RUN npm install --omit=dev

# Copiar el resto del código
COPY . .

# Exponer el puerto
EXPOSE 3001

# Arrancar el servidor
CMD ["npm", "start"]
