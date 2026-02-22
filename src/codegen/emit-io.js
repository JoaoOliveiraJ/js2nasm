'use strict';

const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_BOOL, TYPE_ARRAY } = require('../types');

function emitConsoleLog(argInfos) {
  if (!Array.isArray(argInfos) || argInfos.length === 0) return;

  for (let i = 0; i < argInfos.length; i++) {
    const { temp, type } = argInfos[i];
    const isLast = (i === argInfos.length - 1);

    // Imprime o valor (com nova linha apenas no último argumento)
    this.emitPrintValue(temp, type, isLast);

    // Imprime espaço entre argumentos (se não for o último)
    if (!isLast) {
      this.instr('sub rsp, 32');
      this.instr('mov rcx, 32'); // caractere de espaço (0x20)
      this.instr('call putchar');
      this.instr('add rsp, 32');
    }
  }
}

function emitPrintValue(temp, type, withNewline) {
  this.instr('sub rsp, 32');

  switch (type) {
    case TYPE_INT:
      this.instr(`lea rcx, [${withNewline ? 'fmt_int_nl' : 'fmt_int'}]`);
      this.instr(`mov rdx, ${this.loc(temp)}`);
      this.instr('call printf');
      break;

    case TYPE_STRING:
      this.instr(`lea rcx, [${withNewline ? 'fmt_str_nl' : 'fmt_str'}]`);
      this.instr(`mov rdx, ${this.loc(temp)}`);
      this.instr('call printf');
      break;

    case TYPE_BOOL:
      this.instr(`mov rax, ${this.loc(temp)}`);
      this.instr('test rax, rax');
      this.instr('lea rcx, [str_true]');
      this.instr('lea rdx, [str_false]');
      this.instr('cmovz rcx, rdx');
      this.instr('mov rdx, rcx');
      this.instr(`lea rcx, [${withNewline ? 'fmt_str_nl' : 'fmt_str'}]`);
      this.instr('call printf');
      break;

    case TYPE_FLOAT:
      this.instr(`lea rcx, [${withNewline ? 'fmt_float_nl' : 'fmt_float'}]`);
      this.instr(`movsd xmm1, ${this.loc(temp)}`);
      this.instr('movq rdx, xmm1');
      this.instr('call printf');
      break;

    case TYPE_ARRAY:
      this.instr(`mov rcx, ${this.loc(temp)}`);
      this.instr('call __print_array');
      if (withNewline) {
        this.instr('lea rcx, [fmt_newline]');
        this.instr('call printf');
      }
      break;

    default:
      // Padrão: imprime como inteiro
      this.instr(`lea rcx, [${withNewline ? 'fmt_int_nl' : 'fmt_int'}]`);
      this.instr(`mov rdx, ${this.loc(temp)}`);
      this.instr('call printf');
      break;
  }

  this.instr('add rsp, 32');
}

module.exports = { emitConsoleLog, emitPrintValue };
