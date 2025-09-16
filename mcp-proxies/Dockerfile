# MCP Server Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY ./mcp-proxies/package.json ./mcp-proxies/package-lock.json ./
RUN npm install --prefix ./mcp-proxies
COPY ./mcp-proxies ./mcp-proxies
WORKDIR /app/mcp-proxies
EXPOSE 4000
CMD ["node", "mcp-server.js"]
