'use strict';

// Three-Address Code (TAC) IR node types

class IRProgram {
  constructor() {
    this.functions = [];    // IRFunction[]
    this.main = [];         // IRInstruction[] (top-level code)
    this.strings = [];      // { label: string, value: string }[]
    this.floats = [];       // { label: string, value: number }[]
    this.globals = new Set(); // global variable names
  }

  addString(value) {
    const existing = this.strings.find(s => s.value === value);
    if (existing) return existing.label;
    const label = `str_${this.strings.length}`;
    this.strings.push({ label, value });
    return label;
  }

  addFloat(value) {
    const existing = this.floats.find(f => f.value === value);
    if (existing) return existing.label;
    const label = `float_${this.floats.length}`;
    this.floats.push({ label, value });
    return label;
  }
}

class IRFunction {
  constructor(name, params) {
    this.name = name;        // string
    this.params = params;    // string[]
    this.body = [];          // IRInstruction[]
    this.locals = [];        // string[] (all local variable names)
  }
}

// IR instruction opcodes
const OP = {
  // Constants
  LOAD_INT: 'LOAD_INT',         // dest, value
  LOAD_FLOAT: 'LOAD_FLOAT',     // dest, label
  LOAD_STRING: 'LOAD_STRING',   // dest, label
  LOAD_BOOL: 'LOAD_BOOL',       // dest, value (0 or 1)
  LOAD_NULL: 'LOAD_NULL',       // dest
  LOAD_UNDEFINED: 'LOAD_UNDEFINED', // dest

  // Variables
  LOAD_VAR: 'LOAD_VAR',         // dest, varName
  STORE_VAR: 'STORE_VAR',       // varName, src

  // Arithmetic
  ADD: 'ADD',                    // dest, left, right
  SUB: 'SUB',                    // dest, left, right
  MUL: 'MUL',                    // dest, left, right
  DIV: 'DIV',                    // dest, left, right
  MOD: 'MOD',                    // dest, left, right
  POW: 'POW',                    // dest, left, right
  NEG: 'NEG',                    // dest, src

  // Comparison
  CMP_EQ: 'CMP_EQ',             // dest, left, right (==)
  CMP_SEQ: 'CMP_SEQ',           // dest, left, right (===)
  CMP_NE: 'CMP_NE',             // dest, left, right (!=)
  CMP_SNE: 'CMP_SNE',           // dest, left, right (!==)
  CMP_LT: 'CMP_LT',             // dest, left, right (<)
  CMP_GT: 'CMP_GT',             // dest, left, right (>)
  CMP_LE: 'CMP_LE',             // dest, left, right (<=)
  CMP_GE: 'CMP_GE',             // dest, left, right (>=)

  // Logical
  NOT: 'NOT',                    // dest, src
  AND: 'AND',                    // dest, left, right (short-circuit)
  OR: 'OR',                      // dest, left, right (short-circuit)

  // Control flow
  LABEL: 'LABEL',               // label
  JUMP: 'JUMP',                 // label
  JUMP_IF_FALSE: 'JUMP_IF_FALSE', // src, label
  JUMP_IF_TRUE: 'JUMP_IF_TRUE',   // src, label

  // Functions
  CALL: 'CALL',                  // dest, funcName, args[]
  RETURN: 'RETURN',              // src (optional)
  PARAM: 'PARAM',               // paramName, index

  // Builtins
  CONSOLE_LOG: 'CONSOLE_LOG',   // args[] (with type hints)

  // Strings
  STR_CONCAT: 'STR_CONCAT',     // dest, left, right
  STR_LENGTH: 'STR_LENGTH',     // dest, src

  // Arrays
  ARRAY_NEW: 'ARRAY_NEW',       // dest, elements[]
  ARRAY_GET: 'ARRAY_GET',       // dest, array, index
  ARRAY_SET: 'ARRAY_SET',       // array, index, value
  ARRAY_PUSH: 'ARRAY_PUSH',     // array, value
  ARRAY_LENGTH: 'ARRAY_LENGTH', // dest, array

  // Template literals
  TEMPLATE: 'TEMPLATE',         // dest, parts[] (strings and expressions interleaved)

  // Assignment operators
  ASSIGN_ADD: 'ASSIGN_ADD',     // varName, src
  ASSIGN_SUB: 'ASSIGN_SUB',     // varName, src

  // Builtins - console.error, process.exit
  CONSOLE_ERROR: 'CONSOLE_ERROR', // args[] (with type hints) — prints to stderr
  PROCESS_EXIT: 'PROCESS_EXIT',   // exitCode temp

  // Math builtins
  MATH_ABS: 'MATH_ABS',         // dest, src
  MATH_MAX: 'MATH_MAX',         // dest, left, right
  MATH_MIN: 'MATH_MIN',         // dest, left, right
  MATH_FLOOR: 'MATH_FLOOR',     // dest, src (float → int)
  MATH_SQRT: 'MATH_SQRT',       // dest, src (float → float)
  MATH_POW: 'MATH_POW',         // dest, base, exp (int only for now)

  // typeof
  TYPEOF: 'TYPEOF',             // dest, src, typeHint

  // Bitwise
  BIT_AND: 'BIT_AND',           // dest, left, right
  BIT_OR: 'BIT_OR',             // dest, left, right
  BIT_XOR: 'BIT_XOR',           // dest, left, right
  BIT_NOT: 'BIT_NOT',           // dest, src
  SHL: 'SHL',                    // dest, left, right
  SHR: 'SHR',                    // dest, left, right
  USHR: 'USHR',                  // dest, left, right (unsigned)

  // Increment/decrement
  PRE_INC: 'PRE_INC',           // dest, varName
  PRE_DEC: 'PRE_DEC',           // dest, varName
  POST_INC: 'POST_INC',         // dest, varName
  POST_DEC: 'POST_DEC',         // dest, varName

  // Default params
  JUMP_IF_NOT_UNDEF: 'JUMP_IF_NOT_UNDEF', // src, label  (skip if param was provided)

  // String methods
  STR_CHAR_AT: 'STR_CHAR_AT',       // dest, str, index
  STR_INDEX_OF: 'STR_INDEX_OF',     // dest, str, search
  STR_TO_UPPER: 'STR_TO_UPPER',     // dest, str
  STR_TO_LOWER: 'STR_TO_LOWER',     // dest, str
  STR_INCLUDES: 'STR_INCLUDES',     // dest, str, search
  STR_TRIM: 'STR_TRIM',             // dest, str

  // Objects
  OBJ_NEW: 'OBJ_NEW',               // dest, keys[], values[]
  OBJ_GET: 'OBJ_GET',               // dest, obj, keyLabel
  OBJ_SET: 'OBJ_SET',               // obj, keyLabel, value

  // Rest params
  REST_ARGS: 'REST_ARGS',           // dest, startIndex, totalArgCount

  // Spread
  ARRAY_SPREAD: 'ARRAY_SPREAD',     // destArray, srcArray — copy all elements from src to dest
  OBJ_SPREAD: 'OBJ_SPREAD',         // destObj, srcObj — copy all properties from src to dest
  CALL_SPREAD: 'CALL_SPREAD',       // dest, funcName, normalArgs[], spreadArray

  // Exceptions
  TRY_PUSH: 'TRY_PUSH',             // handlerLabel — push exception handler
  TRY_POP: 'TRY_POP',               // — pop exception handler (normal path)
  THROW: 'THROW',                    // valueTemp — throw exception

  // Classes
  OBJ_NEW_EMPTY: 'OBJ_NEW_EMPTY',   // dest — create empty object

  // Array methods
  ARRAY_POP: 'ARRAY_POP',             // dest, array
  ARRAY_SHIFT: 'ARRAY_SHIFT',         // dest, array
  ARRAY_UNSHIFT: 'ARRAY_UNSHIFT',     // array, value, type
  ARRAY_INDEX_OF: 'ARRAY_INDEX_OF',   // dest, array, value
  ARRAY_INCLUDES: 'ARRAY_INCLUDES',   // dest, array, value
  ARRAY_JOIN: 'ARRAY_JOIN',           // dest, array, separator
  ARRAY_SLICE: 'ARRAY_SLICE',         // dest, array, start, end
  ARRAY_REVERSE: 'ARRAY_REVERSE',     // dest, array
  ARRAY_CONCAT: 'ARRAY_CONCAT',       // dest, array1, array2

  // String methods
  STR_SLICE: 'STR_SLICE',             // dest, str, start, end
  STR_SPLIT: 'STR_SPLIT',             // dest, str, separator
  STR_REPLACE: 'STR_REPLACE',         // dest, str, search, replacement
  STR_REPEAT: 'STR_REPEAT',           // dest, str, count
  STR_STARTS_WITH: 'STR_STARTS_WITH', // dest, str, prefix
  STR_ENDS_WITH: 'STR_ENDS_WITH',     // dest, str, suffix
  STR_SUBSTRING: 'STR_SUBSTRING',     // dest, str, start, end

  // Object methods
  OBJ_KEYS: 'OBJ_KEYS',               // dest, obj
  OBJ_VALUES: 'OBJ_VALUES',           // dest, obj
  OBJ_ENTRIES: 'OBJ_ENTRIES',         // dest, obj
  OBJ_HAS_OWN: 'OBJ_HAS_OWN',       // dest, obj, keyLabel
  OBJ_DELETE: 'OBJ_DELETE',           // obj, keyLabel

  // Type conversion builtins
  PARSE_INT: 'PARSE_INT',             // dest, str
  PARSE_FLOAT: 'PARSE_FLOAT',         // dest, str
  TO_STRING: 'TO_STRING',             // dest, value
  IS_NAN: 'IS_NAN',                   // dest, value
  ARRAY_IS_ARRAY: 'ARRAY_IS_ARRAY',   // dest, value

  // String comparison
  STR_CMP: 'STR_CMP',                 // dest, setInstr, left, right
};

class IRInstruction {
  constructor(op, ...operands) {
    this.op = op;
    this.operands = operands;
  }

  toString() {
    return `${this.op} ${this.operands.join(', ')}`;
  }
}

module.exports = { IRProgram, IRFunction, IRInstruction, OP };
