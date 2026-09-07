# Simulador de Autómatas Finitos (AFD / AFN)

Sistema web para **resolver, dibujar, convertir, minimizar y comparar** autómatas finitos, mostrando
todo el procedimiento paso a paso. Funciona entero en el navegador: no hay servidor y no se envía
nada a ningún lado.

## Las dos formas de trabajar

### Modo 1 · Escribe el problema

Se describe el lenguaje y el sistema reconoce el **alfabeto**, el **estado inicial**, los **estados
finales** y las **cadenas que acepta**; dibuja el autómata, lo minimiza y verifica el resultado.
Hay tres maneras de escribir la entrada:

| Entrada | Ejemplo | Qué hace |
|---|---|---|
| **Enunciado en español** | `Cadenas sobre {a,b} que empiecen con a y terminen en bb` | Convierte cada condición en un autómata y las combina por intersección |
| **Expresión regular** | `(a\|b)*abb` | Construcción de Thompson → AFN-ε → subconjuntos → AFD → mínimo |
| **Especificación formal** | `Q = {q0,q1}` … `q0, a -> q1` | Lee la quíntupla directamente, admite AFN y transiciones ε |

Condiciones que entiende el analizador de enunciados:

- `empieza con` X · `termina en` X · `contiene` X · `no contiene` X
- `número par/impar de` X · `al menos n` X · `exactamente n` X
- `longitud par/impar` · `longitud ≥ / ≤ / = n` · `longitud múltiplo de n`
- `múltiplos de k` (el número leído en base |Σ|)
- Se combinan con **y**; si un fragmento no se reconoce, el sistema lo dice en vez de inventar.

### Modo 2 · Dibuja el autómata

Un lienzo con herramientas para colocar **estados**, marcarlos **inicial** (flecha de entrada) o
**final** (doble círculo), y trazar **flechas** con cualquier símbolo, incluida la transición vacía
**ε**. Al terminar, el sistema detecta el tipo y pregunta qué hacer:

- Si es un **AFN** (o AFN-ε): convertirlo a AFD aplicando la **clausura-ε** y la construcción de
  subconjuntos, y después minimizarlo con Brzozowski.
- Si es un **AFD**: minimizarlo con Brzozowski, o **compararlo con otro AFD** (pestaña «Autómata B»)
  para decidir si son equivalentes.

## Algoritmos implementados

| Algoritmo | Archivo | Para qué |
|---|---|---|
| Clausura-ε y construcción de subconjuntos | `src/core/algorithms/subset.ts` | AFN-ε → AFD |
| **Brzozowski** `D(R(D(R(A))))` | `src/core/algorithms/brzozowski.ts` | Determinizar y minimizar |
| Tabla de estados distinguibles (Moore) | `src/core/algorithms/minimize.ts` | Segundo método de minimización, para contrastar |
| Construcción del producto | `src/core/algorithms/equivalence.ts` | Verificar equivalencia y dar contraejemplo |
| Construcción de Thompson | `src/core/regex/thompson.ts` | Expresión regular → AFN-ε |
| Analizador de enunciados | `src/core/nl/parser.ts` | Español → autómata |

### Verificación del resultado

Cada minimización se comprueba con **tres pruebas independientes**:

1. **Construcción del producto** entre el autómata inicial y el mínimo. Si algún par alcanzable
   tiene un estado final y otro no, la cadena leída hasta ahí es un contraejemplo (el más corto).
2. **Fuerza bruta** sobre todas las cadenas hasta longitud 7.
3. **Contraste entre los dos minimizadores**: por el teorema de Myhill-Nerode el AFD mínimo es
   único salvo el nombre de los estados, así que Brzozowski y la tabla deben coincidir.

### Una nota sobre la inversión en Brzozowski

Al invertir un autómata con varios estados finales, la tentación es unirlos a un estado inicial
nuevo con transiciones ε. **Eso rompe el algoritmo**: ese estado postizo no pertenece al autómata
original y hace que la determinización distinga subconjuntos que solo se diferencian en él, con lo
que el resultado deja de ser mínimo. Aquí el reverso conserva **varios estados iniciales** y la
determinización arranca desde la clausura-ε de todos ellos a la vez.

## Uso en local

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # pruebas de los algoritmos
npm run build    # compila a dist/
```

## Pruebas

Además de los casos concretos, hay una prueba de propiedades que genera **200 AFN aleatorios**
(con transiciones ε, no determinismo y estados inalcanzables) y comprueba en cada uno que el
resultado de Brzozowski sea determinista, equivalente al original, del mismo tamaño que el del otro
minimizador, sin discrepancias por fuerza bruta y ya irreducible. Otra prueba genera 200 pares de
autómatas y verifica que el veredicto de equivalencia nunca sea un falso positivo y que cada
contraejemplo distinga de verdad los dos lenguajes.

## Exportar el procedimiento

El botón **Imprimir / Guardar PDF** genera un documento con el enunciado, la identificación del
autómata, todos los pasos con sus tablas y los diagramas, listo para entregar.

## Tecnología

React + TypeScript + Vite. Los diagramas son SVG generados por el propio sistema (sin librerías de
grafos) y todo el cálculo ocurre en el navegador.

## Licencia

MIT
