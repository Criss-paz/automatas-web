import { Automaton, EPSILON, Step } from '../types'
import {
  cloneAutomaton,
  finalStates,
  hasEpsilon,
  inferAlphabet,
  removeUnreachable,
  renameSequential,
  reverseAutomaton,
  transitionTable,
} from '../automaton'
import { autoLayout } from '../layout'
import { subsetConstruction } from './subset'

export interface BrzozowskiResult {
  automaton: Automaton
  steps: Step[]
}

/**
 * Algoritmo de Brzozowski.
 *
 *      A  --R-->  Aʳ  --D-->  B  --R-->  Bʳ  --D-->  AFD MINIMO
 *
 * R = invertir (voltear flechas, intercambiar inicial y finales).
 * D = construccion de subconjuntos quedandose solo con los estados alcanzables.
 *
 * Sirve a la vez para DETERMINIZAR (AFN -> AFD) y para MINIMIZAR, porque el
 * resultado de la doble inversion + doble determinizacion es siempre el AFD
 * minimo del lenguaje original.
 */
export function brzozowski(input: Automaton, opts: { finalName?: string } = {}): BrzozowskiResult {
  const steps: Step[] = []
  const alphabet = inferAlphabet(input)

  // --- Paso 0: preparacion --------------------------------------------------
  const trimmed0 = removeUnreachable({ ...cloneAutomaton(input), alphabet })
  const A = autoLayout(trimmed0.automaton)
  steps.push({
    title: 'Paso 0 · Automata de partida',
    body:
      `Alfabeto Σ = {${alphabet.join(', ')}}. ` +
      (hasEpsilon(A)
        ? `El automata tiene transiciones ${EPSILON}; Brzozowski las absorbe sin problema porque la determinizacion aplica la clausura-ε.\n`
        : '') +
      (trimmed0.removed.length
        ? `Se eliminaron los estados inalcanzables desde el inicial: ${trimmed0.removed.join(', ')}. Es un requisito del algoritmo: todos los estados deben ser alcanzables para que la doble determinizacion produzca el minimo.`
        : 'Todos los estados son alcanzables desde el inicial, que es lo que el algoritmo requiere.'),
    table: { caption: 'Tabla de transiciones de partida', ...transitionTable(A) },
    automaton: A,
  })

  // --- Paso 1: primera inversion -------------------------------------------
  const R1 = autoLayout(renameSequential(reverseAutomaton(A, 'Aʳ (primera inversion)'), 'r'))
  steps.push({
    title: 'Paso 1 · Primera inversion  R(A)',
    body:
      `Se invierte el sentido de **todas** las flechas. Los estados finales de A pasan a ser iniciales y el inicial de A pasa a ser final. ` +
      (finalStates(A).length > 1
        ? `Como A tenia ${finalStates(A).length} estados finales, el reverso queda con ${finalStates(A).length} estados iniciales. Se dejan asi a proposito: si en su lugar se agregara un estado inicial nuevo unido a ellos con ${EPSILON}, ese estado postizo haria que la determinizacion del paso siguiente distinguiera subconjuntos que solo se diferencian en el, y el resultado ya no seria el minimo. La determinizacion simplemente arranca desde la clausura-ε de todos los iniciales a la vez. `
        : '') +
      `El resultado reconoce el lenguaje invertido Lʳ y en general es un AFN, aunque A fuera un AFD.`,
    table: { caption: 'Tabla de transiciones de Aʳ', ...transitionTable(R1) },
    automaton: R1,
  })

  // --- Paso 2: primera determinizacion -------------------------------------
  const d1 = subsetConstruction(R1, { name: 'B = D(Aʳ)' })
  const B0 = removeUnreachable(d1.automaton)
  const B = autoLayout(B0.automaton)
  steps.push({
    title: 'Paso 2 · Primera determinizacion  D(R(A))',
    body:
      `Se determiniza Aʳ por construccion de subconjuntos (aplicando clausura-ε en cada paso). ` +
      `Por el teorema de Brzozowski, este AFD ya es **el minimo del lenguaje invertido** Lʳ, porque todos sus estados son alcanzables por construccion y todos son distinguibles entre si.`,
    table: d1.steps.find((s) => s.table?.headers[0] === 'Subconjunto')?.table,
    automaton: B,
  })

  // --- Paso 3: segunda inversion -------------------------------------------
  const R2 = autoLayout(renameSequential(reverseAutomaton(B, 'Bʳ (segunda inversion)'), 's'))
  steps.push({
    title: 'Paso 3 · Segunda inversion  R(D(R(A)))',
    body:
      `Se vuelve a invertir. Al invertir dos veces se recupera el lenguaje original L: (Lʳ)ʳ = L. ` +
      `Este automata intermedio vuelve a ser un AFN.`,
    table: { caption: 'Tabla de transiciones de Bʳ', ...transitionTable(R2) },
    automaton: R2,
  })

  // --- Paso 4: segunda determinizacion -> minimo ---------------------------
  const d2 = subsetConstruction(R2, { name: opts.finalName ?? 'AFD minimo' })
  const M0 = removeUnreachable(d2.automaton)
  const M = autoLayout(renameSequential({ ...M0.automaton, name: opts.finalName ?? 'AFD minimo' }, 'M'))
  steps.push({
    title: 'Paso 4 · Segunda determinizacion  D(R(D(R(A)))) = AFD minimo',
    body:
      `Se determiniza otra vez. Como la entrada de esta determinizacion es la inversion de un automata cuyos estados eran todos alcanzables, ` +
      `el resultado cumple las dos condiciones de minimalidad: **todos los estados son alcanzables** y **no hay dos estados equivalentes**. ` +
      `Por lo tanto este es el AFD minimo de L, y es unico salvo el nombre de los estados.\n` +
      `Estados: ${A.states.length} → **${M.states.length}**.`,
    table: d2.steps.find((s) => s.table?.headers[0] === 'Subconjunto')?.table,
    automaton: M,
  })

  steps.push({
    title: 'Resultado',
    body: `AFD minimo con ${M.states.length} estado(s) y alfabeto Σ = {${alphabet.join(', ')}}.`,
    table: { caption: 'Tabla de transiciones del AFD minimo', ...transitionTable(M) },
    automaton: M,
  })

  return { automaton: M, steps }
}

