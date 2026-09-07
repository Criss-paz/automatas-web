# Guía del proyecto para agentes

Documento de trabajo para cualquier agente de IA (o persona) que vaya a modificar
este repositorio. Describe **cómo está montado**, **qué invariantes no se pueden
romper** y **dónde tocar** para cada tipo de cambio.

> `CLAUDE.md` es un enlace simbólico conceptual de este archivo: si tu herramienta
> lee `CLAUDE.md`, encontrará lo mismo.

---

## 1. Qué es

Aplicación web que resuelve ejercicios de autómatas finitos (AFD / AFN / AFN-ε)
mostrando **todo el procedimiento**, no solo el resultado. Se ejecuta entera en
el navegador: no hay servidor, ni base de datos, ni llamadas de red.

Stack: **React 18 + TypeScript + Vite**. Sin librerías de grafos, de estado ni de
UI: los diagramas son SVG generado a mano y el estado es `useState`.

## 2. Comandos

```bash
npm install        # dependencias
npm run dev        # servidor de desarrollo en http://localhost:5173
npm test           # vitest: 130+ pruebas, es la red de seguridad principal
npm run build      # tsc -b && vite build  -> dist/
npm run preview    # sirve dist/ para comprobar la build real
```

**Antes de dar por terminado cualquier cambio: `npm test` y `npm run build`.**
El workflow de despliegue corre las pruebas y no publica si fallan.

## 3. Mapa del código

```
src/
  core/                        TODA la lógica. Sin React. Es lo que hay que probar.
    types.ts                   Automaton, State, Transition, Step, EPSILON
    automaton.ts               Operaciones base: move, clausura-ε, completeDFA,
                               reverseAutomaton, tokenizeWord, joinWord…
    layout.ts                  Coloca los estados en el lienzo (autoLayout)
    samples.ts                 Genera cadenas de ejemplo aceptadas / rechazadas
    solver.ts                  Orquesta el Modo 1: entrada → AFD mínimo verificado
    formal.ts                  Lee y escribe la quíntupla (texto, tabla, JSON)

    algorithms/
      subset.ts                Construcción de subconjuntos (AFN → AFD)
      brzozowski.ts            Minimización por doble reverso + determinización
      minimize.ts              Minimización por tabla de estados distinguibles
      equivalence.ts           Equivalencia por producto, fuerza bruta, simulate
      boolean.ts               product (∩ / ∪) y complement sobre AFD completos

    regex/
      parser.ts                Expresión regular → AST (con clases, {n,m}, ~, &&, -)
      thompson.ts              AST clásico → AFN-ε
      build.ts                 AST completo → autómata (usa boolean.ts para ~ && -)

    nl/
      parser.ts                Enunciado en español → condiciones → autómata
      builders.ts              Un constructor de AFD por cada tipo de condición

  ui/                          Solo presentación. Sin lógica de autómatas.
    App.tsx                    Cambia entre los tres modos
    ModeSolve.tsx              Modo 1: escribir el problema
    Editor.tsx                 Modo 2: dibujar el autómata
    AutomatonView.tsx          Render SVG + interacción por puntero
    StepsView.tsx              Pasos, tablas y texto enriquecido
    StringTester.tsx           Probar una cadena y ver el recorrido
    Theory.tsx                 Fichas de teoría
  styles.css                   Todos los estilos, incluida impresión y responsive
```

**Regla de oro: la lógica vive en `core/`, la interfaz en `ui/`.** Si te ves
escribiendo un bucle sobre transiciones dentro de un componente, probablemente va
en `core/`.

## 4. Invariantes que no se pueden romper

Estas condiciones las asumen varios algoritmos a la vez. Romperlas produce
resultados incorrectos **sin que nada falle visiblemente**.

1. **`complement()` exige un AFD completo.** Si δ no está definida para algún
   par (estado, símbolo), al invertir los finales se pierden las cadenas que se
   quedaban bloqueadas. Siempre `completeDFA()` antes. Lo mismo para `product()`:
   si un lado no es completo, se saltan pares alcanzables.

2. **`reverseAutomaton()` puede dejar varios estados iniciales, y así debe ser.**
   No los unifiques con un estado nuevo y transiciones ε: ese estado postizo hace
   que la determinización distinga subconjuntos que solo difieren en él y rompe
   la garantía de minimalidad de Brzozowski. La determinización arranca desde la
   clausura-ε del conjunto de todos los iniciales.

3. **Los símbolos pueden tener más de un carácter.** Nunca recorras una cadena
   con `for (const c of word)` para simularla: usa `tokenizeWord(alphabet, word)`.
   Para construir una cadena a partir de símbolos usa `joinWord(alphabet, syms)`,
   que mete separadores cuando hacen falta.

4. **`alphabet` no incluye nunca `EPSILON`.** ε es un símbolo de transición, no
   del alfabeto. `inferAlphabet()` ya lo filtra.

5. **Los `id` de estados y transiciones son opacos** (`uid()`), y el `label` es
   lo que ve la persona. Nunca uses el label como identidad: puede repetirse
   mientras se está editando en el lienzo.

6. **Nada de expresiones regulares con lookbehind `(?<=)` / `(?<!)`.** esbuild no
   reescribe la sintaxis de los regex, y Safari no los soportó hasta la 16.4: uno
   solo tumba la aplicación entera al cargarla en un iPhone antiguo. Captura el
   carácter anterior en un grupo si necesitas ese efecto.

