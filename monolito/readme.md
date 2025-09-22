# 1. Detener y limpiar los servicios y volúmenes de datos previos:
docker-compose down -v

# 2. Levantar TODOS los servicios (bd y api):
docker-compose up -d

# 3. Esperar un poco para que el contenedor de postgres termine de arrancar (ajusta si es necesario):
sleep 20

# 4. Copiar el schema.sql al contenedor de postgres
docker cp monolito/schema.sql arquitectura-aplicaciones-db-1:/schema.sql

# 5. Aplicar el schema dentro del contenedor de postgres
docker-compose exec db psql -U postgres -d restaurant_poc -f /schema.sql

# 6. Ejecutar el seed desde la API
docker-compose exec monolito npm run seed
# 7. Descargar el modelo LLM recomendado
docker compose exec ollama ollama pull llama3.2:3b-instruct-q4_K_M











# NO SON COMANDOS
## Notas de rendimiento LLM
- El servicio `mcp-server` está configurado para usar por defecto `LLM_MODEL=llama3.2:3b-instruct-q4_K_M`, `LLM_KEEP_ALIVE=1h`, `LLM_NUM_PREDICT=256` y `LLM_NUM_THREAD` configurable.
- Al iniciar, el MCP precalienta el modelo automáticamente para evitar la latencia del primer uso.
- Si querés cambiar el modelo, podés ajustar las variables de entorno del servicio `mcp-server` en `docker-compose.yml` (no requiere cambios de código). Ejemplos alternativos:
  - `qwen2.5:3b-instruct-q4_K_M`
  - `phi3:mini`

Tras cambiar el modelo en `docker-compose.yml`, recordá:
```
docker compose up -d --no-deps mcp-server
docker compose exec ollama ollama pull <modelo>
```
