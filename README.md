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
| **Enunciado en español** | `Cadenas sobre {a,b} donde el penúltimo símbolo sea a` | Convierte cada condición en un autómata y las combina según los conectores del enunciado |
| **Expresión regular** | `(a\|b)*abb` | Thompson → AFN-ε → subconjuntos → AFD → mínimo. Admite clases, rangos, `{n,m}`, complemento e intersección |
| **Especificación formal** | `Q = {q0,q1}` … `q0, a -> q1` | Lee la quíntupla, una tabla de transiciones o un JSON |

Condiciones que entiende el analizador de enunciados:

**Posición y forma**

- `empieza con` X · `termina en` X · `contiene` X · `prefijo` / `sufijo` X
- `el penúltimo / último / antepenúltimo símbolo es` X — el caso clásico que sale **AFN** y se
  determiniza en el propio procedimiento
- `el primer / segundo / tercer símbolo es` X · `en la posición n hay` X
- `empieza y termina con el mismo símbolo` · `símbolos alternados`

**Cantidades y longitud**

- `número par/impar de` X · `cantidad de X múltiplo de n` · `sin ninguna` X
- `al menos` / `a lo sumo` / `más de` / `menos de` / `exactamente n` X
- `longitud par/impar` · `longitud ≥ / ≤ / = n` · `longitud mayor/menor que n` · `longitud entre n y m`
- `longitud múltiplo de n` · `múltiplos de k` (el número leído en base |Σ|)

**Lenguajes concretos**

- `acepte únicamente a` · `solo las cadenas a, ab y ba` · `solo la cadena vacía` · `no acepte ninguna cadena`
- `formadas únicamente por a` · `expresión regular (a|b)*abb`

**Cómo se combinan**

- **y** / **,** / **además** / **ni** → intersección · **o** → unión · **no** / **sin** / **excepto** → complemento
- Se pueden mezclar: *«que empiecen con a y terminen en b, o que tengan longitud 1»*
- El enunciado se puede escribir como en clase (*«Diseñe un AFD que…»*): la parte que habla del
  ejercicio y no del lenguaje se descarta antes de analizar
- Si un fragmento no se reconoce, el sistema lo dice en vez de inventar
- Si el lenguaje **no es regular** (`aⁿbⁿ`, palíndromos, igual número de a que de b, paréntesis
  balanceados) se explica por qué ningún autómata finito puede reconocerlo, en vez de devolver
  un autómata incorrecto

### Sintaxis de las expresiones regulares

| | |
|---|---|
| `\|` `*` `+` `?` `( )` | unión, cero o más, una o más, opcional, agrupación |
| `[abc]` `[a-z]` `[^ab]` | clase, rango, clase negada |
| `.` | cualquier símbolo de Σ |
| `a{3}` `a{2,4}` `a{2,}` | exactamente 3, entre 2 y 4, 2 o más |
| `~E` `E && F` `E - F` | complemento, intersección, diferencia |
| `ε` `λ` `&` · `∅` | cadena vacía · lenguaje vacío |
| `\*` | escapa un operador y lo vuelve un símbolo normal |
| `"ab"` | símbolo de varias letras |

`.`, `[^…]` y `~` necesitan saber cuál es Σ: se declara en una primera línea, `Sigma = {a,b}`, y
debajo se escribe la expresión. El complemento, la intersección y la diferencia no amplían lo que se
puede expresar (los lenguajes regulares son cerrados bajo esas operaciones), pero ahorran mucho
trabajo; el sistema los resuelve determinizando y aplicando la operación booleana correspondiente, y
lo explica en el procedimiento.

### Formatos de especificación formal

Se acepta la quíntupla escrita por líneas, una **tabla de transiciones** o un **JSON**. Las
transiciones valen en cualquiera de estos estilos:

```
q0, a -> q1        q0 -a-> q1        q0 --a--> q1
δ(q0,a) = q1       q0 -> q1 [a]      q0 a q1
q0, a|b -> q1      (varios símbolos)
q0, a -> q1, q2    (varios destinos: lo vuelve AFN)
q0, a -> -         (sin destino)
```

En una tabla, la primera fila lista los símbolos y la primera columna los estados; `->q0` marca el
inicial y `*q1` los finales:

```
δ    | a  | b
->q0 | q0 | q1
*q1  | q0 | q1
```

El **alfabeto puede ser cualquiera**: minúsculas, mayúsculas, dígitos, signos, y también símbolos de
varias letras (`id`, `num`). Cuando hay símbolos largos, al probar una cadena se pueden separar con
espacios (`id + num`).

### Modo 2 · Dibuja el autómata

Un lienzo con herramientas para colocar **estados**, marcarlos **inicial** (flecha de entrada) o
**final** (doble círculo), y trazar **flechas** con cualquier símbolo, incluida la transición vacía
**ε**. Funciona con ratón, dedo y lápiz. Incluye **deshacer y rehacer** (Ctrl+Z / Ctrl+Shift+Z),
atajos de teclado para cada herramienta, reordenar los estados automáticamente, **autoguardado** (el
dibujo sigue ahí al volver) y **cargar un autómata** pegando su especificación formal, una tabla o un
JSON. Al terminar, el sistema detecta el tipo y pregunta qué hacer:

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
| Operaciones booleanas | `src/core/algorithms/boolean.ts` | Complemento, intersección y unión de AFD |
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
npm run preview  # sirve dist/ para ver la build real
```

## Publicar

Cada push a `main` dispara `.github/workflows/deploy.yml`, que instala, **corre las pruebas** y, si
pasan, publica `dist/` en GitHub Pages. Para activarlo la primera vez: en el repositorio,
**Settings → Pages → Source: GitHub Actions**. El enlace queda en
`https://<usuario>.github.io/<repositorio>/`.

Cualquier persona puede abrirlo con solo el enlace: no hay cuentas, ni instalación, ni permisos.

### Qué se cuidó para que abra en cualquier parte

- **Cualquier tamaño de pantalla.** Diseño adaptable en tres cortes (900 px, 640 px, 400 px). En
  teléfono la barra de herramientas pasa a cuadrícula con botones de al menos 44 px, los botones
  ocupan el ancho completo y las tablas anchas se desplazan solas dentro de su caja.
- **Táctil, lápiz y ratón con el mismo código.** El lienzo usa eventos de puntero y captura el
  puntero al arrastrar, así que dibujar con el dedo funciona igual que con el ratón.
- **Navegadores antiguos.** El bundle se compila para navegadores de ~2019 (Safari 13, Chrome 79,
  Firefox 72, Edge 79) y el código evita construcciones que esbuild no puede transpilar, como el
  *lookbehind* en expresiones regulares, que Safari no soportó hasta la 16.4.
- **Sin dependencias externas en tiempo de ejecución.** Ni fuentes, ni CDN, ni analítica: la página
  carga aunque la red esté filtrada, y no envía ningún dato a ninguna parte.
- **Degradación honesta.** Sin JavaScript se muestra un aviso explicando por qué hace falta; si el
  navegador bloquea el almacenamiento local, el autoguardado del lienzo simplemente no actúa y todo
  lo demás sigue funcionando.

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

## Para desarrollar o extender el proyecto

**[AGENTS.md](AGENTS.md)** documenta la arquitectura, los invariantes que no se pueden romper
(por ejemplo: el complemento exige un AFD completo, y el reverso de Brzozowski debe conservar varios
estados iniciales), y la receta concreta para cada tipo de cambio: añadir una condición al analizador
de enunciados, un operador a las expresiones regulares o un formato de especificación formal.

## Licencia

MIT
