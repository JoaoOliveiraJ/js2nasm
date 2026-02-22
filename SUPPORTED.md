# js2nasm - Features Suportadas de JavaScript / Node.js

Compilador: JavaScript → Assembly NASM x86-64 (ABI Windows x64)

---

## Declaracao de Variaveis

- Declaracoes `let`
- Declaracoes `const`
- Declaracoes `var`
- Variaveis nao inicializadas (padrao undefined)
- Destructuring de array: `const [a, b] = arr`
- Destructuring de objeto: `const { x, y } = obj`
- Destructuring com defaults: `const [a, b = 10] = arr`, `const { x = 5 } = obj`
- Destructuring aninhado: `const [a, [b, c]] = arr`, `const { a: { b } } = obj`
- Rest em destructuring: `const [a, ...rest] = arr`
- Atribuicao com destructuring: `[a, b] = [b, a]`, `({x, y} = obj)`

---

## Tipos de Dados

| Tipo | Representacao |
|------|---------------|
| Inteiro | 64-bit com sinal |
| Float | 64-bit IEEE 754 double |
| String | UTF-8 terminada em null |
| Booleano | `true` / `false` |
| null | literal |
| undefined | literal |
| Array | header + dados + tipos |
| Objeto | header + chaves + valores |
| Funcao | valor de primeira classe |

---

## Operadores

### Aritmeticos
`+` `-` `*` `/` `%` `**` (unario `-`, unario `+`)

### Comparacao
`<` `>` `<=` `>=` `==` `===` `!=` `!==`

### Logicos
`&&` `||` `!` `??`

### Bitwise
`&` `|` `^` `~` `<<` `>>` `>>>`

### Atribuicao
`=` `+=` `-=` `*=` `/=` `%=` `**=` `&&=` `||=` `??=` `&=` `|=` `^=` `<<=` `>>=` `>>>=`

### Incremento / Decremento
`++x` `--x` `x++` `x--`

### Outros
`typeof` `void` `? :` (ternario) `,` (virgula) `in` `instanceof` `delete`

---

## Fluxo de Controle

- `if` / `else if` / `else`
- `while`
- `do...while`
- `for` (estilo C)
- `for...of` (arrays e strings)
- `for...in` (objetos)
- `switch` / `case` / `default` (fall-through)
- `break` / `continue` (incluindo com labels)
- `try` / `catch` / `finally`
- `throw`

---

## Funcoes

- Declaracoes de funcao: `function nome() {}`
- Arrow functions: `const f = () => {}`
- Arrow com corpo conciso (auto-return): `const f = x => x + 1`
- Parametros default: `function f(x = 10) {}`
- Rest params: `function f(...args) {}`
- Spread em chamadas: `f(...arr)`
- Closures e escopo lexico
- Funcoes aninhadas
- Recursao
- Return com/sem valor
- IIFE: `(function(x) { ... })(val)`
- Destructuring em parametros: `function f({ x, y }) {}`

---

## Classes

- Declaracoes de classe: `class Foo {}`
- Construtor: `constructor() {}`
- Metodos: `method() {}`
- Metodos estaticos: `static method() {}`
- Getter / Setter: `get prop() {}`, `set prop(val) {}`
- Criacao de instancia: `new Foo()`
- Chamada de metodo: `obj.method()`
- Heranca: `class Dog extends Animal {}`
- `super()` no construtor
- `super.method()` em metodos
- Binding de `this`

---

## Metodos de String

| Metodo | Descricao |
|--------|-----------|
| `.length` | Tamanho da string |
| `.charAt(i)` | Caractere no indice |
| `.charCodeAt(i)` | Codigo do caractere no indice |
| `.indexOf(s)` | Posicao da substring |
| `.includes(s)` | Verifica se contem substring |
| `.toUpperCase()` | Converte para maiusculas |
| `.toLowerCase()` | Converte para minusculas |
| `.trim()` | Remove espacos |
| `.trimStart()` | Remove espacos do inicio |
| `.trimEnd()` | Remove espacos do final |
| `.slice(inicio, fim)` | Extrai substring |
| `.substring(inicio, fim)` | Extrai substring |
| `.split(sep)` | Divide em array |
| `.replace(busca, troca)` | Substitui primeira ocorrencia |
| `.replaceAll(busca, troca)` | Substitui todas as ocorrencias |
| `.repeat(n)` | Repete a string n vezes |
| `.startsWith(prefixo)` | Verifica prefixo |
| `.endsWith(sufixo)` | Verifica sufixo |
| `.padStart(tam, pad)` | Preenche no inicio |
| `.padEnd(tam, pad)` | Preenche no final |
| `.toString()` | Converte para string |
| `String.fromCharCode(cod)` | Cria caractere a partir do codigo |

---

## Metodos de Array

| Metodo | Descricao |
|--------|-----------|
| `.length` | Tamanho do array |
| `.push(elem)` | Adiciona no final |
| `.pop()` | Remove do final |
| `.shift()` | Remove do inicio |
| `.unshift(elem)` | Adiciona no inicio |
| `.indexOf(elem)` | Posicao do elemento |
| `.includes(elem)` | Verifica se elemento existe |
| `.join(sep)` | Junta elementos em string |
| `.slice(inicio, fim)` | Cria subarray |
| `.splice(inicio, qtd, ...itens)` | Remove/insere elementos |
| `.fill(valor, inicio, fim)` | Preenche com valor |
| `.reverse()` | Inverte array |
| `.concat(arr)` | Concatena arrays |
| `.forEach(fn)` | Itera sobre elementos |
| `.map(fn)` | Mapeia elementos |
| `.filter(fn)` | Filtra elementos |
| `.reduce(fn, init)` | Reduz a um valor |
| `.find(fn)` | Encontra primeiro elemento |
| `.findIndex(fn)` | Encontra indice do primeiro elemento |
| `.some(fn)` | Verifica se algum passa no teste |
| `.every(fn)` | Verifica se todos passam no teste |
| `.sort(fn?)` | Ordena (com comparador opcional) |
| `Array.isArray(val)` | Verifica se e array |
| `Array.from(iter)` | Cria array a partir de iteravel |

