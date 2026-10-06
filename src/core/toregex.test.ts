import { describe, it, expect } from 'vitest'
import { Automaton, State, Transition, EPSILON } from './types'
import { uid } from './automaton'
import { automatonToRegex } from './algorithms/toRegex'
import { parseRegex, alphabetOf, splitAlphabetDeclaration } from './regex/parser'
import { buildFromRegex } from './regex/build'
import { checkEquivalence, accepts } from './algorithms/equivalence'
import { brzozowski } from './algorithms/brzozowski'
import { subsetConstruction } from './algorithms/subset'
import { parseStatement } from './nl/parser'

/**
 * Pruebas de la conversion automata -> expresion regular.
 *
 * La comprobacion clave es de IDA Y VUELTA: se convierte el automata en
 * expresion, la expresion de vuelta en automata, y se exige que los dos
 * automatas acepten exactamente el mismo lenguaje. Eso verifica a la vez la
 * eliminacion de estados y las simplificaciones algebraicas, sin depender de
 * como quede escrita la expresion.
 */

/** Construye el automata de una expresion (con declaracion de Σ si la trae). */
function fromRegex(input: string): Automaton {
  const { alphabet: declared, expression } = splitAlphabetDeclaration(input)
  const ast = parseRegex(expression, { alphabet: declared })
  const alpha = [...new Set([...(declared ?? []), ...alphabetOf(ast)])].sort()
  return buildFromRegex(ast, alpha).automaton
}

/** Convierte a expresion y vuelve a automata. */
function roundTrip(a: Automaton): { regex: string; back: Automaton } {
  const { regex } = automatonToRegex(a)
  if (regex === '∅') {
    // El lenguaje vacio no se puede escribir como expresion con simbolos.
    return { regex, back: { name: '∅', alphabet: a.alphabet, states: [], transitions: [] } }
  }
  return { regex, back: fromRegex(regex) }
}

function expectSameLanguage(a: Automaton, contexto: string) {
  const { regex, back } = roundTrip(a)
  expect(checkEquivalence(a, back).equivalent, `${contexto} -> "${regex}" no describe el mismo lenguaje`).toBe(true)
}

describe('expresiones regulares conocidas: ida y vuelta', () => {
  const CASOS = [
    '(a|b)*abb',
    'a*b*',
    '(0|1)*01',
    'a(a|b)*',
    '((a|b)(a|b))*',
    'a|b|ab',
    '(ab)*a?',
    'a*b*c*',
    'a+b?',
    '(a|ε)(a|b)*b',
    'abba',
    'a',
    'ε',
  ]

  for (const re of CASOS) {
    it(`conserva el lenguaje de ${re}`, () => {
      expectSameLanguage(fromRegex(re), `la expresion ${re}`)
    })
  }

  it('tambien desde el AFD minimo', () => {
    for (const re of CASOS) {
      const min = brzozowski(subsetConstruction(fromRegex(re)).automaton).automaton
      expectSameLanguage(min, `el minimo de ${re}`)
    }
  })
})

describe('casos limite', () => {
  it('un automata sin estados finales da el lenguaje vacio', () => {
    const q: State = { id: uid('x'), label: 'q0', x: 0, y: 0, isInitial: true, isFinal: false }
    const a: Automaton = { name: 'sin finales', alphabet: ['a'], states: [q], transitions: [] }
    expect(automatonToRegex(a).regex).toBe('∅')
  })

  it('un automata que solo acepta ε da ε', () => {
    const q: State = { id: uid('x'), label: 'q0', x: 0, y: 0, isInitial: true, isFinal: true }
    const a: Automaton = { name: 'solo epsilon', alphabet: ['a'], states: [q], transitions: [] }
    expect(automatonToRegex(a).regex).toBe('ε')
  })

  it('ignora los estados inalcanzables y los que no llevan a un final', () => {
    const q0: State = { id: uid('x'), label: 'q0', x: 0, y: 0, isInitial: true, isFinal: false }
    const q1: State = { id: uid('x'), label: 'q1', x: 0, y: 0, isInitial: false, isFinal: true }
    const muerto: State = { id: uid('x'), label: 'T', x: 0, y: 0, isInitial: false, isFinal: false }
    const suelto: State = { id: uid('x'), label: 'Z', x: 0, y: 0, isInitial: false, isFinal: false }
    const t = (from: string, sym: string, to: string): Transition => ({ id: uid('t'), from, to, symbol: sym })
    const a: Automaton = {
      name: 'con basura',
      alphabet: ['a', 'b'],
      states: [q0, q1, muerto, suelto],
      transitions: [t(q0.id, 'a', q1.id), t(q0.id, 'b', muerto.id), t(muerto.id, 'a', muerto.id), t(suelto.id, 'a', q1.id)],
    }
    expect(automatonToRegex(a).regex).toBe('a')
  })

  it('el procedimiento explica cada eliminacion', () => {
    const r = automatonToRegex(fromRegex('(a|b)*abb'))
    expect(r.steps.length).toBeGreaterThan(2)
    expect(r.steps[0].title).toMatch(/Preparar/)
    expect(r.steps.some((s) => /Se elimina el estado/.test(s.title))).toBe(true)
    expect(r.steps[r.steps.length - 1].title).toMatch(/Expresion regular/)
  })
})

