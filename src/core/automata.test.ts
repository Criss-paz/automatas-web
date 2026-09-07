import { describe, it, expect } from 'vitest'
import { solve } from './solver'
import { parseRegex } from './regex/parser'
import { thompson } from './regex/thompson'
import { subsetConstruction } from './algorithms/subset'
import { brzozowski } from './algorithms/brzozowski'
import { minimizeTableFilling } from './algorithms/minimize'
import { checkEquivalence, accepts } from './algorithms/equivalence'
import { parseFormal } from './formal'
import { isDeterministic, isComplete } from './automaton'

const fromRegex = (re: string) => thompson(parseRegex(re)).automaton

describe('expresiones regulares y Thompson', () => {
  it('(a|b)*abb reconoce el lenguaje correcto', () => {
    const nfa = fromRegex('(a|b)*abb')
    for (const w of ['abb', 'aabb', 'babb', 'abababb', 'bbabb']) expect(accepts(nfa, w)).toBe(true)
    for (const w of ['', 'a', 'ab', 'abba', 'ba', 'abbb']) expect(accepts(nfa, w)).toBe(false)
  })

  it('el AFD minimo de (a|b)*abb tiene 4 estados', () => {
    const min = brzozowski(subsetConstruction(fromRegex('(a|b)*abb')).automaton).automaton
    expect(min.states.length).toBe(4)
    expect(isDeterministic(min)).toBe(true)
    expect(isComplete(min)).toBe(true)
  })

  it('maneja epsilon, + y ?', () => {
    const a = fromRegex('(a|ε)b')
    expect(accepts(a, 'b')).toBe(true)
    expect(accepts(a, 'ab')).toBe(true)
    expect(accepts(a, 'aab')).toBe(false)

    const p = fromRegex('a+b?')
    expect(accepts(p, 'a')).toBe(true)
    expect(accepts(p, 'aab')).toBe(true)
    expect(accepts(p, 'b')).toBe(false)
    expect(accepts(p, 'abb')).toBe(false)
  })
})

describe('determinizacion con clausura-epsilon', () => {
  it('convierte un AFN-ε en AFD equivalente', () => {
    const spec = `Q = {q0,q1,q2}
Sigma = {a,b}
inicial = q0
F = {q2}
q0, a -> q0
q0, a -> q1
q0, b -> q0
q1, e -> q2
q1, b -> q2`
    const nfa = parseFormal(spec).automaton!
    const dfa = subsetConstruction(nfa).automaton
    expect(isDeterministic(dfa)).toBe(true)
    const eq = checkEquivalence(nfa, dfa)
    expect(eq.equivalent).toBe(true)
  })

  it('muestra graficamente la clausura, los subconjuntos y el AFD resultante', () => {
    const nfa = parseFormal(`Q = {q0,q1,q2}
Sigma = {a,b}
inicial = q0
F = {q2}
q0, e -> q1
q1, a -> q2
q2, b -> q2`).automaton!
    const result = subsetConstruction(nfa)
    expect(result.steps.find((step) => step.title.includes('Clausura'))?.automaton).toBeDefined()
    expect(result.steps.find((step) => step.title.includes('Tabla de subconjuntos'))?.automaton).toBeDefined()
    expect(result.steps.find((step) => step.title.includes('AFD resultante'))?.automaton).toBeDefined()
    expect(result.steps.filter((step) => step.table).length).toBeGreaterThanOrEqual(3)
  })
})

describe('minimizacion', () => {
  const REGEXES = ['(a|b)*abb', 'a*b*', '(0|1)*01', 'a(a|b)*', '((a|b)(a|b))*', 'a|b|ab', '(ab)*a?', 'a*b*c*']

  it('Brzozowski y la tabla de estados distinguibles coinciden en el numero de estados', () => {
    for (const re of REGEXES) {
      const dfa = subsetConstruction(fromRegex(re)).automaton
      const brz = brzozowski(dfa).automaton
      const tab = minimizeTableFilling(dfa).automaton
      expect(brz.states.length, `regex ${re}`).toBe(tab.states.length)
    }
  })

  it('expone los cuatro pasos de Brzozowski con automata y tabla', () => {
    const result = brzozowski(subsetConstruction(fromRegex('(a|b)*abb')).automaton)
    const algorithmSteps = result.steps.filter((step) => /^Paso [1-4]/.test(step.title))
    expect(algorithmSteps).toHaveLength(4)
    expect(algorithmSteps.every((step) => step.automaton)).toBe(true)
    expect(algorithmSteps.every((step) => step.table)).toBe(true)
  })

  it('el minimo siempre es equivalente al original', () => {
    for (const re of REGEXES) {
      const nfa = fromRegex(re)
      const min = brzozowski(subsetConstruction(nfa).automaton).automaton
      expect(checkEquivalence(nfa, min).equivalent, `regex ${re}`).toBe(true)
      expect(isDeterministic(min), `regex ${re}`).toBe(true)
    }
  })

  it('reduce un AFD con estados redundantes', () => {
    const spec = `Q = {A,B,C,D,E}
Sigma = {0,1}
inicial = A
F = {C,D,E}
A, 0 -> B
A, 1 -> C
B, 0 -> A
B, 1 -> D
C, 0 -> E
C, 1 -> C
D, 0 -> E
D, 1 -> D
E, 0 -> E
E, 1 -> C`
    const dfa = parseFormal(spec).automaton!
    const min = brzozowski(dfa).automaton
    expect(min.states.length).toBeLessThan(dfa.states.length)
    expect(checkEquivalence(dfa, min).equivalent).toBe(true)
  })
})

