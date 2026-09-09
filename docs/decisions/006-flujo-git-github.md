# ADR-006: Flujo de Trabajo en Git/GitHub

**Fecha:** 2026-08-23
**Estado:** Aceptado, con revisión del 2026-09-09
**Última revisión:** 2026-09-09

> **Nota de revisión (09/09/2026).** La decisión original establecía **squash
> merge** al fusionar cada Pull Request. Al revisar el historial de `main` al
> cierre del Sprint 1 se comprobó que esa práctica producía un efecto no
> previsto: los seis commits de la rama principal figuraban a nombre de un único
> integrante, pese a que tres habían aportado código, quedando los autores
> reales únicamente como `Co-authored-by`.
>
> El squash reescribe los commits del PR en uno solo atribuido a quien pulsa el
> botón de fusión. Dado que el curso evalúa la dinámica de trabajo del equipo en
> Git y penaliza que un solo integrante aparezca subiendo todo el código, la
> decisión se revierte: **se fusiona conservando los commits originales.**
>
> El texto original se conserva tachado para dejar constancia de la evolución de
> la decisión.

## Contexto

El equipo está conformado por integrantes con niveles de experiencia dispares y distintos entornos de trabajo. Se busca mantener un historial de commits legible y trazable hacia Jira, y garantizar que el código entregado mantenga un estilo uniforme independientemente de quién lo haya escrito.

Se añade, tras la revisión del 09/09/2026, un segundo objetivo que la decisión original no contemplaba: **que el historial refleje el aporte real de cada integrante**, condición evaluada por el curso.

## Decisión

- Rama `main` protegida: ningún commit directo, todo entra vía Pull Request con al menos una aprobación de un integrante distinto del autor.
- Una rama por tarea, nombrada `feature/NF-XX-descripcion-corta`, ligada al ticket de Jira correspondiente.
- ~~**Squash merge** al fusionar cada Pull Request, de modo que los múltiples commits intermedios de desarrollo se consoliden en un solo commit limpio en `main`.~~
  **Revisado (09/09/2026): se fusiona con _Create a merge commit_ o _Rebase and merge_.** Los commits conservan a su autor original en el historial de `main`. Se prohíbe el squash merge.
- Cada integrante debe registrar commits propios en `main`. Quienes no desarrollan código aportan documentación en `docs/gestion/` y `docs/diseno/`.
- Mensajes de commit siguiendo **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`), incluyendo el identificador de Jira (`NF-XX`).
- ESLint + Prettier (frontend) y Black + Flake8 (backend) ~~ejecutados automáticamente antes de cada commit (hook de pre-commit)~~ **ejecutados manualmente antes de abrir el Pull Request.** La automatización mediante hooks queda pendiente para el Sprint 2; la decisión original la daba por implementada sin que existiera el archivo de configuración.
- Decisiones técnicas relevantes documentadas como ADR en `docs/decisions/`.

## Alternativas consideradas

- **Commits directos a `main` sin revisión:** descartado por falta total de trazabilidad y por el riesgo de un historial desordenado.
- **Git Flow completo** (ramas `develop`, `release`, `hotfix`): descartado por ser sobre-ingeniería para un equipo pequeño y un calendario de cuatro sprints; **GitHub Flow simplificado** (solo `main` + ramas de feature) es suficiente.
- **Squash merge** (decisión original): descartado tras la revisión del 09/09/2026 por borrar la autoría individual, como se explica arriba.

## Consecuencias

**Positivas:** trazabilidad directa entre código, commit y ticket de Jira; el historial de `main` evidencia el aporte de cada integrante, que es lo que el curso evalúa; toda incorporación de código atraviesa una revisión por pares. Durante el Sprint 1 este mecanismo detectó dos defectos funcionales antes de su incorporación.

**Negativas / riesgos:** el historial de `main` incluirá commits intermedios y resultará menos pulido que con squash; se mitiga exigiendo mensajes de commit claros, según la guía de `CONTRIBUTING.md`. Exige además disciplina para nombrar ramas correctamente.

**Deuda no subsanable:** los seis commits fusionados con squash antes de esta revisión no pueden reatribuirse sin reescribir la historia de `main`, operación descartada por su riesgo. La autoría de esos aportes queda constatada mediante los trailers `Co-authored-by`, que la vista *Insights → Contributors* de GitHub sí reconoce.
