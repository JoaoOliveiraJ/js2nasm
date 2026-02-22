# js2nasm - Supported Node.js / JavaScript Features

Compiler: JavaScript → x86-64 NASM Assembly (Windows x64 ABI)

---

## Variable Declarations

- `let` declarations
- `const` declarations
- `var` declarations
- Uninitialized variables (default to undefined)
- Array destructuring: `const [a, b] = arr`
- Object destructuring: `const { x, y } = obj`

---

## Data Types

| Type | Representation |
|------|----------------|
| Integer | 64-bit signed |
| Float | 64-bit IEEE 754 double |
| String | null-terminated UTF-8 |
| Boolean | `true` / `false` |
| null | literal |
| undefined | literal |
| Array | header + data + types |
| Object | header + keys + values |
| Function | first-class value |

---

## Operators

### Arithmetic
`+` `-` `*` `/` `%` `**` (unary `-`, unary `+`)

### Comparison
`<` `>` `<=` `>=` `==` `===` `!=` `!==`

### Logical
`&&` `||` `!` `??`

### Bitwise
`&` `|` `^` `~` `<<` `>>` `>>>`

### Assignment
`=` `+=` `-=` `*=` `/=` `%=` `&&=` `||=` `??=`

### Increment / Decrement
`++x` `--x` `x++` `x--`

### Other
`typeof` `void` `? :` (ternary) `,` (comma)

---

## Control Flow

- `if` / `else if` / `else`
- `while`
- `do...while`
- `for` (C-style)
- `for...of` (arrays)
- `switch` / `case` / `default` (fall-through)
- `break`
- `continue`
- `try` / `catch` / `finally`
- `throw`

---

## Functions

- Named function declarations: `function name() {}`
- Arrow functions: `const f = () => {}`
- Arrow concise body (auto-return): `const f = x => x + 1`
- Default parameters: `function f(x = 10) {}`
- Rest parameters: `function f(...args) {}`
- Spread in calls: `f(...arr)`
- Closures and lexical scoping
- Nested functions
- Recursion
- Return with/without value

---

## String Methods

| Method | Description |
|--------|-------------|
| `.length` | String length |
| `.charAt(i)` | Character at index |
| `.charCodeAt(i)` | Character code at index |
| `.indexOf(s)` | Find substring position |
| `.includes(s)` | Check if contains substring |
| `.toUpperCase()` | Convert to uppercase |
| `.toLowerCase()` | Convert to lowercase |
| `.trim()` | Remove whitespace |
| `.slice(start, end)` | Extract substring |
| `.substring(start, end)` | Extract substring |
| `.split(sep)` | Split into array |
| `.replace(search, repl)` | Replace first occurrence |
| `.repeat(n)` | Repeat string n times |
| `.startsWith(prefix)` | Check prefix |
| `.endsWith(suffix)` | Check suffix |
| `.toString()` | Convert to string |

---

## Array Methods

| Method | Description |
|--------|-------------|
| `.length` | Array length |
| `.push(elem)` | Add to end |
| `.pop()` | Remove from end |
| `.shift()` | Remove from start |
| `.unshift(elem)` | Add to start |
| `.indexOf(elem)` | Find element position |
| `.includes(elem)` | Check if element exists |
| `.join(sep)` | Join elements into string |
| `.slice(start, end)` | Create subarray |
| `.reverse()` | Reverse array |
| `.concat(arr)` | Concatenate arrays |
| `Array.isArray(val)` | Check if value is array |

---

## Object Features

- Object literals: `{ key: value }`
- Shorthand properties: `{ x }` for `{ x: x }`
- Dot notation: `obj.prop`
- Bracket notation: `obj[key]`
- Property assignment: `obj.prop = value`
- `delete obj.prop`
- Object spread: `{ ...obj1, ...obj2 }`
- `Object.keys(obj)`
- `Object.values(obj)`
- `Object.entries(obj)`
- `obj.hasOwnProperty(key)`

---

## Built-in Functions

### Console
- `console.log(...args)` — print to stdout
- `console.error(...args)` — print to stderr

### Global
- `parseInt(string)` — parse integer from string
- `parseFloat(string)` — parse float from string
- `Number(value)` — convert to number
- `String(value)` — convert to string
- `isNaN(value)` — check if NaN

### Process
- `process.exit(code)` — exit with code

### Math
| Function/Constant | Description |
|-------------------|-------------|
| `Math.abs(x)` | Absolute value |
| `Math.floor(x)` | Round down |
| `Math.ceil(x)` | Round up |
| `Math.sqrt(x)` | Square root |
| `Math.pow(b, e)` | Exponentiation |
| `Math.max(a, b)` | Maximum |
| `Math.min(a, b)` | Minimum |
| `Math.PI` | 3.141592653589793 |
| `Math.E` | 2.718281828459045 |
| `Math.LN2` | 0.6931471805599453 |
| `Math.LN10` | 2.302585092994046 |
| `Math.LOG2E` | 1.4426950408889634 |
| `Math.LOG10E` | 0.4342944819032518 |
| `Math.SQRT2` | 1.4142135623730951 |
| `Math.SQRT1_2` | 0.7071067811865476 |

---

## Modern JS Features

### Optional Chaining
- `obj?.prop`
- `obj?.[expr]`
- `obj?.method()`
- Chained: `obj?.a?.b?.c`

### Nullish Coalescing
- `a ?? b`

### Template Literals
- `` `text ${expr} text` ``
- Multi-line strings

### Destructuring
- Array: `const [a, b] = arr`
- Object: `const { x, y } = obj`
- Rest in destructuring: `const [a, ...rest] = arr`

### Spread
- Array spread: `[...arr1, ...arr2]`
- Object spread: `{ ...obj1, ...obj2 }`
- Call spread: `f(...args)`

### Classes
- Class declarations: `class Foo {}`
- Constructors: `constructor() {}`
- Methods: `method() {}`
- Instance creation: `new Foo()`
- Method calls: `obj.method()`
- `this` binding

### Exception Handling
- `try { } catch(e) { }`
- `try { } finally { }`
- `try { } catch(e) { } finally { }`
- `throw value`

---

## Module System

- `export function name() {}`
- `export const x = 1`
- `export default ...`
- `import { name } from './module'`
- Cross-module function calls
- Cross-module variable access

---

## Not Supported

- `async` / `await` / Promises
- Generators / `yield`
- `for...in` loops
- Regular expressions (RegExp)
- `Map` / `Set` / `WeakMap` / `WeakSet`
- Symbols
- Proxies
- Getters / setters
- Private class fields (`#field`)
- Static class methods
- `extends` / `super` (inheritance)
- Tagged template literals
- Dynamic `import()`
- `import.meta`
- `with` statements
- Labeled statements
- BigInt

---

## Compilation Target

- **Architecture:** x86-64
- **OS:** Windows (x64 ABI)
- **Assembler:** NASM
- **Linker:** GoLink
- **Calling convention:** Windows x64 (rcx, rdx, r8, r9 + shadow space)
- **C Runtime:** msvcrt (printf, malloc, free, strlen, memcpy, strcmp, etc.)

## Statistics

- **80+** IR opcodes
- **50+** operators
- **30+** built-in functions/methods
- **200+** concrete JS features
- **51** test files