describe('simplificaciones algebraicas', () => {
  it('no deja ∅ ni ε sueltos en expresiones normales', () => {
    for (const re of ['(a|b)*abb', 'a*b*', 'a(a|b)*']) {
      const salida = automatonToRegex(fromRegex(re)).regex
      expect(salida.includes('∅'), `${re} -> ${salida}`).toBe(false)
    }
  })

  it('reconoce r·r* como r+', () => {
    // a+ es exactamente a·a*
    const a = fromRegex('aa*')
    const { regex } = automatonToRegex(a)
    expect(accepts(fromRegex(regex), 'aaa')).toBe(true)
    expect(accepts(fromRegex(regex), '')).toBe(false)
  })
})

describe('automatas aleatorios: ida y vuelta', () => {
  function rng(seed: number) {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  }

  /** AFN aleatorio, con transiciones ε y posibles estados inservibles. */
  function randomNFA(rand: () => number, alphabet = ['a', 'b']): Automaton {
    const n = 2 + Math.floor(rand() * 4)
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
        const k = Math.floor(rand() * 2.4)
        for (let j = 0; j < k; j++) {
          transitions.push({ id: uid('t'), from: states[i].id, to: states[Math.floor(rand() * n)].id, symbol: sym })
        }
      }
      if (rand() < 0.25) {
        transitions.push({ id: uid('t'), from: states[i].id, to: states[Math.floor(rand() * n)].id, symbol: EPSILON })
      }
    }
    return { name: 'aleatorio', alphabet, states, transitions }
  }

  it('150 automatas aleatorios conservan su lenguaje al pasar por la expresion', () => {
    const rand = rng(20260908)
    for (let i = 0; i < 150; i++) {
      const a = randomNFA(rand)
      const { regex, back } = roundTrip(a)
      if (regex === '∅') {
        // Sin finales alcanzables: no debe aceptar nada hasta longitud 6.
        for (const w of ['', 'a', 'b', 'aa', 'ab', 'ba', 'bb', 'aba', 'bab']) {
          expect(accepts(a, w), `caso ${i}: dice ∅ pero acepta "${w}"`).toBe(false)
        }
        continue
      }
      expect(checkEquivalence(a, back).equivalent, `caso ${i}: "${regex}" no coincide`).toBe(true)
    }
  })
})

describe('la expresion del enunciado coincide con el enunciado', () => {
  const CASOS: Array<[string, string[], string[]]> = [
    ['Cadenas sobre {a,b} que terminen en b', ['b', 'ab', 'bb'], ['', 'a', 'ba']],
    ['Cadenas sobre {a,b} con numero par de a', ['', 'b', 'aa'], ['a', 'ab']],
    ['Cadenas sobre {a,b} que no contengan aa', ['', 'a', 'ab', 'ba'], ['aa', 'baa']],
    ['Cadenas sobre {0,1} que no contengan 101', ['', '1', '10', '1001'], ['101', '0101']],
  ]

  for (const [texto, si, no] of CASOS) {
    it(`"${texto}"`, () => {
      const res = parseStatement(texto)
      expect(res.ok, texto).toBe(true)
      const { regex, back } = roundTrip(res.automaton!)
      for (const w of si) expect(accepts(back, w), `${regex} deberia aceptar "${w || 'ε'}"`).toBe(true)
      for (const w of no) expect(accepts(back, w), `${regex} deberia rechazar "${w || 'ε'}"`).toBe(false)
    })
  }
})
