# Guía de Contribución

Estas convenciones son obligatorias para todo el equipo. Su objetivo es mantener un historial de cambios legible, trazable hacia Jira y que refleje el aporte real de cada integrante. Ver [ADR-006](docs/decisions/006-flujo-git-github.md).

## Flujo de trabajo

1. **Nunca se trabaja directamente sobre `main`.** La rama está protegida y rechazará commits directos.
2. Antes de empezar, actualiza tu copia local:
   ```bash
   git checkout main
   git pull origin main
   ```
3. Crea una rama para tu tarea:
   ```bash
   git checkout -b feature/NF-XX-checklist-evidencia
   ```
4. Trabaja y haz commits con mensajes claros. **Estos commits se conservan en `main`**, así que escríbelos pensando en que alguien los va a leer.
5. Sube tu rama y abre un Pull Request hacia `main`.
6. Un compañero revisa y aprueba. Se fusiona con **Create a merge commit** o **Rebase and merge**.

### No usar Squash and merge

El squash reescribe los commits del PR en uno solo, atribuido a quien pulsa el botón de fusión. El autor original queda relegado a una línea `Co-authored-by` y desaparece del historial de `main`.

Esto ya nos ocurrió: los primeros seis commits de `main` figuraban a nombre de un único integrante pese a que tres habían aportado código. El curso evalúa la dinámica de trabajo en Git y penaliza que un solo integrante aparezca subiendo todo, de modo que la opción de fusión no es una preferencia de estilo sino un requisito.

**Cada integrante debe tener commits propios en `main`.** Quienes no programan aportan documentación:

| Integrante | Carpeta |
|---|---|
| Anthony (Scrum Master) | `docs/gestion/` — actas, Gantt, acta de constitución, riesgos |
| Rogelio (UX) | `docs/diseno/` — wireframes y mockups exportados a PNG |
| Fabrizio (Frontend) | `frontend/` y documento WPO |
| Bryan (Backend/DevOps) | `backend/` y `docs/decisions/` |

Verifica que tu correo de Git coincida con el de tu cuenta de GitHub, o tus commits no se vincularán a tu perfil:

```bash
git config user.email
```

## Nomenclatura de ramas

```
feature/NF-XX-descripcion-corta     Nueva funcionalidad
fix/NF-XX-descripcion-corta         Corrección de error
docs/descripcion-corta              Documentación
chore/descripcion-corta             Configuración, dependencias
```

El `NF-XX` corresponde al identificador de la tarea en Jira (proyecto NF).

## Mensajes de commit (Conventional Commits)

Formato: `tipo(alcance): descripción en imperativo [NF-XX]`

```
feat(checklist): agrega captura de geolocalización [NF-76]
fix(visitas): corrige cálculo de distancia entre puntos [NF-81]
docs(readme): actualiza instrucciones de instalación
chore(docker): agrega servicio de PostgreSQL al compose
refactor(api): extrae lógica de validación a un servicio
test(tickets): agrega pruebas de creación de ticket
```

Tipos válidos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

Se usa el identificador de Jira (`NF-XX`) y no el de la historia de usuario (`HU-XX`), porque es el que permite rastrear el commit hasta la tarjeta del tablero.

## Pull Requests

Todo PR debe incluir:
- Título con el mismo formato de Conventional Commits.
- Enlace a la tarea en Jira.
- Descripción de qué se hizo y cómo probarlo.
- Capturas de pantalla si hay cambios visuales.

**No se fusiona un PR sin al menos una aprobación de otro integrante**, y las conversaciones abiertas deben resolverse antes de fusionar.

## Estilo de código

| Capa | Herramientas |
|---|---|
| Backend (Python) | Black (formato) + Flake8 (linter) |
| Frontend (TS/React) | Prettier (formato) + ESLint (linter) |

**Se ejecutan manualmente antes de abrir el Pull Request.** La automatización mediante hooks de pre-commit está pendiente de configuración y se incorporará en el Sprint 2.

```bash
# Backend
docker compose exec backend black .
docker compose exec backend flake8 .

# Frontend
docker compose exec frontend npm run lint
docker compose exec frontend npx prettier --write src/
```

## Reglas importantes

- **Nunca subas el archivo `.env`** ni credenciales, claves de API o contraseñas. Usa `.env.example` con valores ficticios como plantilla.
- No subas `node_modules/`, `venv/` ni archivos generados por el build.
- No subas fotografías de evidencia ni datos reales de la operación del cliente. El repositorio es público.
- Si tomas una decisión técnica relevante, documéntala como un nuevo ADR en `docs/decisions/` y agrégala a la tabla de `docs/decisions/README.md`.
- Cada integrante debe poder explicar el código que sube: si no lo entiendes, no lo fusiones.
