import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import App from '../App'
import StepsView from './StepsView'
import AutomatonView from './AutomatonView'
import Editor from './Editor'
import Theory from './Theory'
import { solve } from '../core/solver'
import { nfaToDfaFull } from '../core/algorithms/brzozowski'
import { parseFormal } from '../core/formal'

/**
 * Pruebas de humo del renderizado: comprueban que los componentes se pintan sin
 * lanzar excepciones con datos reales de los algoritmos.
 */
describe('renderizado de la interfaz', () => {
  it('la aplicacion, el editor y la teoria se renderizan', () => {
    expect(renderToString(<App />)).toContain('Autómatas')
    expect(renderToString(<Editor />)).toContain('Dibuja el autómata')
    expect(renderToString(<Theory />)).toContain('Brzozowski')
  })

  it('pinta el procedimiento completo de los tres modos de entrada', () => {
    const casos: Array<[string, 'enunciado' | 'regex' | 'formal']> = [
      ['Cadenas sobre {a,b} que empiecen con a y terminen en bb', 'enunciado'],
      ['(a|b)*abb', 'regex'],
      ['Q = {q0,q1,q2}\nSigma = {a,b}\ninicial = q0\nF = {q2}\nq0, a -> q0\nq0, a -> q1\nq0, b -> q0\nq1, e -> q2\nq1, b -> q2', 'formal'],
    ]
    for (const [texto, modo] of casos) {
      const r = solve(texto, modo)
      expect(r.ok, `${modo}: ${r.error}`).toBe(true)
      for (const sec of r.sections) {
        const html = renderToString(<StepsView steps={sec.steps} />)
        expect(html.length, `${modo} / ${sec.title} vacio`).toBeGreaterThan(50)
      }
      const svg = renderToString(<AutomatonView automaton={r.minimal!} />)
      expect(svg).toContain('<svg')
      // Un estado final debe dibujarse con doble circulo.
      expect((svg.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(r.minimal!.states.length)
    }
  })

  it('pinta la conversion AFN-ε → AFD del modo dibujo', () => {
    const nfa = parseFormal(
      'Q = {q0,q1,q2}\nSigma = {a,b}\ninicial = q0\nF = {q2}\nq0, e -> q1\nq0, a -> q0\nq1, b -> q2\nq1, a -> q1\nq2, e -> q0',
    ).automaton!
    const res = nfaToDfaFull(nfa)
    const html = renderToString(<StepsView steps={res.steps} />)
    expect(html).toContain('Clausura')
    expect(html).toContain('Brzozowski')
  })

  it('dibuja la flecha de inicio y el doble circulo de los finales', () => {
    const a = parseFormal('Q = {q0,q1}\nSigma = {a}\ninicial = q0\nF = {q1}\nq0, a -> q1').automaton!
    const svg = renderToString(<AutomatonView automaton={a} />)
    expect(svg).toContain('initial-marker')
    expect(svg).toContain('state-inner') // doble circulo del estado final
    expect(svg).toContain('url(#arrow)')
  })
})
