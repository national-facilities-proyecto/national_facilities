# ADR-010: llegada con una acción y separación de información operativa

Estado: implementación para revisión en V2. Base: f502104. Fecha: 2026-10-08.

## Contexto

En las pruebas móviles, reservar el checklist y registrar llegada se perciben como dos decisiones distintas. La reserva transaccional, su vencimiento y los registros históricos ya protegen la concurrencia y no deben eliminarse. La auditoría extensa también desplaza la evidencia y las decisiones del supervisor.

## Decisión

Una sola acción visible «Registrar llegada» orquesta las operaciones existentes: reclamar primero el mismo checklist si está disponible y solicitar después GPS fresco para registrar el inicio. No se fusionan endpoints, estados ni transacciones. La reserva se conserva si falla GPS, permite la excepción con fotografía y vence según las reglas existentes. Reintentar no genera otro checklist ni vuelve a reclamar una reserva ya confirmada en el editor. Si otro técnico reclamó la visita, no se inicia ni se solicita GPS.

No se automatizan reintentos cuando un reclamo venció: se solicita actualizar el registro. Las respuestas confirmadas del servidor determinan la etapa. PostgreSQL mantiene la exclusión de ejecución activa y todos los eventos de reserva, aunque su historial desaparece de la interfaz operativa.

Resumen, motivo, evidencia y decisiones quedan visibles. Historial de excepciones y detalles técnicos permanecen en paneles cerrados por defecto, con carga de contenido al abrir. El supervisor decide cada excepción por su ID y revisión independientes; la validación de diez caracteres y el control de concurrencia continúan vigentes.

## Alternativas

- Mantener dos botones: preserva reglas, pero añade una decisión operativa que el usuario no necesita tomar.
- Crear un endpoint único que reserve/inicie atómicamente: exige replantear qué ocurre cuando GPS falla y qué reserva permite subir evidencia; se descarta para conservar las reglas actuales.
- Eliminar reservas o sus eventos: se descarta porque rompería concurrencia y trazabilidad.

## Consecuencias

Hay dos peticiones HTTP en el primer inicio, con indicador de progreso continuo. Un fallo de GPS puede dejar una reserva válida sin inicio; se conserva y recupera de la forma existente. La auditoría sigue disponible para roles autorizados y no se reescriben snapshots ni migraciones. Las pruebas verifican la secuencia reclamar/GPS/iniciar y que un conflicto de reclamo detiene el flujo.
