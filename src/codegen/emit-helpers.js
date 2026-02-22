'use strict';

const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_BOOL, TYPE_ARRAY } = require('../types');

function emitHelpers() {
  // int_to_str: convert integer in rcx to string, pointer returned in rax
  this.label('__int_to_str');
  this.instr('push rbp');
  this.instr('mov rbp, rsp');
  this.instr('sub rsp, 64');
  this.instr('mov [rbp-8], rcx');       // save input value
  this.comment('_snprintf(buf, 256, "%lld", value)');
  this.instr('mov r9, rcx');            // value (4th arg)
  this.instr('lea r8, [fmt_int]');      // format (3rd arg)
  this.instr('mov rdx, 256');           // size (2nd arg)
  this.instr('lea rcx, [print_buf]');   // buffer (1st arg)
  this.instr('sub rsp, 32');
  this.instr('call _snprintf');
  this.instr('add rsp, 32');
  this.comment('get length of result');
  this.instr('sub rsp, 32');
  this.instr('lea rcx, [print_buf]');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('inc rax');                // +1 for null terminator
  this.instr('mov [rbp-16], rax');      // save length+1
  this.comment('allocate buffer');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbp-24], rax');      // save dest ptr
  this.comment('copy string');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');           // dest
  this.instr('lea rdx, [print_buf]');   // src
  this.instr('mov r8, [rbp-16]');       // count
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  this.instr('mov rax, [rbp-24]');      // return dest ptr
  this.instr('leave');
  this.instr('ret');
  this.blank();

  // __print_array: print array contents as [elem1, elem2, ...]
  // Input: rcx = array header pointer
  this.label('__print_array');
  this.instr('push rbp');
  this.instr('mov rbp, rsp');
  this.instr('sub rsp, 96');
  this.comment('rbp-8=arr, rbp-16=len, rbp-24=data, rbp-32=types, rbp-40=idx');
  this.instr('mov [rbp-8], rcx');           // save array ptr
  this.instr('mov rax, [rcx]');
  this.instr('mov [rbp-16], rax');          // length
  this.instr('mov rax, [rcx+16]');
  this.instr('mov [rbp-24], rax');          // data_ptr
  this.instr('mov rax, [rcx+24]');
  this.instr('mov [rbp-32], rax');          // types_ptr
  this.blank();
  // Print "["
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 91');                // '['
  this.instr('call putchar');
  this.instr('add rsp, 32');
  this.instr('mov qword [rbp-40], 0');      // index = 0
  this.label('.pa_loop');
  this.instr('mov rax, [rbp-40]');
  this.instr('cmp rax, [rbp-16]');
  this.instr('jge .pa_done');
  // Load type byte
  this.instr('mov rcx, [rbp-32]');
  this.instr('movzx eax, byte [rcx+rax]');
  this.instr('mov [rbp-48], rax');          // save type
  // Load value
  this.instr('mov rcx, [rbp-40]');
  this.instr('mov rdx, [rbp-24]');
  this.instr('mov rdx, [rdx+rcx*8]');
  this.instr('mov [rbp-56], rdx');          // save value
  // Dispatch on type
  this.instr('mov rax, [rbp-48]');
  this.instr(`cmp al, ${TYPE_STRING}`);
  this.instr('je .pa_str');
  this.instr(`cmp al, ${TYPE_BOOL}`);
  this.instr('je .pa_bool');
  this.instr(`cmp al, ${TYPE_FLOAT}`);
  this.instr('je .pa_float');
  this.instr(`cmp al, ${TYPE_ARRAY}`);
  this.instr('je .pa_arr');
  // Default: integer
  this.instr('sub rsp, 32');
  this.instr('lea rcx, [fmt_int]');
  this.instr('mov rdx, [rbp-56]');
  this.instr('call printf');
  this.instr('add rsp, 32');
  this.instr('jmp .pa_next');
  this.label('.pa_str');
  // Print opening quote
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 39');                // single quote '
  this.instr('call putchar');
  this.instr('add rsp, 32');
  // Print string content
  this.instr('sub rsp, 32');
  this.instr('lea rcx, [fmt_str]');
  this.instr('mov rdx, [rbp-56]');
  this.instr('call printf');
  this.instr('add rsp, 32');
  // Print closing quote
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 39');                // single quote '
  this.instr('call putchar');
  this.instr('add rsp, 32');
  this.instr('jmp .pa_next');
  this.label('.pa_bool');
  this.instr('mov rax, [rbp-56]');
  this.instr('test rax, rax');
  this.instr('lea rdx, [str_true]');
  this.instr('lea rcx, [str_false]');
  this.instr('cmovnz rcx, rdx');
  this.instr('mov rdx, rcx');
  this.instr('sub rsp, 32');
  this.instr('lea rcx, [fmt_str]');
  this.instr('call printf');
  this.instr('add rsp, 32');
  this.instr('jmp .pa_next');
  this.label('.pa_float');
  this.instr('sub rsp, 32');
  this.instr('lea rcx, [fmt_float]');
  this.instr('mov rax, [rbp-56]');
  this.instr('movq xmm1, rax');
  this.instr('movq rdx, xmm1');
  this.instr('call printf');
  this.instr('add rsp, 32');
  this.instr('jmp .pa_next');
  this.label('.pa_arr');
  // Recursive: nested array
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbp-56]');
  this.instr('call __print_array');
  this.instr('add rsp, 32');
  this.instr('jmp .pa_next');
  this.label('.pa_next');
  this.instr('inc qword [rbp-40]');
  // Print ", " if not last
  this.instr('mov rax, [rbp-40]');
  this.instr('cmp rax, [rbp-16]');
  this.instr('jge .pa_done');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 44');                // ','
  this.instr('call putchar');
  this.instr('add rsp, 32');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');                // ' '
  this.instr('call putchar');
  this.instr('add rsp, 32');
  this.instr('jmp .pa_loop');
  this.label('.pa_done');
  // Print "]"
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 93');                // ']'
  this.instr('call putchar');
  this.instr('add rsp, 32');
  this.instr('leave');
  this.instr('ret');
  this.blank();
}

module.exports = { emitHelpers };
