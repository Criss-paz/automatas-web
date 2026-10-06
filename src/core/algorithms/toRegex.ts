import { Automaton, EPSILON, Step } from '../types'
import { coReachableStates, finalStates, initialStates, reachableStates } from '../automaton'
import { RegexNode, regexToString } from '../regex/parser'

/**
 * Automata -> expresion regular, por ELIMINACION DE ESTADOS.
 *
 * Es el camino de vuelta de Thompson. La idea:
 *
 *   1. Se añaden un inicio nuevo S y un fin nuevo F, unidos con ε a los
 *      iniciales y desde los finales. Asi S no recibe flechas y F no las manda,
 *      que es lo que garantiza que al final solo quede la arista S → F.
 *   2. Se borra un estado q cualquiera. Todo camino i → q → j que pasaba por el
 *      se sustituye por una sola arista i → j etiquetada con
 *            R(i,q) · R(q,q)* · R(q,j)
 *      unida a lo que ya hubiera en i → j.
 *   3. Se repite hasta que solo quedan S y F. La etiqueta de S → F es la
 *      expresion regular del lenguaje.
 *
 * El orden en que se eliminan los estados no cambia el lenguaje, pero si el
 * tamaño de la expresion: se elimina primero el estado que menos aristas nuevas
 * genera (entradas x salidas).
 */

const EMPTY: RegexNode = { type: 'empty' }
const EPS: RegexNode = { type: 'eps' }

const show = (n: RegexNode): string => regexToString(n)
const same = (a: RegexNode, b: RegexNode): boolean => show(a) === show(b)

// ---------------------------------------------------------------------------
// Constructores que simplifican sobre la marcha
// ---------------------------------------------------------------------------

/** r | s, aplicando las identidades del algebra de expresiones regulares. */
export function union(a: RegexNode, b: RegexNode): RegexNode {
  if (a.type === 'empty') return b // ∅ | r = r
  if (b.type === 'empty') return a
  if (same(a, b)) return a // r | r = r
  // ε | r  se escribe mejor como r?
  if (a.type === 'eps') return optional(b)
  if (b.type === 'eps') return optional(a)
  return { type: 'union', left: a, right: b }
}

/** r · s */
export function concat(a: RegexNode, b: RegexNode): RegexNode {
  if (a.type === 'empty' || b.type === 'empty') return EMPTY // ∅·r = ∅
  if (a.type === 'eps') return b // ε·r = r
  if (b.type === 'eps') return a
  // r·r* = r+   y   r*·r = r+
  if (b.type === 'star' && same(a, b.child)) return { type: 'plus', child: a }
  if (a.type === 'star' && same(b, a.child)) return { type: 'plus', child: b }
  return { type: 'concat', left: a, right: b }
}

/** r* */
export function star(a: RegexNode): RegexNode {
  if (a.type === 'empty' || a.type === 'eps') return EPS // ∅* = ε* = ε
  // (r*)* = (r+)* = (r?)* = r*
  if (a.type === 'star') return a
  if (a.type === 'plus' || a.type === 'opt') return { type: 'star', child: a.child }
  return { type: 'star', child: a }
}

/** r? */
function optional(a: RegexNode): RegexNode {
  if (a.type === 'empty') return EPS
  if (a.type === 'eps') return EPS
  // r* y r+ ya aceptan la cadena vacia o se vuelven estrella
  if (a.type === 'star') return a
  if (a.type === 'plus') return { type: 'star', child: a.child }
  if (a.type === 'opt') return a
  return { type: 'opt', child: a }
}

// ---------------------------------------------------------------------------
// Eliminacion de estados
// ---------------------------------------------------------------------------

export interface ToRegexResult {
  /** La expresion regular ya escrita como texto. */
  regex: string
  node: RegexNode
  steps: Step[]
}

