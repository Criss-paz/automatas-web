/** Simbolo usado para las transiciones epsilon (lambda / vacias). */
export const EPSILON = 'ε'

export interface State {
  id: string
  /** Nombre visible: "q0", "{q0,q1}", "A", ... */
  label: string
  x: number
  y: number
  isInitial: boolean
  isFinal: boolean
}

export interface Transition {
  id: string
  from: string
  to: string
  /** Un simbolo del alfabeto, o EPSILON. */
  symbol: string
}

export interface Automaton {
  name: string
  /** Alfabeto SIN epsilon. */
  alphabet: string[]
  states: State[]
  transitions: Transition[]
}

/** Un paso del procedimiento que el sistema muestra en pantalla. */
export interface Step {
  title: string
  /** Explicacion en prosa (se admite markdown ligero: **negrita**). */
  body?: string
  /** Tabla opcional: primera fila = encabezados. */
  table?: { headers: string[]; rows: string[][]; caption?: string }
  /** Automata a dibujar en este paso. */
  automaton?: Automaton
  /** Lista de items (viñetas). */
  bullets?: string[]
}

export interface Procedure {
  title: string
  steps: Step[]
  result?: Automaton
}
