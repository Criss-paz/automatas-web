import React, { useState } from 'react'
import { Automaton } from '../core/types'
import { simulate } from '../core/algorithms/equivalence'
import { StepTable } from './StepsView'

/** Prueba una cadena concreta sobre un automata y muestra el recorrido paso a paso. */
export default function StringTester({ automaton, title = 'Probar una cadena' }: { automaton: Automaton; title?: string }) {
  const [word, setWord] = useState('')
  const [res, setRes] = useState<ReturnType<typeof simulate> | null>(null)

  const run = (w: string) => {
    setWord(w)
    setRes(simulate(automaton, w))
  }

  return (
    <div className="panel tester">
      <h3>{title}</h3>
      <div className="tester-row">
        <input
          className="tester-input"
          value={word}
          placeholder="escribe una cadena (vacío = ε)"
          onChange={(e) => run(e.target.value)}
          spellCheck={false}
        />
        <div className="alpha-buttons">
          {automaton.alphabet.map((s) => (
            <button key={s} className="chip" onClick={() => run(word + s)}>
              {s}
            </button>
          ))}
          <button className="chip" onClick={() => run(word.slice(0, -1))} disabled={!word}>
            ⌫
          </button>
          <button className="chip" onClick={() => run('')}>
            limpiar
          </button>
        </div>
      </div>

      {res && (
        <>
          <div className={'verdict ' + (res.accepted ? 'ok' : 'bad')}>
            {res.accepted ? '✓ ' : '✗ '}
            {res.message}
          </div>
          <StepTable
            table={{
              caption: 'Recorrido de la cadena',
              headers: ['Paso', 'Símbolo leído', 'Estados actuales', 'Nota'],
              rows: res.rows,
            }}
          />
        </>
      )}
    </div>
  )
}
