# js2nasm

Transpilador JavaScript → NASM x86-64 (Windows).
JavaScript → NASM x86-64 transpiler (Windows).

## Funcionalidades / Features

- Variáveis, funções, recursão / Variables, functions, recursion
- Controle de fluxo: `if/else`, `for`, `while`, `do-while`, `switch`, `for-of` / Control flow
- Arrays, strings, template literals
- Operadores aritméticos, lógicos, bitwise, ternário / Arithmetic, logical, bitwise, ternary operators
- `Math.abs/max/min/floor/pow`, `typeof`
- Parâmetros com valor padrão / Default parameters
- **Multi-arquivo com ES modules (`import`/`export`)** / **Multi-file with ES modules**

## Uso / Usage

```bash
# Transpila + compila + executa / Transpile + compile + run
node bin/js2nasm.js arquivo.js --run

# Apenas gera .asm / Only generate .asm
node bin/js2nasm.js arquivo.js --no-compile

# Debug: mostra IR ou AST / Debug: show IR or AST
node bin/js2nasm.js arquivo.js --emit-ir
node bin/js2nasm.js arquivo.js --emit-ast

# Escolher linker / Choose linker (golink | msvc)
node bin/js2nasm.js arquivo.js --linker msvc
```

## npm scripts

| Script | Descrição / Description |
|---|---|
| `npm test` | Testes unitários (fixtures) / Unit tests |
| `npm start -- <file>` | Transpila + compila + executa / Transpile + compile + run |
| `npm run build -- <file>` | Transpila + compila / Transpile + compile |
| `npm run compile -- <file>` | Apenas gera .asm / Only .asm |
| `npm run emit:ir -- <file>` | Mostra IR / Show IR |
| `npm run emit:ast -- <file>` | Mostra AST / Show AST |
| `npm run test:all` | Todos os testes (single + multi-file) / All tests |

## Multi-arquivo / Multi-file

Suporta `import`/`export` com resolução recursiva de dependências. Arquivos sem sintaxe de módulo usam o caminho single-file automaticamente.

Supports `import`/`export` with recursive dependency resolution. Files without module syntax use the single-file path automatically.

```js
// lib.js
export function add(a, b) { return a + b; }

// main.js
import { add } from './lib.js';
console.log(add(3, 5));
```

```bash
node bin/js2nasm.js main.js --run
```

## Pipeline

```
JS → AST (acorn) → IR (three-address code) → NASM x86-64 → .obj (NASM) → .exe (GoLink/MSVC)
```

## Requisitos / Requirements

- [Node.js](https://nodejs.org/)
- [NASM](https://www.nasm.us/) (PATH ou `C:\Program Files\NASM\`)
- [GoLink](http://godevtool.com/) (PATH ou `tools/golink/`) ou MSVC linker

```bash
npm install
```
