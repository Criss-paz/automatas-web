import React from 'react'

/** Referencia teorica breve de los algoritmos que implementa el sistema. */
export default function Theory() {
  return (
    <div className="mode theory">
      <div className="panel">
        <h2>Qué hace este sistema y con qué algoritmos</h2>

        <h3>1. Clausura-ε</h3>
        <p>
          La clausura-ε de un conjunto de estados <b>S</b> es el conjunto de todos los estados alcanzables desde S usando
          únicamente transiciones vacías, incluyendo los propios estados de S. Es lo que permite tratar un AFN-ε como si
          no tuviera transiciones vacías: se calcula por cierre transitivo sobre las aristas ε.
        </p>

        <h3>2. Construcción de subconjuntos (AFN → AFD)</h3>
        <p>
          Cada estado del AFD es un <b>subconjunto</b> de estados del AFN. Se parte de{' '}
          <code>clausura-ε({'{q₀}'})</code> y para cada subconjunto T y cada símbolo a se calcula{' '}
          <code>clausura-ε(δ(T, a))</code>. El proceso termina cuando no aparecen subconjuntos nuevos. Un estado del AFD
          es final si su subconjunto contiene algún final del AFN. El subconjunto vacío ∅ es el estado trampa.
        </p>

        <h3>3. Algoritmo de Brzozowski</h3>
        <p>
          Es el que usa este sistema tanto para determinizar como para minimizar. Consiste en aplicar dos veces la
          secuencia <i>invertir + determinizar</i>:
        </p>
        <pre className="formula">AFD mínimo = D( R( D( R(A) ) ) )</pre>
        <ul>
          <li>
            <b>R (invertir)</b>: se voltea el sentido de todas las flechas, el estado inicial pasa a ser final y los
            finales pasan a ser iniciales. Si había varios finales se agrega un inicial nuevo unido a ellos con ε, porque
            un autómata solo puede tener un estado inicial.
          </li>
          <li>
            <b>D (determinizar)</b>: construcción de subconjuntos quedándose únicamente con los estados alcanzables.
          </li>
        </ul>
        <p>
          El resultado es siempre el AFD mínimo del lenguaje original. La razón es que la determinización de un
          autómata invertido produce un AFD cuyos estados son todos alcanzables (por construcción) y todos distinguibles
          entre sí, que son exactamente las dos condiciones de minimalidad. Funciona igual si el autómata de partida es
          un AFN, tiene transiciones ε o tiene estados sin salida: no hay que preprocesarlo.
        </p>

        <h3>4. Tabla de estados distinguibles (método de Moore)</h3>
        <p>
          Método alternativo de minimización que este sistema ejecuta en paralelo como contraste. Se marcan primero los
          pares (final, no final), y luego, repetidamente, se marca el par (p, q) si existe un símbolo a tal que el par
          (δ(p,a), δ(q,a)) ya está marcado. Los pares que quedan sin marcar son estados equivalentes y se fusionan.
        </p>

        <h3>5. Verificación de equivalencia</h3>
        <p>
          Para comprobar que el mínimo acepta el mismo lenguaje que el original se recorre el <b>autómata producto</b>:
          se avanza en los dos autómatas a la vez desde sus estados iniciales. Si se llega a un par donde uno acepta y el
          otro no, la cadena leída hasta ahí es un <b>contraejemplo</b> y demuestra que no son equivalentes. Si el
          recorrido termina sin encontrarlo, son equivalentes. El sistema añade además una prueba exhaustiva de todas las
          cadenas hasta longitud 7 y la comparación entre los dos métodos de minimización.
        </p>

        <h3>6. Construcción de Thompson (expresión regular → AFN-ε)</h3>
        <p>
          Cada operador se traduce en un fragmento con una entrada y una salida: un símbolo es una flecha simple; la
          concatenación une la salida de uno con la entrada del otro por ε; la unión crea un inicio y un fin nuevos con
          ramas ε; y la estrella añade el atajo que permite cero repeticiones y el retorno que permite repetir.
        </p>

        <h3>Unicidad del mínimo</h3>
        <p>
          Por el teorema de Myhill-Nerode, para cada lenguaje regular existe un único AFD mínimo salvo el nombre de los
          estados. Por eso, si Brzozowski y la tabla de estados distinguibles llegan al mismo número de estados, es una
          señal fuerte de que el resultado es correcto.
        </p>
      </div>
    </div>
  )
}
