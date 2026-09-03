# National Facilities — Sistema de Gestión de Checklists, Rutas y Tickets

Proyecto del curso **Curso Integrador 2 — Software**.
Sistema web para la gestión de visitas técnicas, checklists con evidencia verificable y tickets de atención para National Facilities.

---

## Problema que resuelve

National Facilities brinda servicios de mantenimiento a cadenas de retail bajo contrato, entre ellas la cuenta MASS, sobre la cual se desarrolla este proyecto. La operación actual presenta tres problemas críticos:

1. **Checklists sin evidencia verificable:** no existe forma de comprobar que el técnico visitó físicamente la tienda ni de garantizar que las fotografías correspondan a la visita reportada; se han detectado reportes con fotografías reutilizadas.
2. **Solicitudes sin trazabilidad:** los supervisores de tienda reportan incidencias por WhatsApp o correo, canales donde los pedidos se pierden o no se atienden a tiempo.
3. **Programación manual de rutas:** las rutas se elaboran en Excel y se distribuyen vía Power BI, un proceso lento, dependiente de personas y poco usable en campo.

## Solución

Aplicación web con cuatro módulos:

- **Checklist y evidencia:** bolsa de trabajo mensual compartida entre los técnicos de la cuenta, con captura fotográfica en vivo (sin acceso a galería) y validación de proximidad geográfica al iniciar y cerrar.
- **Tickets ("prontos"):** el supervisor de tienda genera las solicitudes desde el sistema; el supervisor de cuenta las asigna a un técnico y programa su atención, con seguimiento de estado e historial.
- **Programación de prontos y rutas en mapa:** el supervisor de cuenta programa la atención asignando técnico y fecha; el técnico visualiza sus tiendas en un mapa, organizadas en atrasadas, del día y futuras.
- **Panel de trazabilidad:** indicadores de cumplimiento de checklist, mínimo de intervenciones mensuales, tickets atendidos y tiempos de respuesta.

## Roles del sistema

| Rol | Descripción |
|---|---|
| Técnico de campo | Ejecuta el checklist mensual y atiende los prontos asignados |
| Supervisor de cuenta | Programa la atención de prontos, asigna y da seguimiento |
| Supervisor de tienda (cliente) | Genera tickets ("prontos") de atención para su local |
| Administrador | Gestiona usuarios, tiendas, contratos y catálogos por cliente |

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Python 3.12 + Django 5 + Django REST Framework |
| Base de datos | PostgreSQL 16 |
| Mapas | Leaflet + OpenFreeMap (datos de OpenStreetMap) |
| Contenedores | Docker + Docker Compose |
| Infraestructura | DigitalOcean (App/Droplet + Managed Database) |
| Gestión | Jira (Scrum) · Diseño: Figma |

Las decisiones técnicas y sus alternativas evaluadas están documentadas en [`docs/decisions`](docs/decisions/README.md).

## Metodología

Scrum, con sprints planificados en Jira. Cada historia de usuario se desarrolla en una rama propia y se integra a `main` mediante Pull Request con squash merge. Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Puesta en marcha (desarrollo local)

### Requisitos previos

- Docker Desktop (con WSL2 habilitado en Windows)
- Git

No se requiere tener Python ni Node.js instalados localmente: todo corre dentro de contenedores.

### Pasos

1. Clona el repositorio y entra a la carpeta:

```bash
git clone https://github.com/national-facilities-proyecto/national_facilities.git
cd national_facilities
```

2. Copia el archivo de variables de entorno de ejemplo y ajusta los valores si lo deseas:

```bash
cp .env.example .env
```

3. Levanta los tres servicios (base de datos, backend y frontend):

```bash
docker compose up --build
```

4. Verifica que los tres contenedores estén corriendo:

```bash
docker compose ps
```

5. Aplica las migraciones de la base de datos:

```bash
docker compose exec backend python manage.py migrate
```

6. Crea un superusuario para acceder al panel de administración:

```bash
docker compose exec backend python manage.py createsuperuser
```

7. (Opcional) Carga los catálogos iniciales (categorías de problema, niveles de urgencia, ítems de checklist):

```bash
docker compose exec backend python manage.py loaddata catalogos_iniciales
```

### URLs locales

- Frontend: http://localhost:5173/
- Backend (API): http://localhost:8000/api/
- Panel de administración: http://localhost:8000/admin/

## Estructura del repositorio

```
├── backend/          # API REST (Django + DRF)
├── frontend/         # SPA (React + Vite)
├── docs/
│   └── decisions/    # ADR — Registro de decisiones de arquitectura
├── docker-compose.yml
├── .env.example
└── README.md
```

## Equipo

| Integrante | Rol Scrum |
|---|---|
| Edu Joaquin Villasante | Product Owner |
| Anthony | Scrum Master |
| Rogelio | Desarrollo / UX |
| Fabrizio | Desarrollo Frontend |
| Bryan | Desarrollo Backend / DevOps |

**Docente:** Ecmias Eduardo Fernández Gálvez
