# js2nasm

A JavaScript to x86-64 NASM assembly compiler targeting Windows.

Compiles a substantial subset of JavaScript/ES2022 directly to native Windows executables — no VM, no interpreter, no runtime.

```
JavaScript → AST (acorn) → IR (three-address code) → NASM x86-64 → .obj → .exe
```

## Quick Start

```bash
npm install

# Compile and run
node bin/js2nasm.js hello.js --run

# Generate .asm only
node bin/js2nasm.js hello.js --no-compile

# Debug output
node bin/js2nasm.js hello.js --emit-ir    # show IR
node bin/js2nasm.js hello.js --emit-ast   # show AST
```

## Example

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

This compiles to ~100 lines of NASM assembly, links into a native `.exe`, and runs directly on Windows.

## What It Supports

### Language Features
- Variables (`let`, `const`, `var`), closures, recursion
- All operators: arithmetic, comparison, logical, bitwise, assignment
- Control flow: `if/else`, `for`, `while`, `do-while`, `switch`, `for...of`, `break`, `continue`
- Functions: declarations, arrow functions, default params, rest params
- Template literals: `` `hello ${name}` ``
- Destructuring: `const [a, b] = arr`, `const { x, y } = obj`
- Spread: `[...arr]`, `{...obj}`, `f(...args)`
- Classes: `class`, `constructor`, methods, `new`
- Exception handling: `try/catch/finally`, `throw`
- Optional chaining: `obj?.prop`, `obj?.method()`
- Nullish coalescing: `a ?? b`
- Logical assignment: `&&=`, `||=`, `??=`
- ES modules: `import`/`export`

### Built-in Methods

**String:** `charAt`, `indexOf`, `includes`, `toUpperCase`, `toLowerCase`, `trim`, `slice`, `substring`, `split`, `replace`, `repeat`, `startsWith`, `endsWith`, `length`

**Array:** `push`, `pop`, `shift`, `unshift`, `indexOf`, `includes`, `join`, `slice`, `reverse`, `concat`, `length`, `Array.isArray`

**Object:** `Object.keys`, `Object.values`, `Object.entries`, `hasOwnProperty`

**Math:** `abs`, `floor`, `ceil`, `sqrt`, `pow`, `max`, `min`, `PI`, `E`, `SQRT2`...

**Global:** `console.log`, `console.error`, `parseInt`, `parseFloat`, `Number()`, `String()`, `isNaN`, `typeof`, `process.exit`

> Full list: [SUPPORTED.md](SUPPORTED.md)

## Multi-file Modules

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

Dependencies are resolved and merged automatically.

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm test` | Run fixture tests (20 tests) |
| `npm start -- file.js` | Compile + run |
| `npm run build -- file.js` | Compile only |
| `npm run emit:ir -- file.js` | Show IR output |
| `npm run emit:ast -- file.js` | Show AST output |
| `npm run test:all` | Run all tests |

## Architecture

```
src/
  index.js              # entry point, pipeline orchestration
  ir.js                 # IR opcodes and instruction types
  ir-generator.js       # AST → IR compiler (main dispatcher)
  ir-gen/
    visit-expressions.js  # expressions, operators
    visit-statements.js   # assignments, declarations
    visit-functions.js    # functions, calls, methods
    visit-control-flow.js # if, for, while, try/catch
    visit-collections.js  # arrays, objects
    visit-modules.js      # import/export
  analyzer.js           # type inference
  codegen.js            # IR → NASM x86-64 compiler
  codegen/
    emit-arrays.js        # array operations
    emit-strings.js       # string operations
    emit-objects.js       # object operations
    emit-math.js          # math functions
    emit-io.js            # console.log/error
    emit-helpers.js       # runtime helpers (__int_to_str, __print_array)
    emit-exceptions.js    # try/catch/throw
  module-resolver.js    # multi-file dependency resolution
```

## Requirements

- [Node.js](https://nodejs.org/) (for running the compiler)
- [NASM](https://www.nasm.us/) (assembler — in PATH or `C:\Program Files\NASM\`)
- [GoLink](http://godevtool.com/) (linker — in PATH or `tools/golink/`) or MSVC linker

```bash
npm install
```

## Limitations

Not supported: async/await, generators, RegExp, Map/Set, Symbols, Proxies, getters/setters, private fields, class inheritance, `for...in`.

See [SUPPORTED.md](SUPPORTED.md) for the complete feature list.

## License

MIT
