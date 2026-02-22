# js2nasm

Compilador de JavaScript para assembly x86-64 NASM, gerando executaveis nativos para Windows.

Compila um subconjunto grande de JavaScript/ES2022 diretamente para executaveis nativos — sem VM, sem interpretador, sem runtime.

```
JavaScript → AST (acorn) → IR (three-address code) → NASM x86-64 → .obj → .exe
```

## Inicio Rapido

```bash
npm install

# Compilar e executar
node bin/js2nasm.js hello.js --run

# Gerar apenas o .asm
node bin/js2nasm.js hello.js --no-compile

# Saida de debug
node bin/js2nasm.js hello.js --emit-ir    # mostrar IR
node bin/js2nasm.js hello.js --emit-ast   # mostrar AST
```

## Exemplo

```js
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
```

```bash
$ node bin/js2nasm.js fibonacci.js --run
55
```

Isso compila para ~100 linhas de assembly NASM, linka num `.exe` nativo e roda direto no Windows.

## O Que Suporta

### Features da Linguagem
- Variaveis (`let`, `const`, `var`), closures, recursao
- Todos os operadores: aritmeticos, comparacao, logicos, bitwise, atribuicao
- Fluxo de controle: `if/else`, `for`, `while`, `do-while`, `switch`, `for...of`, `for...in`, `break`, `continue`
- Funcoes: declaracoes, arrow functions, parametros default, rest params
- Template literals: `` `hello ${name}` ``
- Destructuring: `const [a, b] = arr`, `const { x, y } = obj`, com defaults e aninhado
- Spread: `[...arr]`, `{...obj}`, `f(...args)`
- Classes: `class`, `constructor`, metodos, `new`, `extends`, `super()`, metodos estaticos, getter/setter
- Tratamento de excecoes: `try/catch/finally`, `throw`
- Optional chaining: `obj?.prop`, `obj?.method()`
- Nullish coalescing: `a ?? b`
- Atribuicao logica: `&&=`, `||=`, `??=`
- Modulos ES: `import`/`export`
- Metodos de alta ordem: `map`, `filter`, `reduce`, `forEach`, `find`, `some`, `every`, `findIndex`, `sort`

### Metodos Embutidos

**String:** `charAt`, `charCodeAt`, `indexOf`, `includes`, `toUpperCase`, `toLowerCase`, `trim`, `trimStart`, `trimEnd`, `slice`, `substring`, `split`, `replace`, `replaceAll`, `repeat`, `startsWith`, `endsWith`, `padStart`, `padEnd`, `length`

**Array:** `push`, `pop`, `shift`, `unshift`, `indexOf`, `includes`, `join`, `slice`, `reverse`, `concat`, `splice`, `fill`, `length`, `Array.isArray`, `Array.from`

**Object:** `Object.keys`, `Object.values`, `Object.entries`, `Object.assign`, `hasOwnProperty`

**Math:** `abs`, `floor`, `ceil`, `round`, `trunc`, `sign`, `sqrt`, `pow`, `max`, `min`, `random`, `log`, `log2`, `sin`, `cos`, `tan`, `atan2`, `clz32`, `PI`, `E`, `SQRT2`...

**Number:** `Number.isInteger`, `Number.isFinite`, `Number.parseInt`, `Number.parseFloat`, `toFixed`

**Global:** `console.log`, `console.error`, `parseInt`, `parseFloat`, `Number()`, `String()`, `isNaN`, `typeof`, `process.exit`

> Lista completa: [SUPPORTED.md](SUPPORTED.md)

## Modulos Multi-arquivo

```js
// math.js
export function add(a, b) { return a + b; }

// main.js
import { add } from './math.js';
console.log(add(3, 5)); // 8
```

```bash
node bin/js2nasm.js main.js --run
```

Dependencias sao resolvidas e unificadas automaticamente.

## Scripts npm

| Script | Descricao |
|--------|-----------|
| `npm test` | Rodar testes de fixture |
| `npm start -- file.js` | Compilar + executar |
| `npm run build -- file.js` | Apenas compilar |
| `npm run emit:ir -- file.js` | Mostrar saida IR |
| `npm run emit:ast -- file.js` | Mostrar saida AST |
| `npm run test:all` | Rodar todos os testes |

## Arquitetura

```
src/
  index.js              # ponto de entrada, orquestracao do pipeline
  ir.js                 # opcodes IR e tipos de instrucao
  ir-generator.js       # compilador AST → IR (dispatcher principal)
  ir-gen/
    visit-expressions.js  # expressoes, operadores
    visit-statements.js   # atribuicoes, declaracoes
    visit-functions.js    # funcoes, chamadas, metodos, classes
    visit-control-flow.js # if, for, while, try/catch
    visit-collections.js  # arrays, objetos, templates
    visit-modules.js      # import/export
  analyzer.js           # inferencia de tipos
  codegen.js            # compilador IR → NASM x86-64
  codegen/
    emit-arrays.js        # operacoes de array
    emit-strings.js       # operacoes de string
    emit-objects.js       # operacoes de objeto
    emit-math.js          # funcoes matematicas
    emit-io.js            # console.log/error
    emit-helpers.js       # helpers de runtime (__int_to_str, __print_array)
    emit-exceptions.js    # try/catch/throw
  module-resolver.js    # resolucao de dependencias multi-arquivo
```

## Requisitos

- [Node.js](https://nodejs.org/) (para rodar o compilador)
- [NASM](https://www.nasm.us/) (assembler — no PATH ou `C:\Program Files\NASM\`)
- [GoLink](http://godevtool.com/) (linker — no PATH ou `tools/golink/`) ou linker MSVC

```bash
npm install
```

## Limitacoes

Nao suportado: async/await, generators, RegExp, Map/Set, Symbols, Proxies, campos privados (`#field`), tagged template literals, `import()` dinamico, `import.meta`, BigInt.

Veja [SUPPORTED.md](SUPPORTED.md) para a lista completa de features.

## Licenca

MIT
