import { Automaton, Step } from '../types'
import { completeDFA, inferAlphabet, isDeterministic } from '../automaton'
import { subsetConstruction } from '../algorithms/subset'
import { complement, product } from '../algorithms/boolean'
import { RegexNode, needsDeterminization, regexToString } from './parser'
import { thompson } from './thompson'

/**
 * Expresion regular -> automata, incluidos los operadores extendidos.
 *
 * Los operadores clasicos (| · * + ?) se construyen con Thompson en una sola
 * pasada, que es lo que se explica en clase. Los extendidos no se pueden hacer
 * con fragmentos ε:
 *
 *   ~E     complemento   -> determinizar E, completarlo e invertir los finales
 *   E && F interseccion  -> producto de los AFD de E y F (final si ambos lo son)
 *   E - F  diferencia    -> E ∩ ~F
 *
 * Por eso el arbol se recorre de abajo hacia arriba: cada subarbol que solo usa
 * operadores clasicos se resuelve entero con Thompson, y al llegar a un operador
 * extendido se determinizan sus dos lados y se aplica la operacion booleana.
 */

/** Expande {n,m} a concatenaciones, para que Thompson solo vea operadores clasicos. */
export function desugar(node: RegexNode): RegexNode {
  switch (node.type) {
    case 'repeat': {
      const child = desugar(node.child)
      const copies = (k: number): RegexNode =>
        k === 0 ? { type: 'eps' } : Array.from({ length: k }, () => child).reduce((a, b) => ({ type: 'concat', left: a, right: b }))

      // {n,}  ->  n copias seguidas de (child)*
      if (node.max === null) {
        const tail: RegexNode = { type: 'star', child }
        return node.min === 0 ? tail : { type: 'concat', left: copies(node.min), right: tail }
      }
      // {n,m} ->  n copias seguidas de (m - n) copias opcionales
      let out: RegexNode = copies(node.min)
      for (let k = node.min; k < node.max; k++) {
        out = { type: 'concat', left: out, right: { type: 'opt', child } }
      }
      return out
    }
    case 'union':
    case 'inter':
    case 'diff':
    case 'concat':
      return { type: node.type, left: desugar(node.left), right: desugar(node.right) }
    case 'star':
    case 'plus':
    case 'opt':
    case 'compl':
      return { type: node.type, child: desugar(node.child) }
    default:
      return node
  }
}

/** AFD completo equivalente, que es lo que exigen el producto y el complemento. */
function toDfa(a: Automaton, alphabet: string[]): Automaton {
  const withAlpha: Automaton = { ...a, alphabet: [...new Set([...alphabet, ...inferAlphabet(a)])].sort() }
  const det = isDeterministic(withAlpha) ? withAlpha : subsetConstruction(withAlpha, { name: withAlpha.name }).automaton
  return completeDFA({ ...det, alphabet: withAlpha.alphabet }).automaton
}

export interface RegexBuildResult {
  automaton: Automaton
  steps: Step[]
  /** true si hizo falta determinizar por usar ~, && o −. */
  usedBooleanOps: boolean
}

/**
 * Construye el automata de una expresion regular ya analizada.
 * `alphabet` es el alfabeto de referencia; hace falta para el complemento,
 * porque "todo lo que no esta en L" depende de cual sea Σ.
 */
export function buildFromRegex(node: RegexNode, alphabet: string[]): RegexBuildResult {
  const steps: Step[] = []
  const sugarFree = desugar(node)
  const usedBooleanOps = needsDeterminization(sugarFree)

  const build = (n: RegexNode): Automaton => {
    // Un subarbol sin operadores booleanos se resuelve entero con Thompson.
    if (!needsDeterminization(n)) {
      const th = thompson(n)
      steps.push(...th.steps)
      return th.automaton
    }

    switch (n.type) {
      case 'compl': {
        const inner = toDfa(build(n.child), alphabet)
        steps.push({
          title: `Complemento: ~(${regexToString(n.child)})`,
          body:
            `El complemento no se puede construir con fragmentos ε. Se determiniza el automata de ` +
            `**${regexToString(n.child)}**, se completa con estado trampa (para que δ este definida siempre) ` +
            `y se **intercambian los estados finales con los no finales**. Sin completar, las cadenas que se ` +
            `quedaban sin transicion no llegarian a ningun estado y se perderian.`,
          table: undefined,
          automaton: inner,
        })
        return complement(inner, `complemento de ${regexToString(n.child)}`)
      }
      case 'inter': {
        const l = toDfa(build(n.left), alphabet)
        const r = toDfa(build(n.right), alphabet)
        steps.push({
          title: `Interseccion: ${regexToString(n.left)} ∩ ${regexToString(n.right)}`,
          body:
            `Se determinizan los dos lados y se construye el **automata producto**: sus estados son pares ` +
            `(p, q) y un par es final solo si **ambos** lo son. El resultado acepta exactamente las cadenas ` +
            `que cumplen las dos expresiones a la vez.`,
        })
        return product(l, r, 'and', `${regexToString(n.left)} ∩ ${regexToString(n.right)}`)
      }
      case 'diff': {
        const l = toDfa(build(n.left), alphabet)
        const r = complement(toDfa(build(n.right), alphabet))
        steps.push({
          title: `Diferencia: ${regexToString(n.left)} − ${regexToString(n.right)}`,
          body:
            `La diferencia se reescribe como **L₁ ∩ complemento(L₂)**: se complementa el segundo automata ` +
            `y se hace el producto con el primero. Acepta lo que cumple la primera expresion pero no la segunda.`,
        })
        return product(l, r, 'and', `${regexToString(n.left)} − ${regexToString(n.right)}`)
      }
      // Operadores clasicos con algun operando booleano dentro: se resuelve el
      // operando y se aplica la operacion sobre automatas ya determinizados.
      case 'union': {
        const l = toDfa(build(n.left), alphabet)
        const r = toDfa(build(n.right), alphabet)
        steps.push({
          title: `Union: ${regexToString(n.left)} | ${regexToString(n.right)}`,
          body:
            `Uno de los dos lados usa operadores booleanos, asi que la union tambien se resuelve con el ` +
            `producto: el par (p, q) es final si lo es **alguno** de los dos.`,
        })
        return product(l, r, 'or', `${regexToString(n.left)} | ${regexToString(n.right)}`)
      }
      default:
        throw new Error(
          `No se puede combinar "${n.type}" con operadores booleanos. ` +
            `Escribe esa parte entre parentesis, por ejemplo (a*)&&(.*b), o construyela por separado.`,
        )
    }
  }

  const automaton = build(sugarFree)
  return { automaton: { ...automaton, alphabet: [...new Set([...alphabet, ...inferAlphabet(automaton)])].sort() }, steps, usedBooleanOps }
}
