'use strict';

// Tipos de nó IR de código de três endereços (TAC)

class IRProgram {
  constructor() {
    this.functions = [];    // IRFunction[]
    this.main = [];         // IRInstruction[] (código de nível superior)
    this.strings = [];      // { label: string, value: string }[]
    this.floats = [];       // { label: string, value: number }[]
    this.globals = new Set(); // nomes de variáveis globais
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
    this.locals = [];        // string[] (todos os nomes de variáveis locais)
  }
}

// Opcodes de instrução IR
const OP = {
  // Constantes
  LOAD_INT: 'LOAD_INT',         // destino, valor
  LOAD_FLOAT: 'LOAD_FLOAT',     // destino, rótulo
  LOAD_STRING: 'LOAD_STRING',   // destino, rótulo
  LOAD_BOOL: 'LOAD_BOOL',       // destino, valor (0 ou 1)
  LOAD_NULL: 'LOAD_NULL',       // destino
  LOAD_UNDEFINED: 'LOAD_UNDEFINED', // destino

  // Variáveis
  LOAD_VAR: 'LOAD_VAR',         // destino, nomeVar
  STORE_VAR: 'STORE_VAR',       // nomeVar, origem

  // Aritmética
  ADD: 'ADD',                    // destino, esquerda, direita
  SUB: 'SUB',                    // destino, esquerda, direita
  MUL: 'MUL',                    // destino, esquerda, direita
  DIV: 'DIV',                    // destino, esquerda, direita
  MOD: 'MOD',                    // destino, esquerda, direita
  POW: 'POW',                    // destino, esquerda, direita
  NEG: 'NEG',                    // destino, origem

  // Comparação
  CMP_EQ: 'CMP_EQ',             // destino, esquerda, direita (==)
  CMP_SEQ: 'CMP_SEQ',           // destino, esquerda, direita (===)
  CMP_NE: 'CMP_NE',             // destino, esquerda, direita (!=)
  CMP_SNE: 'CMP_SNE',           // destino, esquerda, direita (!==)
  CMP_LT: 'CMP_LT',             // destino, esquerda, direita (<)
  CMP_GT: 'CMP_GT',             // destino, esquerda, direita (>)
  CMP_LE: 'CMP_LE',             // destino, esquerda, direita (<=)
  CMP_GE: 'CMP_GE',             // destino, esquerda, direita (>=)

  // Lógico
  NOT: 'NOT',                    // destino, origem
  AND: 'AND',                    // destino, esquerda, direita (curto-circuito)
  OR: 'OR',                      // destino, esquerda, direita (curto-circuito)

  // Fluxo de controle
  LABEL: 'LABEL',               // rótulo
  JUMP: 'JUMP',                 // rótulo
  JUMP_IF_FALSE: 'JUMP_IF_FALSE', // origem, rótulo
  JUMP_IF_TRUE: 'JUMP_IF_TRUE',   // origem, rótulo

  // Funções
  CALL: 'CALL',                  // destino, nomeFunção, args[]
  RETURN: 'RETURN',              // origem (opcional)
  PARAM: 'PARAM',               // nomeParâmetro, índice

  // Embutidos
  CONSOLE_LOG: 'CONSOLE_LOG',   // args[] (com dicas de tipo)

  // Strings
  STR_CONCAT: 'STR_CONCAT',     // destino, esquerda, direita
  STR_LENGTH: 'STR_LENGTH',     // destino, origem

  // Arrays
  ARRAY_NEW: 'ARRAY_NEW',       // destino, elementos[]
  ARRAY_GET: 'ARRAY_GET',       // destino, array, índice
  ARRAY_SET: 'ARRAY_SET',       // array, índice, valor
  ARRAY_PUSH: 'ARRAY_PUSH',     // array, valor
  ARRAY_LENGTH: 'ARRAY_LENGTH', // destino, array

  // Template literals
  TEMPLATE: 'TEMPLATE',         // destino, partes[] (strings e expressões intercaladas)

  // Operadores de atribuição
  ASSIGN_ADD: 'ASSIGN_ADD',     // nomeVar, origem
  ASSIGN_SUB: 'ASSIGN_SUB',     // nomeVar, origem

  // Embutidos - console.error, process.exit
  CONSOLE_ERROR: 'CONSOLE_ERROR', // args[] (com dicas de tipo) — imprime no stderr
  PROCESS_EXIT: 'PROCESS_EXIT',   // temp códigoSaída

  // Embutidos de Math
  MATH_ABS: 'MATH_ABS',         // destino, origem
  MATH_MAX: 'MATH_MAX',         // destino, esquerda, direita
  MATH_MIN: 'MATH_MIN',         // destino, esquerda, direita
  MATH_FLOOR: 'MATH_FLOOR',     // destino, origem (float → int)
  MATH_SQRT: 'MATH_SQRT',       // destino, origem (float → float)
  MATH_POW: 'MATH_POW',         // destino, base, exp (apenas int por enquanto)
  MATH_ROUND: 'MATH_ROUND',     // destino, origem
  MATH_CEIL: 'MATH_CEIL',       // destino, origem
  MATH_TRUNC: 'MATH_TRUNC',     // destino, origem
  MATH_SIGN: 'MATH_SIGN',       // destino, origem
  MATH_RANDOM: 'MATH_RANDOM',   // destino
  MATH_LOG: 'MATH_LOG',         // destino, origem
  MATH_LOG2: 'MATH_LOG2',       // destino, origem
  MATH_SIN: 'MATH_SIN',         // destino, origem
  MATH_COS: 'MATH_COS',         // destino, origem
  MATH_TAN: 'MATH_TAN',         // destino, origem
  MATH_ATAN2: 'MATH_ATAN2',     // destino, y, x
  MATH_CLAMP32: 'MATH_CLAMP32', // destino, origem (Math.clz32)

  // String extra
  STR_CHAR_CODE_AT: 'STR_CHAR_CODE_AT',       // destino, str, índice
  STR_FROM_CHAR_CODE: 'STR_FROM_CHAR_CODE',   // destino, código
  STR_PAD_START: 'STR_PAD_START',             // destino, str, tamanhoAlvo, strPreenchimento
  STR_PAD_END: 'STR_PAD_END',                 // destino, str, tamanhoAlvo, strPreenchimento
  STR_TRIM_START: 'STR_TRIM_START',           // destino, str
  STR_TRIM_END: 'STR_TRIM_END',               // destino, str
  STR_REPLACE_ALL: 'STR_REPLACE_ALL',         // destino, str, busca, substituição

  // Embutidos de Number
  NUM_IS_INTEGER: 'NUM_IS_INTEGER', // destino, origem
  NUM_IS_FINITE: 'NUM_IS_FINITE',   // destino, origem
  NUM_TO_FIXED: 'NUM_TO_FIXED',     // destino, origem, dígitos

  // Array extra
  ARRAY_SPLICE: 'ARRAY_SPLICE',   // destino, array, início, contRemover, ...itens
  ARRAY_FILL: 'ARRAY_FILL',       // destino, array, valor, início, fim
  ARRAY_FLAT: 'ARRAY_FLAT',       // destino, array

  // typeof
  TYPEOF: 'TYPEOF',             // destino, origem, dicaTipo

  // Bit a bit
  BIT_AND: 'BIT_AND',           // destino, esquerda, direita
  BIT_OR: 'BIT_OR',             // destino, esquerda, direita
  BIT_XOR: 'BIT_XOR',           // destino, esquerda, direita
  BIT_NOT: 'BIT_NOT',           // destino, origem
  SHL: 'SHL',                    // destino, esquerda, direita
  SHR: 'SHR',                    // destino, esquerda, direita
  USHR: 'USHR',                  // destino, esquerda, direita (sem sinal)

  // Incremento/decremento
  PRE_INC: 'PRE_INC',           // destino, nomeVar
  PRE_DEC: 'PRE_DEC',           // destino, nomeVar
  POST_INC: 'POST_INC',         // destino, nomeVar
  POST_DEC: 'POST_DEC',         // destino, nomeVar

  // Parâmetros padrão
  JUMP_IF_NOT_UNDEF: 'JUMP_IF_NOT_UNDEF', // origem, rótulo  (pular se o parâmetro foi fornecido)

  // Métodos de String
  STR_CHAR_AT: 'STR_CHAR_AT',       // destino, str, índice
  STR_INDEX_OF: 'STR_INDEX_OF',     // destino, str, busca
  STR_TO_UPPER: 'STR_TO_UPPER',     // destino, str
  STR_TO_LOWER: 'STR_TO_LOWER',     // destino, str
  STR_INCLUDES: 'STR_INCLUDES',     // destino, str, busca
  STR_TRIM: 'STR_TRIM',             // destino, str

  // Objetos
  OBJ_NEW: 'OBJ_NEW',               // destino, chaves[], valores[]
  OBJ_GET: 'OBJ_GET',               // destino, obj, rótuloChave
  OBJ_SET: 'OBJ_SET',               // obj, rótuloChave, valor

  // Parâmetros rest
  REST_ARGS: 'REST_ARGS',           // destino, índiceInício, contTotalArgs

  // Spread
  ARRAY_SPREAD: 'ARRAY_SPREAD',     // arrayDestino, arrayOrigem — copiar todos os elementos da origem para o destino
  OBJ_SPREAD: 'OBJ_SPREAD',         // objDestino, objOrigem — copiar todas as propriedades da origem para o destino
  CALL_SPREAD: 'CALL_SPREAD',       // destino, nomeFunção, argsNormais[], arraySpread

  // Exceções
  TRY_PUSH: 'TRY_PUSH',             // rótuloHandler — empilhar manipulador de exceção
  TRY_POP: 'TRY_POP',               // — desempilhar manipulador de exceção (caminho normal)
  THROW: 'THROW',                    // tempValor — lançar exceção

  // Classes
  OBJ_NEW_EMPTY: 'OBJ_NEW_EMPTY',   // destino — criar objeto vazio

  // Métodos de Array
  ARRAY_POP: 'ARRAY_POP',             // destino, array
  ARRAY_SHIFT: 'ARRAY_SHIFT',         // destino, array
  ARRAY_UNSHIFT: 'ARRAY_UNSHIFT',     // array, valor, tipo
  ARRAY_INDEX_OF: 'ARRAY_INDEX_OF',   // destino, array, valor
  ARRAY_INCLUDES: 'ARRAY_INCLUDES',   // destino, array, valor
  ARRAY_JOIN: 'ARRAY_JOIN',           // destino, array, separador
  ARRAY_SLICE: 'ARRAY_SLICE',         // destino, array, início, fim
  ARRAY_REVERSE: 'ARRAY_REVERSE',     // destino, array
  ARRAY_CONCAT: 'ARRAY_CONCAT',       // destino, array1, array2

  // Métodos de String
  STR_SLICE: 'STR_SLICE',             // destino, str, início, fim
  STR_SPLIT: 'STR_SPLIT',             // destino, str, separador
  STR_REPLACE: 'STR_REPLACE',         // destino, str, busca, substituição
  STR_REPEAT: 'STR_REPEAT',           // destino, str, contagem
  STR_STARTS_WITH: 'STR_STARTS_WITH', // destino, str, prefixo
  STR_ENDS_WITH: 'STR_ENDS_WITH',     // destino, str, sufixo
  STR_SUBSTRING: 'STR_SUBSTRING',     // destino, str, início, fim

  // Métodos de Object
  OBJ_KEYS: 'OBJ_KEYS',               // destino, obj
  OBJ_VALUES: 'OBJ_VALUES',           // destino, obj
  OBJ_ENTRIES: 'OBJ_ENTRIES',         // destino, obj
  OBJ_HAS_OWN: 'OBJ_HAS_OWN',       // destino, obj, rótuloChave
  OBJ_DELETE: 'OBJ_DELETE',           // obj, rótuloChave

  // Embutidos de conversão de tipo
  PARSE_INT: 'PARSE_INT',             // destino, str
  PARSE_FLOAT: 'PARSE_FLOAT',         // destino, str
  TO_STRING: 'TO_STRING',             // destino, valor
  IS_NAN: 'IS_NAN',                   // destino, valor
  ARRAY_IS_ARRAY: 'ARRAY_IS_ARRAY',   // destino, valor

  // Comparação de String
  STR_CMP: 'STR_CMP',                 // destino, instrSet, esquerda, direita
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
