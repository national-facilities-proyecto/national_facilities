# ADR-002: Stack de Frontend

**Fecha:** 2026-08-23
**Estado:** Aceptado

## Contexto
Se requiere una SPA responsive para 4 roles distintos, con foco en patrones de UI profesionales y estrategias de optimización de performance web (WPO), ya que este último punto se evalúa directamente en la rúbrica del curso.

## Decisión
**React + TypeScript + Vite + Tailwind CSS.**

## Alternativas consideradas
- **Vue**: curva de aprendizaje más simple, pero ecosistema más pequeño de librerías de mapas y menor disponibilidad de desarrolladores en el mercado local para el mantenimiento posterior del sistema.
- **Angular**: framework completo y opinado, pero demasiado pesado/verboso para un MVP de 10 semanas con equipo pequeño.
- **Create React App en vez de Vite**: descartado; Vite ofrece mejor soporte nativo de code-splitting y tiempos de build más rápidos, relevante para las métricas de WPO evaluadas.
- **Material UI / Ant Design en vez de Tailwind**: descartadas por generar bundles más pesados y menos control fino sobre el peso final del CSS.

## Consecuencias
**Positivas:** ecosistema maduro para mapas (react-leaflet), buen soporte de herramientas de optimización de performance, TypeScript reduce errores de integración con la API.

**Negativas / riesgos:** Tailwind exige disciplina de nomenclatura de clases entre distintos desarrolladores; se mitiga con ESLint/Prettier y una guía de componentes compartida.