/**
 * Determinizacion "a la Brzozowski" para el flujo AFN -> AFD del modo dibujo:
 * primero muestra la construccion de subconjuntos clasica (el AFD equivalente
 * directo) y despues aplica Brzozowski para dar ademas el AFD minimo.
 */
export function nfaToDfaFull(input: Automaton): { dfa: Automaton; minimal: Automaton; steps: Step[] } {
  const alphabet = inferAlphabet(input)
  const src = autoLayout(removeUnreachable({ ...cloneAutomaton(input), alphabet }).automaton)

  const direct = subsetConstruction(src, { name: 'AFD equivalente' })
  const dfa = autoLayout(removeUnreachable(direct.automaton).automaton)

  const steps: Step[] = [
    {
      title: 'Automata de entrada (AFN)',
      body:
        `Alfabeto Σ = {${alphabet.join(', ')}}.` +
        (hasEpsilon(src)
          ? ` Contiene transiciones ${EPSILON}, que se eliminan al calcular la clausura-ε durante la determinizacion.`
          : ''),
      table: { caption: 'Tabla de transiciones del AFN', ...transitionTable(src) },
      automaton: src,
    },
    ...direct.steps,
  ]

  const brz = brzozowski(dfa, { finalName: 'AFD minimo' })
  steps.push({
    title: '— Ahora la minimizacion por Brzozowski —',
    body: `El AFD obtenido por subconjuntos es correcto pero puede tener estados de sobra. Se aplica Brzozowski para obtener el AFD minimo equivalente.`,
  })
  steps.push(...brz.steps)

  return { dfa, minimal: brz.automaton, steps }
}
