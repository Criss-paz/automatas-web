import { describe, it, expect } from 'vitest'
import { Automaton, EPSILON, State, Transition } from './types'
import { uid, isDeterministic, removeUnreachable } from './automaton'
import { subsetConstruction } from './algorithms/subset'
import { brzozowski } from './algorithms/brzozowski'
import { minimizeTableFilling } from './algorithms/minimize'
import { checkEquivalence, bruteForceCompare } from './algorithms/equivalence'

/** Generador pseudoaleatorio con semilla, para que las pruebas sean reproducibles. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** AFN aleatorio, posiblemente con transiciones ε y estados inalcanzables. */
function randomNFA(rand: () => number, alphabet = ['a', 'b']): Automaton {
  const n = 2 + Math.floor(rand() * 5)
  const states: State[] = Array.from({ length: n }, (_, i) => ({
    id: uid('r'),
    label: `q${i}`,
    x: 0,
    y: 0,
    isInitial: i === 0,
    isFinal: rand() < 0.4,
  }))
  if (!states.some((s) => s.isFinal)) states[n - 1].isFinal = true

  const transitions: Transition[] = []
  for (let i = 0; i < n; i++) {
    for (const sym of alphabet) {
      const k = Math.floor(rand() * 2.4) // 0, 1 o 2 destinos -> no determinismo
      for (let j = 0; j < k; j++) {
        transitions.push({
          id: uid('t'),
          from: states[i].id,
          to: states[Math.floor(rand() * n)].id,
          symbol: sym,
        })
      }
    }
    if (rand() < 0.3) {
      transitions.push({
        id: uid('t'),
        from: states[i].id,
        to: states[Math.floor(rand() * n)].id,
        symbol: EPSILON,
      })
    }
  }
  return { name: 'AFN aleatorio', alphabet, states, transitions }
}

describe('propiedades sobre automatas aleatorios', () => {
  it('Brzozowski produce siempre un AFD minimo equivalente (200 casos)', () => {
    const rand = rng(20260907)
    for (let caso = 0; caso < 200; caso++) {
      const nfa = randomNFA(rand)
      const dfa = subsetConstruction(nfa).automaton
      const min = brzozowski(dfa).automaton
      const tab = minimizeTableFilling(dfa).automaton

      // 1. El resultado es un AFD.
      expect(isDeterministic(min), `caso ${caso}: no es AFD`).toBe(true)

      // 2. Es equivalente al AFN de partida.
      expect(checkEquivalence(nfa, min).equivalent, `caso ${caso}: no equivalente al AFN`).toBe(true)

      // 3. Coincide con el otro metodo de minimizacion.
      expect(min.states.length, `caso ${caso}: distinto numero de estados que la tabla`).toBe(tab.states.length)

      // 4. Ninguna cadena corta los distingue.
      expect(bruteForceCompare(nfa, min, 6).mismatches.length, `caso ${caso}: discrepancia por fuerza bruta`).toBe(0)

      // 5. Es realmente minimo: no queda nada que fusionar ni estados inalcanzables.
      expect(minimizeTableFilling(min).automaton.states.length, `caso ${caso}: aun reducible`).toBe(min.states.length)
      expect(removeUnreachable(min).removed.length, `caso ${caso}: tiene inalcanzables`).toBe(0)
    }
  })

  it('la comparacion de equivalencia no da falsos positivos (200 pares)', () => {
    const rand = rng(4242)
    let distintos = 0
    for (let caso = 0; caso < 200; caso++) {
      const a = subsetConstruction(randomNFA(rand)).automaton
      const b = subsetConstruction(randomNFA(rand)).automaton
      const eq = checkEquivalence(a, b)
      const bf = bruteForceCompare(a, b, 7)

      if (eq.equivalent) {
        // Si dice que son equivalentes, la fuerza bruta no debe encontrar diferencias.
        expect(bf.mismatches.length, `caso ${caso}: dijo equivalentes pero difieren`).toBe(0)
      } else {
        distintos++
        // El contraejemplo debe distinguirlos de verdad.
        const w = eq.counterexample!.word
        const r = bruteForceCompare(a, b, w.length)
        expect(r.mismatches.some((m) => m.word === w), `caso ${caso}: contraejemplo invalido "${w}"`).toBe(true)
      }
    }
    expect(distintos).toBeGreaterThan(0)
  })
})