7. **Todo acceso a `localStorage` va dentro de `try/catch`.** En modo privado o
   con ajustes estrictos, leer o escribir lanza excepción.

## 5. Cómo hacer los cambios más habituales

### Añadir una condición al analizador de enunciados

1. Escribe el constructor del AFD en `src/core/nl/builders.ts`. Debe devolver un
   autómata **completo** (con estado trampa si hace falta) salvo que quieras un
   AFN a propósito, como en `symbolFromEnd`.
2. Añade el patrón a `PATTERNS` en `src/core/nl/parser.ts`. **El orden importa:**
   se usa el primero que encaje, así que los patrones específicos van antes que
   los generales (`contiene` es el último de todos).
3. Declara en `words: [n]` qué grupos de captura son literales sobre Σ: el
   analizador los valida y descarta el patrón si no encajan, lo que evita casi
   todos los falsos positivos.
4. Añade casos a `src/core/nl.test.ts` comprobando el **lenguaje** (qué acepta y
   qué rechaza), no la forma del autómata.
5. Documenta la frase nueva en la ayuda de `ModeSolve.tsx` y en el README.

### Añadir un operador a las expresiones regulares

- Si se puede expresar con fragmentos ε → nodo nuevo en `RegexNode`, caso en
  `thompson.ts`, y listo.
- Si necesita determinizar (como `~`, `&&`, `-`) → añádelo también a
  `needsDeterminization()` y trátalo en `build.ts`. Thompson debe seguir sin
  verlo nunca.
- Si es azúcar sintáctico (como `{n,m}`) → exprésalo en `desugar()` y no toques
  Thompson.

### Añadir un formato de especificación formal

Todo ocurre en `src/core/formal.ts`. Los formatos por líneas se resuelven en
`parseTransitionLine()` (añade tu expresión regular a la lista, en orden de más
específica a más general) y las tablas en `readTable()`. Añade casos a
`formal.test.ts`: hay un bloque que prueba cada estilo por separado.

### Tocar el lienzo de dibujo

`Editor.tsx` usa **eventos de puntero** (`onPointerDown/Move/Up`), nunca de ratón,
para que funcione igual con dedo, lápiz y ratón. Dos detalles frágiles:

- Al empezar a arrastrar se llama a `setPointerCapture` sobre el `<svg>`. Mientras
  el puntero está capturado, los eventos **no** llegan a los elementos hijos, así
  que la selección de un estado se hace en `pointerdown`, no en `pointerup`.
- El lienzo necesita `touch-action: none` en CSS. Sin eso el navegador móvil se
  queda el gesto para desplazar la página y nunca llegan los `pointermove`.

El historial de deshacer guarda instantáneas completas de `{A, B}`. Un arrastre
se registra **una sola vez, al soltar** (en `onCanvasMouseUp`), no en cada píxel.

## 6. Pruebas

| Archivo | Cubre |
|---|---|
| `core/automata.test.ts` | Thompson, subconjuntos, minimización, equivalencia |
| `core/nl.test.ts` | Analizador de enunciados: ~50 redacciones distintas |
| `core/regex.test.ts` | Clases, rangos, `.`, `{n,m}`, `~`, `&&`, `-`, escapes |
| `core/formal.test.ts` | Cada estilo de transición, tablas, JSON, ida y vuelta |
| `core/random.test.ts` | Propiedades sobre autómatas generados al azar |
| `ui/render.test.tsx` | Humo: que los componentes pinten sin excepciones |

**Estilo de prueba preferido: comprobar el lenguaje, no la estructura.** Un
autómata correcto puede tener cualquier número de estados; lo que no puede es
aceptar una cadena que debería rechazar. Usa `accepts()` y `checkEquivalence()`.

`random.test.ts` es la prueba más valiosa: genera autómatas al azar y verifica
propiedades (el mínimo es equivalente al original, los dos minimizadores
coinciden, determinizar no cambia el lenguaje). Si tocas un algoritmo y esta
prueba falla, el algoritmo está mal, no la prueba.

## 7. Idioma y estilo

- **Todo lo que ve el usuario va en español**, con tildes correctas.
- **Los comentarios y los identificadores del código van en español sin tildes**
  (`interseccion`, `simbolo`). Es la convención existente; mantenla.
- Los comentarios explican **por qué**, no qué. Si algo es sutil (los invariantes
  de arriba), déjalo escrito donde está el código, no solo aquí.
- Nada de `any` salvo en el borde de datos externos (JSON de entrada), y ahí
  valídalo antes de usarlo.

## 8. Despliegue

`.github/workflows/deploy.yml` publica en GitHub Pages con cada push a `main`:
instala, **corre las pruebas**, compila con `VITE_BASE=/<repo>/` y sube `dist/`.

Para que el enlace funcione desde cualquier dispositivo y navegador:

- `vite.config.ts` fija `build.target` en navegadores de ~2019 a propósito. No lo
  subas sin motivo: si el navegador no entiende una línea del bundle, no se ve
  **nada**.
- `base` se toma de `VITE_BASE` para que funcione bajo un subdirectorio.
- `public/.nojekyll` evita que GitHub Pages procese la salida con Jekyll.
- El icono va incrustado como data URI en `index.html`: una petición menos y
  ningún 404.
- La página no usa rutas ni historial: es una sola pantalla, así que no hace
  falta configuración de SPA ni un `404.html`.
