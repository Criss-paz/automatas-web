import React, { useState } from 'react'
import ModeSolve from './ui/ModeSolve'
import Editor from './ui/Editor'
import Theory from './ui/Theory'

type Mode = 'solve' | 'draw' | 'teoria'

export default function App() {
  const [mode, setMode] = useState<Mode>('solve')

  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="brand">
          <span className="logo">◎→◯</span>
          <div>
            <h1>Simulador de Autómatas Finitos</h1>
            <p>AFD · AFN · AFN-ε · Brzozowski · minimización · equivalencia</p>
          </div>
        </div>
        <nav className="main-nav">
          <button className={mode === 'solve' ? 'active' : ''} onClick={() => setMode('solve')}>
            1 · Escribir el problema
          </button>
          <button className={mode === 'draw' ? 'active' : ''} onClick={() => setMode('draw')}>
            2 · Dibujar el autómata
          </button>
          <button className={mode === 'teoria' ? 'active' : ''} onClick={() => setMode('teoria')}>
            Teoría
          </button>
        </nav>
      </header>

      <main>
        {mode === 'solve' && <ModeSolve />}
        {mode === 'draw' && <Editor />}
        {mode === 'teoria' && <Theory />}
      </main>

      <footer className="app-footer no-print">
        Todo el cálculo ocurre en tu navegador: no se envía nada a ningún servidor.
      </footer>
    </div>
  )
}
