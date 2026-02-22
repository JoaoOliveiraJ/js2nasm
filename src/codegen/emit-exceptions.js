'use strict';

function emitTryPush(handlerLabel) {
  // Push handler onto exception stack
  // Each entry: [handler_addr (8)][saved_rbp (8)][saved_rsp (8)] = 24 bytes
  this.comment('try_push');
  this.instr('mov rcx, [_exc_sp]');
  this.instr('imul rcx, 24');               // offset = sp * 24
  this.instr(`lea rax, [${handlerLabel}]`);
  this.instr('lea rdx, [_exc_stack]');
  this.instr('mov [rdx+rcx], rax');         // handler addr
  this.instr('mov [rdx+rcx+8], rbp');       // saved rbp
  this.instr('mov [rdx+rcx+16], rsp');      // saved rsp
  this.instr('inc qword [_exc_sp]');
}

function emitTryPop() {
  // Pop handler from exception stack (normal path)
  this.comment('try_pop');
  this.instr('dec qword [_exc_sp]');
}

function emitThrow(valueTemp) {
  // Store exception value, pop handler, restore rbp/rsp, jump to handler
  this.comment('throw');
  this.instr(`mov rax, ${this.loc(valueTemp)}`);
  this.instr('mov [gvar__exc_value], rax');

  this.instr('mov rcx, [_exc_sp]');
  this.instr('dec rcx');
  this.instr('mov [_exc_sp], rcx');
  this.instr('imul rcx, 24');
  this.instr('lea rdx, [_exc_stack]');
  this.instr('mov rax, [rdx+rcx]');         // handler addr
  this.instr('mov rbp, [rdx+rcx+8]');       // restore rbp
  this.instr('mov rsp, [rdx+rcx+16]');      // restore rsp
  this.instr('jmp rax');                     // jump to catch
}

module.exports = { emitTryPush, emitTryPop, emitThrow };
