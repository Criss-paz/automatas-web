# Guía del proyecto

La documentación para agentes está en **[AGENTS.md](AGENTS.md)**: arquitectura,
invariantes que no se pueden romper, dónde tocar para cada tipo de cambio,
estrategia de pruebas y notas de despliegue.

Resumen de urgencia:

- `npm test` y `npm run build` antes de dar nada por terminado.
- La lógica va en `src/core/`, la interfaz en `src/ui/`.
- `complement()` y `product()` exigen AFD **completos**.
- Nada de lookbehind `(?<=)` en expresiones regulares: rompe Safari antiguo.
- Los símbolos del alfabeto pueden tener más de un carácter: usa `tokenizeWord()`.