export function automatonToRegex(a: Automaton, opts: { maxSteps?: number } = {}): ToRegexResult {
  const steps: Step[] = []

  // Solo interesan los estados por los que puede pasar una cadena aceptada:
  // los alcanzables desde el inicial y desde los que se puede llegar a un final.
  const alcanzables = reachableStates(a)
  const utiles = coReachableStates(a)
  const ids = a.states.filter((s) => alcanzables.has(s.id) && utiles.has(s.id)).map((s) => s.id)

  if (ids.length === 0 || finalStates(a).length === 0) {
    steps.push({
      title: 'El lenguaje es vacio',
      body:
        'No hay ningun camino del estado inicial a un estado final, asi que el automata no acepta ninguna cadena. ' +
        'La expresion regular correspondiente es **∅**.',
    })
    return { regex: '∅', node: EMPTY, steps }
  }

  const labelOf = new Map(a.states.map((s) => [s.id, s.label]))
  const index = new Map(ids.map((id, i) => [id, i]))
  const n = ids.length
  const S = n
  const F = n + 1
  const nombre = (i: number) => (i === S ? 'S' : i === F ? 'F' : labelOf.get(ids[i]) ?? '?')

  // R[i][j] = expresion de las cadenas que llevan directamente de i a j.
  const R: RegexNode[][] = Array.from({ length: n + 2 }, () => Array.from({ length: n + 2 }, () => EMPTY))

  for (const t of a.transitions) {
    const i = index.get(t.from)
    const j = index.get(t.to)
    if (i === undefined || j === undefined) continue
    const sym: RegexNode = t.symbol === EPSILON ? EPS : { type: 'sym', value: t.symbol }
    R[i][j] = union(R[i][j], sym)
  }
  for (const q of initialStates(a)) {
    const i = index.get(q.id)
    if (i !== undefined) R[S][i] = union(R[S][i], EPS)
  }
  for (const q of finalStates(a)) {
    const i = index.get(q.id)
    if (i !== undefined) R[i][F] = union(R[i][F], EPS)
  }

  let vivos = ids.map((_, i) => i)

  const tabla = (restantes: number[]) => {
    const cols = [...restantes, F]
    return {
      caption: 'Etiqueta de cada arista (∅ = no hay camino directo)',
      headers: ['de \\ a', ...cols.map(nombre)],
      rows: [S, ...restantes].map((i) => [nombre(i), ...cols.map((j) => show(R[i][j]))]),
    }
  }

  steps.push({
    title: 'Paso 1 · Preparar el automata',
    body:
      `Se añaden un estado inicial nuevo **S** y uno final nuevo **F**. S se une con ${EPSILON} a cada estado ` +
      `inicial, y cada estado final se une con ${EPSILON} a F. Asi S no recibe ninguna flecha y F no manda ninguna, ` +
      `que es justo lo que hace que al final solo pueda quedar la arista S → F.`,
    table: tabla(vivos),
    automaton: a,
  })

  const maxSteps = opts.maxSteps ?? 12

  while (vivos.length > 0) {
    // Se elimina el estado que genere menos aristas nuevas.
    let mejor = vivos[0]
    let mejorCoste = Infinity
    for (const q of vivos) {
      const entradas = [S, ...vivos].filter((i) => i !== q && R[i][q].type !== 'empty').length
      const salidas = [...vivos, F].filter((j) => j !== q && R[q][j].type !== 'empty').length
      const coste = entradas * salidas
      if (coste < mejorCoste) {
        mejorCoste = coste
        mejor = q
      }
    }
    const q = mejor

    const bucle = star(R[q][q])
    const entradas = [S, ...vivos].filter((i) => i !== q && R[i][q].type !== 'empty')
    const salidas = [...vivos, F].filter((j) => j !== q && R[q][j].type !== 'empty')

    for (const i of entradas) {
      for (const j of salidas) {
        R[i][j] = union(R[i][j], concat(concat(R[i][q], bucle), R[q][j]))
      }
    }
    for (const i of [S, ...vivos]) R[i][q] = EMPTY
    for (const j of [...vivos, F]) R[q][j] = EMPTY

    vivos = vivos.filter((x) => x !== q)

    // El procedimiento completo puede ser larguisimo: se muestran los primeros
    // pasos y, si hay muchos, se resume el resto.
    if (steps.length <= maxSteps) {
      steps.push({
        title: `Paso ${steps.length + 1} · Se elimina el estado ${nombre(q)}`,
        body:
          `Cada camino que entraba a ${nombre(q)} y volvia a salir se sustituye por una sola arista con la etiqueta ` +
          `**R(i, ${nombre(q)}) · R(${nombre(q)}, ${nombre(q)})\\* · R(${nombre(q)}, j)**, unida a la que ya hubiera. ` +
          (R[q][q].type !== 'empty'
            ? `El bucle sobre ${nombre(q)} aporta el factor **${show(bucle)}**.`
            : `${nombre(q)} no tenia bucle propio, asi que ese factor es ε y desaparece.`),
        table: vivos.length ? tabla(vivos) : undefined,
      })
    }
  }

  const node = R[S][F]
  const regex = show(node)

  if (steps.length > maxSteps) {
    steps.push({
      title: 'Pasos intermedios resumidos',
      body: `Se omitieron los pasos intermedios por ser muchos; el resultado final es el que se muestra a continuacion.`,
    })
  }

  steps.push({
    title: 'Resultado · Expresion regular equivalente',
    body:
      `Al quedar solo S y F, la etiqueta de la unica arista que los une es la expresion regular del lenguaje:\n\n` +
      `**${regex}**`,
  })

  return { regex, node, steps }
}

/** Atajo cuando solo interesa el texto de la expresion. */
export const automatonToRegexString = (a: Automaton): string => automatonToRegex(a).regex