describe('verificacion de equivalencia', () => {
  it('detecta automatas equivalentes escritos distinto', () => {
    const a = fromRegex('(a|b)*abb')
    const b = fromRegex('(a|b)*a(a|b)*abb')
    // No son el mismo lenguaje: el segundo exige una 'a' extra antes.
    const eq = checkEquivalence(a, b)
    expect(eq.equivalent).toBe(false)
    expect(eq.counterexample).toBeDefined()
    // El contraejemplo debe distinguirlos de verdad.
    const w = eq.counterexample!.word
    expect(accepts(a, w)).not.toBe(accepts(b, w))
  })

  it('confirma equivalencia entre a*a* y a*', () => {
    expect(checkEquivalence(fromRegex('a*a*'), fromRegex('a*')).equivalent).toBe(true)
  })

  it('el contraejemplo es la cadena mas corta', () => {
    const eq = checkEquivalence(fromRegex('a'), fromRegex('aa'))
    expect(eq.equivalent).toBe(false)
    expect(eq.counterexample!.word.length).toBeLessThanOrEqual(2)
  })
})

describe('enunciados en español', () => {
  const run = (t: string) => {
    const r = solve(t, 'enunciado')
    expect(r.ok, `fallo: ${r.error}`).toBe(true)
    return r
  }

  it('empieza con a y termina en b', () => {
    const m = run('Cadenas sobre {a,b} que empiecen con a y terminen en b').minimal!
    for (const w of ['ab', 'aab', 'abb', 'aaab']) expect(accepts(m, w), w).toBe(true)
    for (const w of ['', 'a', 'b', 'ba', 'aba' + 'a']) expect(accepts(m, w), w).toBe(false)
  })

  it('numero par de a', () => {
    const m = run('Cadenas sobre {a,b} con número par de a').minimal!
    expect(m.states.length).toBe(2)
    for (const w of ['', 'aa', 'b', 'baba', 'aabb', 'aab']) expect(accepts(m, w), w).toBe(true)
    for (const w of ['a', 'ab', 'bab', 'aaa']) expect(accepts(m, w), w).toBe(false)
  })

  it('no contienen aa', () => {
    const m = run('Cadenas sobre {a,b} que no contengan aa').minimal!
    for (const w of ['', 'a', 'ab', 'abab', 'bbb']) expect(accepts(m, w), w).toBe(true)
    for (const w of ['aa', 'baab', 'aab']) expect(accepts(m, w), w).toBe(false)
  })

  it('longitud impar y contiene ab', () => {
    const m = run('Cadenas sobre {a,b} que contengan ab y de longitud impar').minimal!
    for (const w of ['aba', 'abb', 'bab']) expect(accepts(m, w), w).toBe(true)
    for (const w of ['ab', 'aabb', 'a', 'bbb']) expect(accepts(m, w), w).toBe(false)
  })

  it('binarios multiplos de 3', () => {
    const m = run('Cadenas sobre {0,1} que sean múltiplos de 3').minimal!
    for (const w of ['0', '11', '110', '1001', '1100']) expect(accepts(m, w), w).toBe(true)
    for (const w of ['1', '10', '100', '111']) expect(accepts(m, w), w).toBe(false)
  })

  it('par de a e impar de b', () => {
    const m = run('Cadenas sobre {a,b} con número par de a y número impar de b').minimal!
    expect(m.states.length).toBe(4)
    for (const w of ['b', 'aab', 'bbb', 'abab' + 'b']) expect(accepts(m, w), w).toBe(true)
    for (const w of ['', 'a', 'ab', 'bb']) expect(accepts(m, w), w).toBe(false)
  })

  it('avisa cuando no entiende el enunciado', () => {
    const r = solve('resuelve esto por favor', 'enunciado')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('No se reconocio')
  })
})

describe('solve() completo', () => {
  it('la verificacion pasa en los tres modos de entrada', () => {
    const cases: Array<[string, 'enunciado' | 'regex' | 'formal']> = [
      ['Cadenas sobre {a,b} que terminen en ab', 'enunciado'],
      ['(a|b)*abb', 'regex'],
      ['Q = {q0,q1}\nSigma = {a,b}\ninicial = q0\nF = {q1}\nq0, a -> q1\nq1, b -> q0\nq0, b -> q0\nq1, a -> q1', 'formal'],
    ]
    for (const [text, mode] of cases) {
      const r = solve(text, mode)
      expect(r.ok, `${mode}: ${r.error}`).toBe(true)
      expect(r.verification!.equivalent, `${mode} no verifico`).toBe(true)
      expect(r.verification!.brzozowskiStates).toBe(r.verification!.tableFillingStates)
      expect(r.sections.length).toBe(6)
    }
  })
})
