'use strict';

// Tags de tipo para valores
const TYPE_UNDEFINED = 0;
const TYPE_NULL = 1;
const TYPE_BOOL = 2;
const TYPE_INT = 3;
const TYPE_FLOAT = 4;
const TYPE_STRING = 5;
const TYPE_ARRAY = 6;
const TYPE_FUNCTION = 7;

// Tamanho do valor em bytes (valores tagueados de 16 bytes)
const VALUE_SIZE = 16;

// Nomes das tags para saída de debug
const TAG_NAMES = {
  [TYPE_UNDEFINED]: 'undefined',
  [TYPE_NULL]: 'null',
  [TYPE_BOOL]: 'bool',
  [TYPE_INT]: 'int',
  [TYPE_FLOAT]: 'float',
  [TYPE_STRING]: 'string',
  [TYPE_ARRAY]: 'array',
  [TYPE_FUNCTION]: 'function',
};

module.exports = {
  TYPE_UNDEFINED,
  TYPE_NULL,
  TYPE_BOOL,
  TYPE_INT,
  TYPE_FLOAT,
  TYPE_STRING,
  TYPE_ARRAY,
  TYPE_FUNCTION,
  VALUE_SIZE,
  TAG_NAMES,
};
