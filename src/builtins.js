'use strict';

// Builtin function definitions for the transpiler
// Maps JS builtin names to their NASM implementations

const BUILTINS = {
  'console.log': {
    type: 'print',
    description: 'Print values to stdout with newline',
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
