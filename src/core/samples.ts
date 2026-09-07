import { Automaton } from './types'
import { accepts } from './algorithms/equivalence'

/**
 * Genera cadenas de ejemplo recorriendo Σ* en orden de longitud creciente
 * (orden shortlex) y probandolas en el automata.
 */
export function sampleWords(
  a: Automaton,
  opts: { accepted?: number; rejected?: number; maxLen?: number } = {},
): { accepted: string[]; rejected: string[]; exhaustive: boolean } {
  const wantA = opts.accepted ?? 8
  const wantR = opts.rejected ?? 8
  const maxLen = opts.maxLen ?? 8
  const alphabet = [...a.alphabet].sort()

  const acc: string[] = []
  const rej: string[] = []
  let words: string[] = ['']
  let generated = 0

  for (let len = 0; len <= maxLen; len++) {
    if (len > 0) {
      const next: string[] = []
      for (const w of words) for (const s of alphabet) next.push(w + s)
      words = next
    }
    if (words.length === 0 || generated > 20000) break
    for (const w of words) {
      generated++
      if (accepts(a, w)) {
        if (acc.length < wantA) acc.push(w)
      } else if (rej.length < wantR) rej.push(w)
      if (acc.length >= wantA && rej.length >= wantR) {
        return { accepted: acc, rejected: rej, exhaustive: false }
      }
    }
  }
  return { accepted: acc, rejected: rej, exhaustive: acc.length < wantA }
}

export const showWord = (w: string) => (w === '' ? 'ε' : w)
