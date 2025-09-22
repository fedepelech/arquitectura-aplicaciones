# 1. Detener TODOS los contenedores (no solo los de tu proyecto)
docker stop $(docker ps -aq)

# 2. Eliminar TODOS los contenedores
docker rm $(docker ps -aq)

# 3. Eliminar TODOS los volúmenes (esto borra todas las bases de datos)
docker volume rm $(docker volume ls -q)

# 4. Eliminar redes no utilizadas
docker network prune -f

# 5. Opcional: Limpiar imágenes no utilizadas (libera espacio)
docker image prune -a -f

# 6. Verificar que todo esté limpio
docker ps -a        # No debe mostrar contenedores
docker volume ls    # No debe mostrar volúmenes
