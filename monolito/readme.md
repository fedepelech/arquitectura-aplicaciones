# 1. Detener y limpiar los servicios y volúmenes de datos previos:
docker-compose down

# 2. Levantar TODOS los servicios (bd y api):
docker-compose up -d

# 3. Esperar un poco para que el contenedor de postgres termine de arrancar (ajusta si es necesario):
sleep 10

# 4. Copiar el schema.sql al contenedor de postgres
docker cp monolito/schema.sql arquitectura-aplicaciones-db-1:/schema.sql

# 5. Aplicar el schema dentro del contenedor de postgres
docker-compose exec db psql -U postgres -d restaurant_poc -f /schema.sql

# 6. Ejecutar el seed desde la API
docker-compose exec monolito npm run seed
