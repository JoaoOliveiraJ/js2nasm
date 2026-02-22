'use strict';

function emitTryPush(handlerLabel) {
  // Empilha o handler na pilha de exceções
  // Cada entrada: [handler_addr (8)][saved_rbp (8)][saved_rsp (8)] = 24 bytes
  this.comment('try_push');
  this.instr('mov rcx, [_exc_sp]');
  this.instr('imul rcx, 24');               // deslocamento = sp * 24
  this.instr(`lea rax, [${handlerLabel}]`);
  this.instr('lea rdx, [_exc_stack]');
  this.instr('mov [rdx+rcx], rax');         // endereço do handler
  this.instr('mov [rdx+rcx+8], rbp');       // rbp salvo
  this.instr('mov [rdx+rcx+16], rsp');      // rsp salvo
  this.instr('inc qword [_exc_sp]');
}

function emitTryPop() {
  // Desempilha o handler da pilha de exceções (caminho normal)
  this.comment('try_pop');
  this.instr('dec qword [_exc_sp]');
}

function emitThrow(valueTemp) {
  // Armazena o valor da exceção, desempilha o handler, restaura rbp/rsp, salta para o handler
  this.comment('throw');
  this.instr(`mov rax, ${this.loc(valueTemp)}`);
  this.instr('mov [gvar__exc_value], rax');

  this.instr('mov rcx, [_exc_sp]');
  this.instr('dec rcx');
  this.instr('mov [_exc_sp], rcx');
  this.instr('imul rcx, 24');
  this.instr('lea rdx, [_exc_stack]');
  this.instr('mov rax, [rdx+rcx]');         // endereço do handler
  this.instr('mov rbp, [rdx+rcx+8]');       // restaura rbp
  this.instr('mov rsp, [rdx+rcx+16]');      // restore rsp
  this.instr('jmp rax');                     // jump to catch
}

module.exports = { emitTryPush, emitTryPop, emitThrow };