---

## Features de Objeto

- Literais de objeto: `{ chave: valor }`
- Propriedades shorthand: `{ x }` para `{ x: x }`
- Notacao de ponto: `obj.prop`
- Notacao de colchetes: `obj[chave]`
- Atribuicao de propriedade: `obj.prop = valor`
- `delete obj.prop`
- Spread de objeto: `{ ...obj1, ...obj2 }`
- `Object.keys(obj)`
- `Object.values(obj)`
- `Object.entries(obj)`
- `Object.assign(destino, ...fontes)`
- `obj.hasOwnProperty(chave)`

---

## Funcoes Embutidas

### Console
- `console.log(...args)` — imprime no stdout
- `console.error(...args)` — imprime no stderr

### Global
- `parseInt(string)` — converte string para inteiro
- `parseFloat(string)` — converte string para float
- `Number(valor)` — converte para numero
- `String(valor)` — converte para string
- `isNaN(valor)` — verifica se e NaN

### Processo
- `process.exit(codigo)` — sai com codigo

### Math
| Funcao/Constante | Descricao |
|-------------------|-----------|
| `Math.abs(x)` | Valor absoluto |
| `Math.floor(x)` | Arredonda para baixo |
| `Math.ceil(x)` | Arredonda para cima |
| `Math.round(x)` | Arredonda |
| `Math.trunc(x)` | Trunca |
| `Math.sign(x)` | Sinal (-1, 0, 1) |
| `Math.sqrt(x)` | Raiz quadrada |
| `Math.pow(b, e)` | Exponenciacao |
| `Math.max(a, b)` | Maximo |
| `Math.min(a, b)` | Minimo |
| `Math.random()` | Numero aleatorio |
| `Math.log(x)` | Logaritmo natural |
| `Math.log2(x)` | Logaritmo base 2 |
| `Math.sin(x)` | Seno |
| `Math.cos(x)` | Cosseno |
| `Math.tan(x)` | Tangente |
| `Math.atan2(y, x)` | Arco tangente de y/x |
| `Math.clz32(x)` | Conta zeros a esquerda |
| `Math.PI` | 3.141592653589793 |
| `Math.E` | 2.718281828459045 |
| `Math.LN2` | 0.6931471805599453 |
| `Math.LN10` | 2.302585092994046 |
| `Math.LOG2E` | 1.4426950408889634 |
| `Math.LOG10E` | 0.4342944819032518 |
| `Math.SQRT2` | 1.4142135623730951 |
| `Math.SQRT1_2` | 0.7071067811865476 |

### Number
| Metodo/Constante | Descricao |
|-------------------|-----------|
| `Number.isInteger(val)` | Verifica se e inteiro |
| `Number.isFinite(val)` | Verifica se e finito |
| `Number.parseInt(str)` | Converte para inteiro |
| `Number.parseFloat(str)` | Converte para float |
| `Number.MAX_SAFE_INTEGER` | Maior inteiro seguro |
| `Number.MIN_SAFE_INTEGER` | Menor inteiro seguro |
| `.toFixed(digitos)` | Formata com casas decimais |

---

## Features Modernas do JS

### Optional Chaining
- `obj?.prop`
- `obj?.[expr]`
- `obj?.method()`
- Encadeado: `obj?.a?.b?.c`

### Nullish Coalescing
- `a ?? b`

### Template Literals
- `` `texto ${expr} texto` ``
- Strings multi-linha

### Destructuring
- Array: `const [a, b] = arr`
- Objeto: `const { x, y } = obj`
- Com defaults: `const [a, b = 10] = arr`, `const { x = 5 } = obj`
- Rest: `const [a, ...rest] = arr`
- Aninhado: `const [a, [b, c]] = arr`
- Atribuicao: `[a, b] = [b, a]`

### Spread
- Spread de array: `[...arr1, ...arr2]`
- Spread de objeto: `{ ...obj1, ...obj2 }`
- Spread em chamada: `f(...args)`

### Tratamento de Excecoes
- `try { } catch(e) { }`
- `try { } finally { }`
- `try { } catch(e) { } finally { }`
- `throw valor`

---

## Sistema de Modulos

- `export function nome() {}`
- `export const x = 1`
- `export default ...`
- `import { nome } from './modulo'`
- Chamadas de funcao entre modulos
- Acesso a variaveis entre modulos

---

## Nao Suportado

- `async` / `await` / Promises
- Generators / `yield`
- Expressoes regulares (RegExp)
- `Map` / `Set` / `WeakMap` / `WeakSet`
- Symbols
- Proxies
- Campos privados de classe (`#campo`)
- Tagged template literals
- `import()` dinamico
- `import.meta`
- `with`
- BigInt

---

## Alvo de Compilacao

- **Arquitetura:** x86-64
- **SO:** Windows (ABI x64)
- **Assembler:** NASM
- **Linker:** GoLink
- **Convencao de chamada:** Windows x64 (rcx, rdx, r8, r9 + shadow space)
- **Runtime C:** msvcrt (printf, malloc, free, strlen, memcpy, strcmp, etc.)

## Estatisticas

- **80+** opcodes IR
- **50+** operadores
- **50+** funcoes/metodos embutidos
- **200+** features concretas de JS
