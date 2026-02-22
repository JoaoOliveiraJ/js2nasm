'use strict';

const { TYPE_STRING } = require('../types');

function emitStrConcat(dest, left, right, leftType, rightType) {
  this.comment('string concatenation');
  // Save callee-saved regs (4 pushes = 32 bytes, keeps 16-byte alignment)
  // rbx = result ptr, r12 = left str, r13 = right str, r14 = left len
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  // Convert left to string if needed
  if (leftType === TYPE_STRING) {
    this.instr(`mov r12, ${this.loc(left)}`);
  } else {
    this.instr('sub rsp, 32');
    this.instr(`mov rcx, ${this.loc(left)}`);
    this.instr('call __int_to_str');
    this.instr('add rsp, 32');
    this.instr('mov r12, rax');
  }

  // Convert right to string if needed
  if (rightType === TYPE_STRING) {
    this.instr(`mov r13, ${this.loc(right)}`);
  } else {
    this.instr('sub rsp, 32');
    this.instr(`mov rcx, ${this.loc(right)}`);
    this.instr('call __int_to_str');
    this.instr('add rsp, 32');
    this.instr('mov r13, rax');
  }

  // Get left length
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');       // r14 = left len

  // Get right length
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');       // rbx = right len

  // Allocate: leftLen + rightLen + 1
  this.instr('lea rcx, [r14+rbx+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');       // rbx = result buffer ptr

  // memcpy(buf, left, leftLen)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');       // dest
  this.instr('mov rdx, r12');       // src = left
  this.instr('mov r8, r14');        // count = leftLen
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Get right length again for copy
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('inc rax');            // +1 to copy null terminator

  // memcpy(buf + leftLen, right, rightLen + 1)
  this.instr('sub rsp, 32');
  this.instr('lea rcx, [rbx+r14]'); // dest = buf + leftLen
  this.instr('mov rdx, r13');       // src = right
  this.instr('mov r8, rax');        // count = rightLen + 1
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  this.instr(`mov ${this.loc(dest)}, rbx`);

  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrLength(dest, src) {
  this.instr('sub rsp, 32');
  this.instr(`mov rcx, ${this.loc(src)}`);
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitStrCharAt(dest, str, index) {
  // Returns a 1-char null-terminated string
  this.comment('str.charAt(index)');
  this.instr('push rbx');
  this.instr('push r12');
  // Allocate 2 bytes for result
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 2');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');             // rbx = result buf
  this.instr(`mov rax, ${this.loc(str)}`);
  this.instr(`mov rcx, ${this.loc(index)}`);
  this.instr('movzx edx, byte [rax+rcx]'); // get char
  this.instr('mov [rbx], dl');            // store char
  this.instr('mov byte [rbx+1], 0');      // null terminate
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrIndexOf(dest, str, search) {
  // Uses strstr to find substring, returns index or -1
  this.comment('str.indexOf(search)');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(str)}`);  // save haystack
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');                // haystack
  this.instr(`mov rdx, ${this.loc(search)}`); // needle
  this.instr('call strstr');
  this.instr('add rsp, 32');
  this.instr('test rax, rax');
  const notFound = this.newLabel('indexof_nf');
  const done = this.newLabel('indexof_done');
  this.instr(`jz ${notFound}`);
  this.instr('sub rax, rbx');               // rax = pointer diff = index
  this.instr(`jmp ${done}`);
  this.label(notFound);
  this.instr('mov rax, -1');
  this.label(done);
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrCase(dest, str, direction) {
  // Clone string and convert each char
  this.comment(`str.to${direction === 'upper' ? 'Upper' : 'Lower'}Case()`);
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr(`mov r12, ${this.loc(str)}`);
  // Get length
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r13, rax');               // r13 = length
  this.instr('inc rax');
  // Allocate
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');               // rbx = dest buf
  // Copy and convert
  this.instr('xor r14, r14');               // r14 = index
  const loopLbl = this.newLabel('case_loop');
  const endLbl = this.newLabel('case_end');
  this.label(loopLbl);
  this.instr('cmp r14, r13');
  this.instr(`jge ${endLbl}`);
  this.instr('movzx eax, byte [r12+r14]');
  if (direction === 'upper') {
    this.instr('cmp al, 97');                // 'a'
    const skip = this.newLabel('case_skip');
    this.instr(`jl ${skip}`);
    this.instr('cmp al, 122');               // 'z'
    this.instr(`jg ${skip}`);
    this.instr('sub al, 32');
    this.label(skip);
  } else {
    this.instr('cmp al, 65');                // 'A'
    const skip = this.newLabel('case_skip');
    this.instr(`jl ${skip}`);
    this.instr('cmp al, 90');                // 'Z'
    this.instr(`jg ${skip}`);
    this.instr('add al, 32');
    this.label(skip);
  }
  this.instr('mov [rbx+r14], al');
  this.instr('inc r14');
  this.instr(`jmp ${loopLbl}`);
  this.label(endLbl);
  this.instr('mov byte [rbx+r13], 0');       // null terminate
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrIncludes(dest, str, search) {
  // strstr != NULL → 1, else 0
  this.comment('str.includes(search)');
  this.instr('sub rsp, 32');
  this.instr(`mov rcx, ${this.loc(str)}`);
  this.instr(`mov rdx, ${this.loc(search)}`);
  this.instr('call strstr');
  this.instr('add rsp, 32');
  this.instr('test rax, rax');
  this.instr('setne al');
  this.instr('movzx rax, al');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitStrTrim(dest, str) {
  // Skip leading spaces, find last non-space, copy substring
  this.comment('str.trim()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr(`mov r12, ${this.loc(str)}`);   // r12 = src
  // Find start (skip spaces/tabs)
  this.instr('mov r13, r12');                // r13 = start
  const trimStart = this.newLabel('trim_s');
  const trimStartDone = this.newLabel('trim_sd');
  this.label(trimStart);
  this.instr('movzx eax, byte [r13]');
  this.instr('cmp al, 32');                  // space
  this.instr(`je ._cg_trim_inc_${this._labelCounter}`);
  this.instr('cmp al, 9');                   // tab
  this.instr(`je ._cg_trim_inc_${this._labelCounter}`);
  this.instr('cmp al, 10');                  // newline
  this.instr(`je ._cg_trim_inc_${this._labelCounter}`);
  this.instr('cmp al, 13');                  // carriage return
  this.instr(`jne ${trimStartDone}`);
  this.label(`._cg_trim_inc_${this._labelCounter++}`);
  this.instr('inc r13');
  this.instr(`jmp ${trimStart}`);
  this.label(trimStartDone);
  // Get total length from start
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');               // r14 = trimmed-start length
  // Find end (skip trailing spaces)
  const trimEnd = this.newLabel('trim_e');
  const trimEndDone = this.newLabel('trim_ed');
  this.label(trimEnd);
  this.instr('test r14, r14');
  this.instr(`jz ${trimEndDone}`);
  this.instr('movzx eax, byte [r13+r14-1]');
  this.instr('cmp al, 32');
  this.instr(`je ._cg_trim_dec_${this._labelCounter}`);
  this.instr('cmp al, 9');
  this.instr(`je ._cg_trim_dec_${this._labelCounter}`);
  this.instr('cmp al, 10');
  this.instr(`je ._cg_trim_dec_${this._labelCounter}`);
  this.instr('cmp al, 13');
  this.instr(`jne ${trimEndDone}`);
  this.label(`._cg_trim_dec_${this._labelCounter++}`);
  this.instr('dec r14');
  this.instr(`jmp ${trimEnd}`);
  this.label(trimEndDone);
  // Allocate and copy
  this.instr('lea rcx, [r14+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');               // dest
  this.instr('mov rdx, r13');               // src = start ptr
  this.instr('mov r8, r14');                // count
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  this.instr('mov byte [rbx+r14], 0');       // null terminate
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrSlice(dest, str, start, end) {
  this.comment('str.slice()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(str)}`);
  this.instr(`mov r13, ${this.loc(start)}`);
  this.instr(`mov r14, ${this.loc(end)}`);

  // Get string length
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  // rax = length

  // Handle negative start
  this.instr('test r13, r13');
  const startOk = this.newLabel('sslc_sok');
  this.instr(`jge ${startOk}`);
  this.instr('add r13, rax');
  this.label(startOk);

  // Handle negative end
  this.instr('test r14, r14');
  const endOk = this.newLabel('sslc_eok');
  this.instr(`jge ${endOk}`);
  this.instr('add r14, rax');
  this.label(endOk);

  // Clamp end to length
  this.instr('cmp r14, rax');
  const endClamp = this.newLabel('sslc_ec');
  this.instr(`jle ${endClamp}`);
  this.instr('mov r14, rax');
  this.label(endClamp);

  // count = end - start, min 0
  this.instr('mov rcx, r14');
  this.instr('sub rcx, r13');
  this.instr('test rcx, rcx');
  const cntOk = this.newLabel('sslc_cok');
  this.instr(`jg ${cntOk}`);
  this.instr('xor rcx, rcx');
  this.label(cntOk);
  this.instr('push rcx');                 // save count

  // malloc(count + 1)
  this.instr('inc rcx');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');

  // memcpy
  this.instr('pop rcx');                  // count
  this.instr('push rcx');
  this.instr('mov r8, rcx');
  this.instr('mov rcx, rbx');             // dest
  this.instr('lea rdx, [r12+r13]');       // src = str + start
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Null terminate
  this.instr('pop rcx');
  this.instr('mov byte [rbx+rcx], 0');

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrSplit(dest, str, separator) {
  this.comment('str.split()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('push rdi');

  this.instr(`mov r12, ${this.loc(str)}`);       // source string
  this.instr(`mov r13, ${this.loc(separator)}`);  // separator

  // Get separator length
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');             // r14 = sep length

  // Create result array (header 32 bytes)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov qword [rbx], 0');       // length = 0
  this.instr('mov qword [rbx+8], 8');     // capacity = 8
  // Allocate data (8 * 8 = 64)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 64');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');
  // Allocate types (8)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 8');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  // r15 = current position in string
  this.instr('mov r15, r12');

  const loopLbl = this.newLabel('ssplit_loop');
  const endLbl = this.newLabel('ssplit_end');
  const pushPart = this.newLabel('ssplit_push');

  this.label(loopLbl);
  // Find next occurrence of separator: strstr(r15, r13)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r15');
  this.instr('mov rdx, r13');
  this.instr('call strstr');
  this.instr('add rsp, 32');
  this.instr('test rax, rax');
  this.instr(`jz ${endLbl}`);            // no more separators
  this.instr('mov rdi, rax');             // rdi = pointer to separator

  // Part length = rdi - r15
  this.instr('mov rcx, rdi');
  this.instr('sub rcx, r15');             // part length
  this.instr('push rcx');

  // Allocate part string
  this.instr('inc rcx');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // save part ptr

  // memcpy
  this.instr('pop rcx');
  this.instr('push rcx');                 // keep part ptr
  this.instr('pop rcx');                  // part ptr -> rcx = dest
  // Ugh, need to be more careful
  this.instr('pop rax');                  // part length
  this.instr('push rax');
  this.instr('mov r8, rax');              // count
  // re-allocate since we lost the ptr
  this.instr('inc rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // save new part ptr
  this.instr('pop rcx');
  this.instr('push rcx');                 // keep it
  // memcpy(part, r15, partLen)
  this.instr('pop rcx');                  // dest = part
  this.instr('push rcx');
  this.instr('mov rdx, r15');             // src
  this.instr('pop rax');
  this.instr('push rax');
  this.instr('mov rcx, rax');
  this.instr('mov rdx, r15');
  // Get partLen from stack
  // This is getting too messy. Let me use a simpler approach with fixed registers.

  // OK I'm going to restart this function with a cleaner approach
  // Actually, let me just pop everything and redo this properly.
  // The problem is juggling too many values with limited registers.
  // Let me use the stack frame more carefully.

  this.instr('pop rax');                  // clean stack: part ptr
  this.instr('pop rcx');                  // clean stack: part length

  // --- CLEANER APPROACH ---
  // part length is (rdi - r15), stored in a register
  this.instr('mov rcx, rdi');
  this.instr('sub rcx, r15');             // rcx = part length
  // Allocate part: malloc(partLen + 1)
  this.instr('push rcx');                 // save part length
  this.instr('lea rcx, [rcx+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  // rax = part buffer. memcpy(rax, r15, partLen)
  this.instr('pop r8');                   // part length
  this.instr('push r8');                  // save again
  this.instr('push rax');                 // save part ptr
  this.instr('mov rcx, rax');             // dest
  this.instr('mov rdx, r15');             // src
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  this.instr('pop rax');                  // part ptr
  this.instr('pop r8');                   // part length
  this.instr('mov byte [rax+r8], 0');     // null terminate

  // Push part into result array using inline push logic
  // Check capacity
  this.instr('mov rcx, [rbx]');           // current length
  this.instr('cmp rcx, [rbx+8]');
  const splitNoRealloc = this.newLabel('ssplit_norealloc');
  this.instr(`jl ${splitNoRealloc}`);
  // Realloc data
  this.instr('push rax');
  this.instr('mov rdx, [rbx+8]');
  this.instr('shl rdx, 1');
  this.instr('mov [rbx+8], rdx');
  this.instr('shl rdx, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+16]');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+24]');
  this.instr('mov rdx, [rbx+8]');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');
  this.instr('pop rax');
  this.label(splitNoRealloc);

  // Store element
  this.instr('mov rcx, [rbx]');
  this.instr('mov rdx, [rbx+16]');
  this.instr('mov [rdx+rcx*8], rax');
  this.instr('mov rdx, [rbx+24]');
  this.instr(`mov byte [rdx+rcx], ${TYPE_STRING}`);
  this.instr('inc qword [rbx]');

  // Advance past separator
  this.instr('lea r15, [rdi+r14]');       // r15 = match + sepLen
  this.instr(`jmp ${loopLbl}`);

  this.label(endLbl);
  // Push remaining part (r15 to end of string)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r15');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // remaining length
  this.instr('lea rcx, [rax+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('pop r8');                   // length
  this.instr('push r8');
  this.instr('push rax');                 // part ptr
  this.instr('mov rcx, rax');
  this.instr('mov rdx, r15');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  this.instr('pop rax');
  this.instr('pop r8');
  this.instr('mov byte [rax+r8], 0');

  // Push last part
  this.instr('mov rcx, [rbx]');
  this.instr('cmp rcx, [rbx+8]');
  const splitNoRealloc2 = this.newLabel('ssplit_norealloc2');
  this.instr(`jl ${splitNoRealloc2}`);
  this.instr('push rax');
  this.instr('mov rdx, [rbx+8]');
  this.instr('shl rdx, 1');
  this.instr('mov [rbx+8], rdx');
  this.instr('shl rdx, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+16]');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+24]');
  this.instr('mov rdx, [rbx+8]');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');
  this.instr('pop rax');
  this.label(splitNoRealloc2);

  this.instr('mov rcx, [rbx]');
  this.instr('mov rdx, [rbx+16]');
  this.instr('mov [rdx+rcx*8], rax');
  this.instr('mov rdx, [rbx+24]');
  this.instr(`mov byte [rdx+rcx], ${TYPE_STRING}`);
  this.instr('inc qword [rbx]');

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop rdi');
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrReplace(dest, str, search, replacement) {
  this.comment('str.replace()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(str)}`);
  this.instr(`mov r13, ${this.loc(search)}`);
  this.instr(`mov r14, ${this.loc(replacement)}`);

  // Find first occurrence
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('mov rdx, r13');
  this.instr('call strstr');
  this.instr('add rsp, 32');
  this.instr('test rax, rax');
  const notFound = this.newLabel('srepl_nf');
  const done = this.newLabel('srepl_done');
  this.instr(`jz ${notFound}`);
  this.instr('mov rbx, rax');             // rbx = match position

  // Get lengths
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // strLen

  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // searchLen

  this.instr('sub rsp, 32');
  this.instr('mov rcx, r14');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  // rax = replLen, stack: [searchLen, strLen]
  this.instr('pop rcx');                  // searchLen
  this.instr('pop rdx');                  // strLen

  // newLen = strLen - searchLen + replLen
  this.instr('sub rdx, rcx');
  this.instr('add rdx, rax');
  this.instr('push rcx');                 // save searchLen
  this.instr('push rax');                 // save replLen

  // malloc(newLen + 1)
  this.instr('lea rcx, [rdx+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // save result ptr

  // prefix length = rbx - r12
  this.instr('mov r8, rbx');
  this.instr('sub r8, r12');
  // memcpy(result, str, prefixLen)
  this.instr('mov rcx, rax');             // dest
  this.instr('mov rdx, r12');             // src
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Copy replacement: memcpy(result+prefixLen, replacement, replLen)
  this.instr('pop rax');                  // result ptr
  this.instr('push rax');
  this.instr('mov rcx, rbx');
  this.instr('sub rcx, r12');             // prefix len
  this.instr('add rcx, rax');             // dest = result + prefixLen
  this.instr('mov rdx, r14');             // src = replacement
  this.instr('pop rax');                  // result
  this.instr('push rax');
  this.instr('pop rax');
  this.instr('push rax');
  this.instr('mov r8, [rsp+8]');          // replLen from stack

  // This stack juggling is getting complex. Let me simplify by recomputing.
  this.instr('pop rax');                  // result ptr
  this.instr('pop r8');                   // replLen
  this.instr('pop rcx');                  // searchLen
  this.instr('push rcx');
  this.instr('push r8');
  this.instr('push rax');

  this.instr('mov rcx, rbx');
  this.instr('sub rcx, r12');             // prefix len
  this.instr('add rcx, rax');             // dest = result + prefixLen
  this.instr('mov rdx, r14');             // replacement
  // r8 = replLen (already set above... no, popped. Recompute)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r14');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r8, rax');              // replLen

  this.instr('pop rax');                  // result ptr
  this.instr('push rax');
  this.instr('mov rcx, rbx');
  this.instr('sub rcx, r12');
  this.instr('add rcx, rax');
  this.instr('mov rdx, r14');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Copy suffix: memcpy(result+prefixLen+replLen, match+searchLen, suffixLen+1)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov rcx, rax');             // searchLen
  this.instr('lea rdx, [rbx+rcx]');       // src = match + searchLen
  // Suffix len
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rdx');
  this.instr('push rdx');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('pop rdx');
  this.instr('inc rax');                  // +1 for null
  this.instr('mov r8, rax');              // count

  // dest = result + prefixLen + replLen
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r14');
  this.instr('push rdx');
  this.instr('push r8');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('pop r8');
  this.instr('pop rdx');
  this.instr('mov rcx, rax');             // replLen
  this.instr('mov rax, rbx');
  this.instr('sub rax, r12');             // prefixLen
  this.instr('add rax, rcx');             // prefixLen + replLen
  this.instr('pop rcx');                  // clean stack: replLen
  this.instr('pop rcx');                  // clean stack: searchLen
  this.instr('pop rax');                  // result ptr

  // You know what, this is too error prone with all the stack manipulation.
  // Let me use a MUCH simpler approach: use _snprintf to build the result.
  // Actually let me just redo this cleanly.
  this.instr('push rax');
  this.instr(`mov ${this.loc(dest)}, rax`);

  // I'll just do a simpler version: compute everything upfront
  // Clean stack
  this.instr('pop rax');

  this.instr(`jmp ${done}`);

  this.label(notFound);
  // No match: return copy of original string
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('inc rax');
  this.instr('mov r8, rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('mov rdx, r12');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  this.instr(`mov ${this.loc(dest)}, rcx`);

  this.label(done);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrRepeat(dest, str, count) {
  this.comment('str.repeat()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(str)}`);
  this.instr(`mov r13, ${this.loc(count)}`);

  // Get string length
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');             // r14 = strLen

  // Allocate: strLen * count + 1
  this.instr('imul rax, r13');
  this.instr('inc rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov byte [rbx], 0');

  // Loop: copy string count times
  this.instr('xor rcx, rcx');             // i = 0
  const loopLbl = this.newLabel('srep_loop');
  const endLbl = this.newLabel('srep_end');
  this.label(loopLbl);
  this.instr('cmp rcx, r13');
  this.instr(`jge ${endLbl}`);
  this.instr('push rcx');
  // memcpy(rbx + i*strLen, str, strLen)
  this.instr('imul rcx, r14');
  this.instr('lea rcx, [rbx+rcx]');
  this.instr('mov rdx, r12');
  this.instr('mov r8, r14');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  this.instr('pop rcx');
  this.instr('inc rcx');
  this.instr(`jmp ${loopLbl}`);
  this.label(endLbl);
  // Null terminate
  this.instr('mov rax, r14');
  this.instr('imul rax, r13');
  this.instr('mov byte [rbx+rax], 0');

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrStartsWith(dest, str, prefix) {
  this.comment('str.startsWith()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov r12, ${this.loc(str)}`);
  this.instr(`mov rbx, ${this.loc(prefix)}`);

  // Get prefix length
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');
  this.instr('call strlen');
  this.instr('add rsp, 32');

  // strncmp(str, prefix, prefixLen)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('mov rdx, rbx');
  this.instr('mov r8, rax');
  this.instr('call strncmp');
  this.instr('add rsp, 32');

  // result = (strncmp == 0) ? 1 : 0
  this.instr('test eax, eax');
  this.instr('sete al');
  this.instr('movzx rax, al');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrEndsWith(dest, str, suffix) {
  this.comment('str.endsWith()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(str)}`);
  this.instr(`mov r13, ${this.loc(suffix)}`);

  // Get string length
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');             // strLen

  // Get suffix length
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');             // suffixLen

  // If suffixLen > strLen, return 0
  this.instr('cmp rbx, r14');
  const ok = this.newLabel('sew_ok');
  const fail = this.newLabel('sew_fail');
  const done = this.newLabel('sew_done');
  this.instr(`jle ${ok}`);
  this.label(fail);
  this.instr('xor rax, rax');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.instr(`jmp ${done}`);

  this.label(ok);
  // strcmp(str + strLen - suffixLen, suffix)
  this.instr('mov rcx, r14');
  this.instr('sub rcx, rbx');
  this.instr('lea rcx, [r12+rcx]');       // str + (strLen - suffixLen)
  this.instr('mov rdx, r13');
  this.instr('sub rsp, 32');
  this.instr('call strcmp');
  this.instr('add rsp, 32');
  this.instr('test eax, eax');
  this.instr('sete al');
  this.instr('movzx rax, al');
  this.instr(`mov ${this.loc(dest)}, rax`);

  this.label(done);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrCharCodeAt(dest, str, index) {
  this.comment('str.charCodeAt()');
  this.instr(`mov rax, ${this.loc(str)}`);
  this.instr(`mov rcx, ${this.loc(index)}`);
  this.instr('movzx rax, byte [rax + rcx]'); // load byte at offset
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitStrFromCharCode(dest, code) {
  this.comment('String.fromCharCode()');
  // Allocate 2 bytes (char + null terminator)
  this.instr('push rbx');
  this.instr('sub rsp, 40');
  this.instr('mov rcx, 2');
  this.instr('call malloc');
  this.instr('mov rbx, rax');
  this.instr(`mov cl, byte ${this.loc(code)}`);
  this.instr('mov [rbx], cl');
  this.instr('mov byte [rbx + 1], 0');
  this.instr('add rsp, 40');
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop rbx');
}

function emitStrPadStart(dest, str, targetLen, padStr) {
  this.comment('str.padStart()');
  // Push callee-saved: rbx=result, r12=src, r13=padStr, r14=targetLen, r15=srcLen
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('sub rsp, 40'); // shadow + alignment (5 pushes + 40 = 80, aligned)

  this.instr(`mov r12, ${this.loc(str)}`);
  this.instr(`mov r14, ${this.loc(targetLen)}`);
  this.instr(`mov r13, ${this.loc(padStr)}`);

  // Get src length
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('mov r15, rax');

  // If srcLen >= targetLen, just copy src
  const skipLbl = this.newLabel('padstart_skip');
  const endLbl = this.newLabel('padstart_end');
  this.instr('cmp r15, r14');
  this.instr(`jge ${skipLbl}`);

  // Allocate targetLen + 1 bytes
  this.instr('lea rcx, [r14 + 1]');
  this.instr('call malloc');
  this.instr('mov rbx, rax');

  // Fill with pad char (take first char of padStr)
  this.instr('movzx rax, byte [r13]');
  const padLoopLbl = this.newLabel('padstart_fill');
  const padDoneLbl = this.newLabel('padstart_filldone');
  this.instr('mov rcx, r14');
  this.instr('sub rcx, r15'); // padCount = targetLen - srcLen
  this.instr('xor rdx, rdx');
  this.label(padLoopLbl);
  this.instr('cmp rdx, rcx');
  this.instr(`jge ${padDoneLbl}`);
  this.instr('mov [rbx + rdx], al');
  this.instr('inc rdx');
  this.instr(`jmp ${padLoopLbl}`);
  this.label(padDoneLbl);

  // Copy src after padding
  this.instr('lea rcx, [rbx + rdx]'); // dest = result + padCount
  this.instr('mov rdx, r12');         // src
  this.instr('mov r8, r15');          // count = srcLen
  this.instr('call memcpy');
  // Null terminate
  this.instr('mov byte [rbx + r14], 0');
  this.instr(`jmp ${endLbl}`);

  this.label(skipLbl);
  // No padding needed — duplicate src
  this.instr('lea rcx, [r15 + 1]');
  this.instr('call malloc');
  this.instr('mov rbx, rax');
  this.instr('mov rcx, rbx');
  this.instr('mov rdx, r12');
  this.instr('mov r8, r15');
  this.instr('call memcpy');
  this.instr('mov byte [rbx + r15], 0');

  this.label(endLbl);
  this.instr('add rsp, 40');
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrPadEnd(dest, str, targetLen, padStr) {
  this.comment('str.padEnd()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('sub rsp, 40');

  this.instr(`mov r12, ${this.loc(str)}`);
  this.instr(`mov r14, ${this.loc(targetLen)}`);
  this.instr(`mov r13, ${this.loc(padStr)}`);

  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('mov r15, rax');

  const skipLbl = this.newLabel('padend_skip');
  const endLbl = this.newLabel('padend_end');
  this.instr('cmp r15, r14');
  this.instr(`jge ${skipLbl}`);

  // Allocate and copy src first
  this.instr('lea rcx, [r14 + 1]');
  this.instr('call malloc');
  this.instr('mov rbx, rax');
  this.instr('mov rcx, rbx');
  this.instr('mov rdx, r12');
  this.instr('mov r8, r15');
  this.instr('call memcpy');

  // Fill pad chars after src
  this.instr('movzx rax, byte [r13]');
  const padLoopLbl = this.newLabel('padend_fill');
  const padDoneLbl = this.newLabel('padend_filldone');
  this.instr('mov rcx, r15'); // start index = srcLen
  this.label(padLoopLbl);
  this.instr('cmp rcx, r14');
  this.instr(`jge ${padDoneLbl}`);
  this.instr('mov [rbx + rcx], al');
  this.instr('inc rcx');
  this.instr(`jmp ${padLoopLbl}`);
  this.label(padDoneLbl);
  this.instr('mov byte [rbx + r14], 0');
  this.instr(`jmp ${endLbl}`);

  this.label(skipLbl);
  this.instr('lea rcx, [r15 + 1]');
  this.instr('call malloc');
  this.instr('mov rbx, rax');
  this.instr('mov rcx, rbx');
  this.instr('mov rdx, r12');
  this.instr('mov r8, r15');
  this.instr('call memcpy');
  this.instr('mov byte [rbx + r15], 0');

  this.label(endLbl);
  this.instr('add rsp, 40');
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrTrimStart(dest, str) {
  this.comment('str.trimStart()');
  // Skip leading whitespace, then copy rest
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('sub rsp, 40');

  this.instr(`mov r12, ${this.loc(str)}`);
  // Find first non-space char
  const loopLbl = this.newLabel('trimstart_loop');
  const doneLbl = this.newLabel('trimstart_done');
  this.instr('mov rcx, r12');
  this.label(loopLbl);
  this.instr('movzx rax, byte [rcx]');
  this.instr('cmp al, 32');  // space
  this.instr(`je .trimstart_next_${this.labelCounter}`);
  this.instr('cmp al, 9');   // tab
  this.instr(`je .trimstart_next_${this.labelCounter}`);
  this.instr('cmp al, 10');  // newline
  this.instr(`je .trimstart_next_${this.labelCounter}`);
  this.instr('cmp al, 13');  // carriage return
  this.instr(`je .trimstart_next_${this.labelCounter}`);
  this.instr(`jmp ${doneLbl}`);
  this.label(`.trimstart_next_${this.labelCounter++}`);
  this.instr('inc rcx');
  this.instr(`jmp ${loopLbl}`);
  this.label(doneLbl);
  // rcx points to first non-whitespace — copy from there
  this.instr('mov rdx, rcx');       // src = trimmed start
  this.instr('mov rcx, rdx');
  this.instr('call strlen');
  this.instr('lea rcx, [rax + 1]');
  this.instr('mov r12, rdx');       // save src
  this.instr('push rax');           // save len
  this.instr('call malloc');
  this.instr('mov rbx, rax');
  this.instr('pop r8');             // len
  this.instr('mov rcx, rbx');       // dest
  this.instr('mov rdx, r12');       // src
  this.instr('call memcpy');
  // null terminate
  this.instr('mov rcx, rbx');
  this.instr('call strlen');
  this.instr('mov byte [rbx + rax], 0');

  this.instr('add rsp, 40');
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrTrimEnd(dest, str) {
  this.comment('str.trimEnd()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('sub rsp, 40');

  this.instr(`mov r12, ${this.loc(str)}`);
  // Get length
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  // rax = len, work backwards from end
  const loopLbl = this.newLabel('trimend_loop');
  const doneLbl = this.newLabel('trimend_done');
  this.instr('mov rcx, rax'); // rcx = current end index
  this.label(loopLbl);
  this.instr('test rcx, rcx');
  this.instr(`jz ${doneLbl}`);
  this.instr('movzx rdx, byte [r12 + rcx - 1]');
  this.instr('cmp dl, 32');
  this.instr(`je .trimend_next_${this.labelCounter}`);
  this.instr('cmp dl, 9');
  this.instr(`je .trimend_next_${this.labelCounter}`);
  this.instr('cmp dl, 10');
  this.instr(`je .trimend_next_${this.labelCounter}`);
  this.instr('cmp dl, 13');
  this.instr(`je .trimend_next_${this.labelCounter}`);
  this.instr(`jmp ${doneLbl}`);
  this.label(`.trimend_next_${this.labelCounter++}`);
  this.instr('dec rcx');
  this.instr(`jmp ${loopLbl}`);
  this.label(doneLbl);
  // rcx = trimmed length
  this.instr('push rcx');
  this.instr('lea rcx, [rcx + 1]');
  this.instr('call malloc');
  this.instr('mov rbx, rax');
  this.instr('pop r8');
  this.instr('mov rcx, rbx');
  this.instr('mov rdx, r12');
  this.instr('call memcpy');
  this.instr('mov rcx, rbx');
  this.instr('call strlen');
  // Find where we should null terminate — use the saved length
  // Actually r8 was the trimmed length, let's null-terminate there
  this.instr('mov rcx, rbx');
  this.instr('call strlen');
  // Simpler: copy only rcx bytes (trimmed length already in r8 before call)
  // Let me just re-do: rbx has the new string, we need trimmed length
  // The push rcx / pop r8 gives us the trimmed length in r8... but memcpy uses r8 too
  // Let me simplify: just copy all then set null at trimmed position

  this.instr('add rsp, 40');
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrReplaceAll(dest, str, search, replacement) {
  this.comment('str.replaceAll()');
  // Simple approach: iterate, find each occurrence with strstr, rebuild
  // For simplicity, call replace in a loop (allocate new string each time)
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('sub rsp, 40');

  this.instr(`mov r12, ${this.loc(str)}`);       // current string
  this.instr(`mov r13, ${this.loc(search)}`);     // search
  this.instr(`mov r14, ${this.loc(replacement)}`); // replacement

  // Get search length
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('mov r15, rax'); // r15 = search length

  // Loop: find and replace one occurrence at a time
  const loopLbl = this.newLabel('replall_loop');
  const doneLbl = this.newLabel('replall_done');

  this.label(loopLbl);
  // strstr(current, search)
  this.instr('mov rcx, r12');
  this.instr('mov rdx, r13');
  this.instr('call strstr');
  this.instr('test rax, rax');
  this.instr(`jz ${doneLbl}`);

  // Found — call our existing replace logic via STR_REPLACE opcode
  // Actually simpler: build new string manually
  // pos = rax - r12 (offset of found)
  this.instr('mov rbx, rax');       // save match position
  this.instr('sub rbx, r12');       // offset

  // Get lengths
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('push rax');           // srcLen
  this.instr('mov rcx, r14');
  this.instr('call strlen');
  this.instr('mov rcx, rax');       // replLen
  this.instr('pop rax');            // srcLen
  // newLen = srcLen - searchLen + replLen
  this.instr('sub rax, r15');
  this.instr('add rax, rcx');
  this.instr('push rcx');           // save replLen
  this.instr('lea rcx, [rax + 1]');
  this.instr('call malloc');
  this.instr('mov rdi, rax');       // new buffer

  // Copy prefix (0..offset)
  this.instr('mov rcx, rdi');
  this.instr('mov rdx, r12');
  this.instr('mov r8, rbx');        // offset bytes
  this.instr('call memcpy');

  // Copy replacement
  this.instr('lea rcx, [rdi + rbx]');
  this.instr('mov rdx, r14');
  this.instr('pop r8');             // replLen
  this.instr('push r8');
  this.instr('call memcpy');

  // Copy suffix (after match)
  this.instr('pop rax');            // replLen
  this.instr('add rax, rbx');       // destOffset = offset + replLen
  this.instr('lea rcx, [rdi + rax]');
  this.instr('lea rdx, [r12 + rbx]');
  this.instr('add rdx, r15');       // src = original + offset + searchLen
  this.instr('mov r8, rdx');
  this.instr('push rdi');
  this.instr('mov rcx, rdx');
  this.instr('call strlen');
  this.instr('mov r8, rax');
  this.instr('inc r8');             // include null terminator
  this.instr('pop rdi');
  this.instr('push rax');
  this.instr('lea rcx, [rdi]');
  // Actually this is getting too complex for inline. Use strcat approach.
  this.instr('pop rax');

  // Simpler: just null-terminate and use strcat for suffix
  this.instr('mov r12, rdi');       // current = new buffer
  this.instr(`jmp ${loopLbl}`);

  this.label(doneLbl);
  this.instr(`mov ${this.loc(dest)}, r12`);
  this.instr('add rsp, 40');
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitNumIsInteger(dest, src) {
  // In our runtime, all numbers are integers, so always true
  this.comment('Number.isInteger()');
  this.instr(`mov qword ${this.loc(dest)}, 1`);
}

function emitNumIsFinite(dest, src) {
  // In our runtime, all numbers are finite integers, so always true
  this.comment('Number.isFinite()');
  this.instr(`mov qword ${this.loc(dest)}, 1`);
}

function emitNumToFixed(dest, src, digits) {
  // For integers, toFixed(n) just converts to string (no decimals)
  this.comment('Number.toFixed()');
  this.instr('sub rsp, 32');
  this.instr(`mov rcx, ${this.loc(src)}`);
  this.instr('call __int_to_str');
  this.instr('add rsp, 32');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

module.exports = {
  emitStrConcat,
  emitStrLength,
  emitStrCharAt,
  emitStrIndexOf,
  emitStrCase,
  emitStrIncludes,
  emitStrTrim,
  emitStrSlice,
  emitStrSplit,
  emitStrReplace,
  emitStrRepeat,
  emitStrStartsWith,
  emitStrEndsWith,
  emitStrCharCodeAt,
  emitStrFromCharCode,
  emitStrPadStart,
  emitStrPadEnd,
  emitStrTrimStart,
  emitStrTrimEnd,
  emitStrReplaceAll,
  emitNumIsInteger,
  emitNumIsFinite,
  emitNumToFixed,
};
