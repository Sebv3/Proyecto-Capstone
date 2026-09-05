# ServiMatch API

La forma recomendada de ejecutar la API es mediante Docker Compose desde la raíz
del repositorio. La documentación interactiva queda disponible en
`http://localhost:8000/docs` y el endpoint de salud en
`http://localhost:8000/api/v1/health`.

## Pruebas

Con el contenedor en ejecución:

```powershell
docker compose exec api pytest
```
