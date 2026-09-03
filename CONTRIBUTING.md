# Guía de Contribución

Estas convenciones son obligatorias para todo el equipo. Su objetivo es mantener un historial de cambios legible y trazable hacia Jira. Ver [ADR-006](docs/decisions/006-flujo-git-github.md).

## Flujo de trabajo

1. **Nunca se trabaja directamente sobre `main`.** La rama está protegida y rechazará commits directos.
2. Antes de empezar, actualiza tu copia local:
   ```bash
   git checkout main
   git pull origin main
   ```
3. Crea una rama para tu historia de usuario:
   ```bash
   git checkout -b feature/HU-12-checklist-evidencia
   ```
4. Trabaja y haz commits libremente (no te preocupes por commits intermedios desordenados; se consolidan al fusionar).
5. Sube tu rama y abre un Pull Request hacia `main`.
6. Un compañero revisa y aprueba. Se fusiona con **Squash and merge**.

## Nomenclatura de ramas

```
feature/HU-XX-descripcion-corta     Nueva funcionalidad
fix/HU-XX-descripcion-corta         Corrección de error
docs/descripcion-corta              Documentación
chore/descripcion-corta             Configuración, dependencias
```

El `HU-XX` debe corresponder al identificador de la historia de usuario en Jira.

## Mensajes de commit (Conventional Commits)

Formato: `tipo(alcance): descripción en imperativo [HU-XX]`

```
feat(checklist): agrega captura de geolocalización [HU-12]
fix(rutas): corrige cálculo de distancia entre puntos [HU-08]
docs(readme): actualiza instrucciones de instalación
chore(docker): agrega servicio de PostgreSQL al compose
refactor(api): extrae lógica de validación a un servicio
test(tickets): agrega pruebas de creación de ticket
```

Tipos válidos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

## Pull Requests

Todo PR debe incluir:
- Título con el mismo formato de Conventional Commits.
- Enlace a la historia de usuario en Jira.
- Descripción de qué se hizo y cómo probarlo.
- Capturas de pantalla si hay cambios visuales.

**No se fusiona un PR sin al menos una aprobación de otro integrante**, y las conversaciones abiertas deben resolverse antes de fusionar.

## Estilo de código

| Capa | Herramientas |
|---|---|
| Backend (Python) | Black (formato) + Flake8 (linter) |
| Frontend (TS/React) | Prettier (formato) + ESLint (linter) |

Se ejecutan automáticamente antes de cada commit mediante hooks de pre-commit. **No desactives los hooks.**

## Reglas importantes

- **Nunca subas el archivo `.env`** ni credenciales, claves de API o contraseñas. Usa `.env.example` con valores ficticios como plantilla.
- No subas `node_modules/`, `venv/` ni archivos generados por el build.
- Si tomas una decisión técnica relevante, documéntala como un nuevo ADR en `docs/decisions/`.
- Cada integrante debe poder explicar el código que sube: si no lo entiendes, no lo fusiones.
