FROM node:24.22.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
USER node
ENV HOST=0.0.0.0 UPDATE_SERVER_CONFIG=/config/config.json UPDATE_DATA_DIR=/data
EXPOSE 25565
CMD ["node", "src/cli.cjs", "serve"]
