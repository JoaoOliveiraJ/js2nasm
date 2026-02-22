'use strict';

// Definições de funções embutidas para o transpilador
// Mapeia nomes de builtins JS para suas implementações NASM

const BUILTINS = {
  'console.log': {
    type: 'print',
    description: 'Imprime valores no stdout com nova linha',
  },
  'Math.floor': {
    type: 'math',
    nasmFunc: '__math_floor',
  },
  'Math.ceil': {
    type: 'math',
    nasmFunc: '__math_ceil',
  },
  'Math.abs': {
    type: 'math',
    nasmFunc: '__math_abs',
  },
};

function isBuiltin(name) {
  return name in BUILTINS;
}

function getBuiltin(name) {
  return BUILTINS[name];
}

module.exports = { BUILTINS, isBuiltin, getBuiltin };
