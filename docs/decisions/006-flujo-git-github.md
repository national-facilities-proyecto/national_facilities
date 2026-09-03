# ADR-006: Flujo de Trabajo en Git/GitHub

**Fecha:** 2026-08-23
**Estado:** Aceptado

## Contexto
El equipo está conformado por integrantes con niveles de experiencia dispares y distintos entornos de trabajo. Se busca mantener un historial de commits legible y trazable hacia Jira, evitando ensuciar la rama principal con commits intermedios tipo "fix", "corrección final", etc., y garantizar que el código entregado mantenga un estilo uniforme independientemente de quién lo haya escrito.

## Decisión
- Rama `main` protegida: ningún commit directo, todo entra vía Pull Request.
- Una rama por historia de usuario, nombrada `feature/HU-XX-descripcion-corta`, ligada al ticket de Jira correspondiente.
- **Squash merge** al fusionar cada Pull Request, de modo que los múltiples commits intermedios de desarrollo se consoliden en un solo commit limpio en `main`.
- Mensajes de commit siguiendo **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`), incluyendo el ID del ticket de Jira.
- ESLint + Prettier (frontend) y Black + Flake8 (backend Python) ejecutados automáticamente antes de cada commit (hook de pre-commit), para que el estilo del código sea consistente sin importar qué integrante del equipo lo haya escrito.
- Decisiones técnicas relevantes documentadas como ADR en `/docs/decisions`.

## Alternativas consideradas
- **Commits directos a `main` sin revisión:** descartado por falta total de trazabilidad y por el riesgo de un historial desordenado.
- **Git Flow completo** (ramas `develop`, `release`, `hotfix`): descartado por ser sobre-ingeniería para un equipo pequeño y un proyecto de 10 semanas; **GitHub Flow simplificado** (solo `main` + ramas de feature) es suficiente.

## Consecuencias
**Positivas:** historial de `main` legible y profesional, trazabilidad directa entre código, commit y ticket de Jira, consistencia de estilo en todo el código base, lo que facilita la revisión y el mantenimiento posterior.

**Negativas / riesgos:** exige disciplina del equipo para nombrar ramas y escribir mensajes de commit correctamente; se mitiga con una plantilla de Pull Request y una breve guía en `CONTRIBUTING.md`.
