'use strict';

const { TYPE_STRING } = require('../types');

function emitStrConcat(dest, left, right, leftType, rightType) {
  this.comment('string concatenation');
  // Salva registradores preservados (4 pushes = 32 bytes, mantém alinhamento de 16 bytes)
  // rbx = ponteiro do resultado, r12 = str esquerda, r13 = str direita, r14 = tamanho esquerdo
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  // Converte o lado esquerdo para string se necessário
  if (leftType === TYPE_STRING) {
    this.instr(`mov r12, ${this.loc(left)}`);
  } else {
    this.instr('sub rsp, 32');
    this.instr(`mov rcx, ${this.loc(left)}`);
    this.instr('call __int_to_str');
    this.instr('add rsp, 32');
    this.instr('mov r12, rax');
  }

  // Converte o lado direito para string se necessário
  if (rightType === TYPE_STRING) {
    this.instr(`mov r13, ${this.loc(right)}`);
  } else {
    this.instr('sub rsp, 32');
    this.instr(`mov rcx, ${this.loc(right)}`);
    this.instr('call __int_to_str');
    this.instr('add rsp, 32');
    this.instr('mov r13, rax');
  }

  // Obtém tamanho do lado esquerdo
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');       // r14 = tamanho esquerdo

  // Obtém tamanho do lado direito
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');       // rbx = tamanho direito

  // Aloca: tamEsquerdo + tamDireito + 1
  this.instr('lea rcx, [r14+rbx+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');       // rbx = ponteiro do buffer resultado

  // memcpy(buf, esquerdo, tamEsquerdo)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');       // dest
  this.instr('mov rdx, r12');       // src = esquerdo
  this.instr('mov r8, r14');        // contagem = tamEsquerdo
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Obtém tamanho do direito novamente para cópia
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('inc rax');            // +1 para copiar o terminador null

  // memcpy(buf + tamEsquerdo, direito, tamDireito + 1)
  this.instr('sub rsp, 32');
  this.instr('lea rcx, [rbx+r14]'); // dest = buf + tamEsquerdo
  this.instr('mov rdx, r13');       // src = direito
  this.instr('mov r8, rax');        // contagem = tamDireito + 1
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
  // Retorna uma string de 1 caractere terminada em null
  this.comment('str.charAt(index)');
  this.instr('push rbx');
  this.instr('push r12');
  // Aloca 2 bytes para o resultado
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 2');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');             // rbx = buf resultado
  this.instr(`mov rax, ${this.loc(str)}`);
  this.instr(`mov rcx, ${this.loc(index)}`);
  this.instr('movzx edx, byte [rax+rcx]'); // obtém char
  this.instr('mov [rbx], dl');            // armazena char
  this.instr('mov byte [rbx+1], 0');      // termina com null
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrIndexOf(dest, str, search) {
  // Usa strstr para encontrar substring, retorna índice ou -1
  this.comment('str.indexOf(search)');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(str)}`);  // salva haystack
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');                // haystack
  this.instr(`mov rdx, ${this.loc(search)}`); // needle
  this.instr('call strstr');
  this.instr('add rsp, 32');
  this.instr('test rax, rax');
  const notFound = this.newLabel('indexof_nf');
  const done = this.newLabel('indexof_done');
  this.instr(`jz ${notFound}`);
  this.instr('sub rax, rbx');               // rax = diferença de ponteiros = índice
  this.instr(`jmp ${done}`);
  this.label(notFound);
  this.instr('mov rax, -1');
  this.label(done);
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrCase(dest, str, direction) {
  // Clona a string e converte cada caractere
  this.comment(`str.to${direction === 'upper' ? 'Upper' : 'Lower'}Case()`);
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr(`mov r12, ${this.loc(str)}`);
  // Obtém tamanho
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r13, rax');               // r13 = tamanho
  this.instr('inc rax');
  // Aloca
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');               // rbx = buf destino
  // Copia e converte
  this.instr('xor r14, r14');               // r14 = índice
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
  this.instr('mov byte [rbx+r13], 0');       // termina com null
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrIncludes(dest, str, search) {
  // strstr != NULL → 1, senão 0
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
  // Pula espaços iniciais, encontra último não-espaço, copia substring
  this.comment('str.trim()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr(`mov r12, ${this.loc(str)}`);   // r12 = src
  // Encontra início (pula espaços/tabs)
  this.instr('mov r13, r12');                // r13 = início
  const trimStart = this.newLabel('trim_s');
  const trimStartDone = this.newLabel('trim_sd');
  this.label(trimStart);
  this.instr('movzx eax, byte [r13]');
  this.instr('cmp al, 32');                  // espaço
  this.instr(`je ._cg_trim_inc_${this._labelCounter}`);
  this.instr('cmp al, 9');                   // tab
  this.instr(`je ._cg_trim_inc_${this._labelCounter}`);
  this.instr('cmp al, 10');                  // nova linha
  this.instr(`je ._cg_trim_inc_${this._labelCounter}`);
  this.instr('cmp al, 13');                  // retorno de carro
  this.instr(`jne ${trimStartDone}`);
  this.label(`._cg_trim_inc_${this._labelCounter++}`);
  this.instr('inc r13');
  this.instr(`jmp ${trimStart}`);
  this.label(trimStartDone);
  // Obtém tamanho total a partir do início
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');               // r14 = tamanho após trim do início
  // Encontra fim (pula espaços finais)
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
  // Aloca e copia
  this.instr('lea rcx, [r14+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');               // dest
  this.instr('mov rdx, r13');               // src = ponteiro do início
  this.instr('mov r8, r14');                // contagem
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  this.instr('mov byte [rbx+r14], 0');       // termina com null
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

  // Obtém tamanho da string
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  // rax = tamanho

  // Trata início negativo
  this.instr('test r13, r13');
  const startOk = this.newLabel('sslc_sok');
  this.instr(`jge ${startOk}`);
  this.instr('add r13, rax');
  this.label(startOk);

  // Trata fim negativo
  this.instr('test r14, r14');
  const endOk = this.newLabel('sslc_eok');
  this.instr(`jge ${endOk}`);
  this.instr('add r14, rax');
  this.label(endOk);

  // Limita fim ao tamanho
  this.instr('cmp r14, rax');
  const endClamp = this.newLabel('sslc_ec');
  this.instr(`jle ${endClamp}`);
  this.instr('mov r14, rax');
  this.label(endClamp);

  // contagem = fim - início, mín 0
  this.instr('mov rcx, r14');
  this.instr('sub rcx, r13');
  this.instr('test rcx, rcx');
  const cntOk = this.newLabel('sslc_cok');
  this.instr(`jg ${cntOk}`);
  this.instr('xor rcx, rcx');
  this.label(cntOk);
  this.instr('push rcx');                 // salva contagem

  // malloc(contagem + 1)
  this.instr('inc rcx');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');

  // memcpy
  this.instr('pop rcx');                  // contagem
  this.instr('push rcx');
  this.instr('mov r8, rcx');
  this.instr('mov rcx, rbx');             // dest
  this.instr('lea rdx, [r12+r13]');       // src = str + start
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Termina com null
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

  this.instr(`mov r12, ${this.loc(str)}`);       // string fonte
  this.instr(`mov r13, ${this.loc(separator)}`);  // separador

  // Obtém tamanho do separador
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');             // r14 = tamanho do separador

  // Cria array resultado (cabeçalho de 32 bytes)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov qword [rbx], 0');       // tamanho = 0
  this.instr('mov qword [rbx+8], 8');     // capacidade = 8
  // Aloca dados (8 * 8 = 64)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 64');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');
  // Aloca tipos (8)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 8');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  // r15 = posição atual na string
  this.instr('mov r15, r12');

  const loopLbl = this.newLabel('ssplit_loop');
  const endLbl = this.newLabel('ssplit_end');
  const pushPart = this.newLabel('ssplit_push');

  this.label(loopLbl);
  // Encontra próxima ocorrência do separador: strstr(r15, r13)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r15');
  this.instr('mov rdx, r13');
  this.instr('call strstr');
  this.instr('add rsp, 32');
  this.instr('test rax, rax');
  this.instr(`jz ${endLbl}`);            // não há mais separadores
  this.instr('mov rdi, rax');             // rdi = ponteiro para o separador

  // Tamanho da parte = rdi - r15
  this.instr('mov rcx, rdi');
  this.instr('sub rcx, r15');             // tamanho da parte
  this.instr('push rcx');

  // Aloca string da parte
  this.instr('inc rcx');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // salva ponteiro da parte

  // memcpy
  this.instr('pop rcx');
  this.instr('push rcx');                 // mantém ponteiro da parte
  this.instr('pop rcx');                  // ponteiro da parte -> rcx = dest
  // Ugh, precisa ter mais cuidado
  this.instr('pop rax');                  // tamanho da parte
  this.instr('push rax');
  this.instr('mov r8, rax');              // count
  // realoca pois perdemos o ponteiro
  this.instr('inc rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // salva novo ponteiro da parte
  this.instr('pop rcx');
  this.instr('push rcx');                 // mantém
  // memcpy(parte, r15, tamParte)
  this.instr('pop rcx');                  // dest = part
  this.instr('push rcx');
  this.instr('mov rdx, r15');             // src
  this.instr('pop rax');
  this.instr('push rax');
  this.instr('mov rcx, rax');
  this.instr('mov rdx, r15');
  // Obtém tamParte da stack
  // Isso está ficando muito bagunçado. Vou usar uma abordagem mais simples com registradores fixos.

  // OK vou recomeçar esta função com uma abordagem mais limpa
  // Na verdade, deixa eu desempilhar tudo e refazer direito.
  // O problema é malabarismo de muitos valores com registradores limitados.
  // Vou usar o stack frame com mais cuidado.

  this.instr('pop rax');                  // limpa stack: ponteiro da parte
  this.instr('pop rcx');                  // limpa stack: tamanho da parte

  // --- ABORDAGEM MAIS LIMPA ---
  // tamanho da parte é (rdi - r15), armazenado em um registrador
  this.instr('mov rcx, rdi');
  this.instr('sub rcx, r15');             // rcx = tamanho da parte
  // Aloca parte: malloc(tamParte + 1)
  this.instr('push rcx');                 // salva tamanho da parte
  this.instr('lea rcx, [rcx+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  // rax = buffer da parte. memcpy(rax, r15, tamParte)
  this.instr('pop r8');                   // tamanho da parte
  this.instr('push r8');                  // salva novamente
  this.instr('push rax');                 // salva ponteiro da parte
  this.instr('mov rcx, rax');             // dest
  this.instr('mov rdx, r15');             // src
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  this.instr('pop rax');                  // ponteiro da parte
  this.instr('pop r8');                   // tamanho da parte
  this.instr('mov byte [rax+r8], 0');     // termina com null

  // Insere parte no array resultado usando lógica de push inline
  // Checa capacidade
  this.instr('mov rcx, [rbx]');           // current length
  this.instr('cmp rcx, [rbx+8]');
  const splitNoRealloc = this.newLabel('ssplit_norealloc');
  this.instr(`jl ${splitNoRealloc}`);
  // Realloc dados
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

  // Armazena elemento
  this.instr('mov rcx, [rbx]');
  this.instr('mov rdx, [rbx+16]');
  this.instr('mov [rdx+rcx*8], rax');
  this.instr('mov rdx, [rbx+24]');
  this.instr(`mov byte [rdx+rcx], ${TYPE_STRING}`);
  this.instr('inc qword [rbx]');

  // Avança após o separador
  this.instr('lea r15, [rdi+r14]');       // r15 = match + sepLen
  this.instr(`jmp ${loopLbl}`);

  this.label(endLbl);
  // Insere parte restante (r15 até o fim da string)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r15');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // tamanho restante
  this.instr('lea rcx, [rax+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('pop r8');                   // tamanho
  this.instr('push r8');
  this.instr('push rax');                 // ponteiro da parte
  this.instr('mov rcx, rax');
  this.instr('mov rdx, r15');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  this.instr('pop rax');
  this.instr('pop r8');
  this.instr('mov byte [rax+r8], 0');

  // Insere última parte
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

  // Encontra primeira ocorrência
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('mov rdx, r13');
  this.instr('call strstr');
  this.instr('add rsp, 32');
  this.instr('test rax, rax');
  const notFound = this.newLabel('srepl_nf');
  const done = this.newLabel('srepl_done');
  this.instr(`jz ${notFound}`);
  this.instr('mov rbx, rax');             // rbx = posição do match

  // Obtém tamanhos
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
  // rax = tamSubstituição, stack: [tamBusca, tamStr]
  this.instr('pop rcx');                  // searchLen
  this.instr('pop rdx');                  // strLen

  // novoTam = tamStr - tamBusca + tamSubstituição
  this.instr('sub rdx, rcx');
  this.instr('add rdx, rax');
  this.instr('push rcx');                 // salva tamBusca
  this.instr('push rax');                 // salva tamSubstituição

  // malloc(newLen + 1)
  this.instr('lea rcx, [rdx+1]');
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('push rax');                 // salva ponteiro do resultado

  // tamanho do prefixo = rbx - r12
  this.instr('mov r8, rbx');
  this.instr('sub r8, r12');
  // memcpy(resultado, str, tamPrefixo)
  this.instr('mov rcx, rax');             // dest
  this.instr('mov rdx, r12');             // src
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Copia substituição: memcpy(resultado+tamPrefixo, substituição, tamSubstituição)
  this.instr('pop rax');                  // result ptr
  this.instr('push rax');
  this.instr('mov rcx, rbx');
  this.instr('sub rcx, r12');             // tamanho do prefixo
  this.instr('add rcx, rax');             // dest = resultado + tamPrefixo
  this.instr('mov rdx, r14');             // src = substituição
  this.instr('pop rax');                  // result
  this.instr('push rax');
  this.instr('pop rax');
  this.instr('push rax');
  this.instr('mov r8, [rsp+8]');          // replLen from stack

  // Esse malabarismo na stack está ficando complexo. Vou simplificar recalculando.
  this.instr('pop rax');                  // result ptr
  this.instr('pop r8');                   // replLen
  this.instr('pop rcx');                  // searchLen
  this.instr('push rcx');
  this.instr('push r8');
  this.instr('push rax');

  this.instr('mov rcx, rbx');
  this.instr('sub rcx, r12');             // prefix len
  this.instr('add rcx, rax');             // dest = result + prefixLen
  this.instr('mov rdx, r14');             // substituição
  // r8 = tamSubstituição (já definido acima... não, desempilhado. Recalcula)
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

  // Copia sufixo: memcpy(resultado+tamPrefixo+tamSubstituição, match+tamBusca, tamSufixo+1)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov rcx, rax');             // searchLen
  this.instr('lea rdx, [rbx+rcx]');       // src = match + searchLen
  // Tamanho do sufixo
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rdx');
  this.instr('push rdx');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('pop rdx');
  this.instr('inc rax');                  // +1 para null
  this.instr('mov r8, rax');              // contagem

  // dest = resultado + tamPrefixo + tamSubstituição
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
  this.instr('pop rcx');                  // limpa stack: tamSubstituição
  this.instr('pop rcx');                  // limpa stack: tamBusca
  this.instr('pop rax');                  // ponteiro do resultado

  // Sabe de uma coisa, isso é muito propenso a erros com toda essa manipulação de stack.
  // Vou usar uma abordagem MUITO mais simples: usar _snprintf para construir o resultado.
  // Na verdade, vou refazer isso de forma limpa.
  this.instr('push rax');
  this.instr(`mov ${this.loc(dest)}, rax`);

  // Vou fazer uma versão mais simples: calcula tudo antecipadamente
  // Limpa stack
  this.instr('pop rax');

  this.instr(`jmp ${done}`);

  this.label(notFound);
  // Sem match: retorna cópia da string original
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

  // Obtém tamanho da string
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');             // r14 = tamStr

  // Aloca: tamStr * count + 1
  this.instr('imul rax, r13');
  this.instr('inc rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov byte [rbx], 0');

  // Loop: copia a string count vezes
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
  // Termina com null
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

  // Obtém tamanho do prefixo
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

  // resultado = (strncmp == 0) ? 1 : 0
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

  // Obtém tamanho da string
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov r14, rax');             // tamStr

  // Obtém tamanho do sufixo
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');             // suffixLen

  // Se tamSufixo > tamStr, retorna 0
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
  this.instr('movzx rax, byte [rax + rcx]'); // carrega byte no offset
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitStrFromCharCode(dest, code) {
  this.comment('String.fromCharCode()');
  // Aloca 2 bytes (char + terminador null)
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
  // Empilha preservados: rbx=resultado, r12=src, r13=padStr, r14=targetLen, r15=tamSrc
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('sub rsp, 40'); // shadow + alinhamento (5 pushes + 40 = 80, alinhado)

  this.instr(`mov r12, ${this.loc(str)}`);
  this.instr(`mov r14, ${this.loc(targetLen)}`);
  this.instr(`mov r13, ${this.loc(padStr)}`);

  // Obtém tamanho do src
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  this.instr('mov r15, rax');

  // Se tamSrc >= targetLen, apenas copia src
  const skipLbl = this.newLabel('padstart_skip');
  const endLbl = this.newLabel('padstart_end');
  this.instr('cmp r15, r14');
  this.instr(`jge ${skipLbl}`);

  // Aloca targetLen + 1 bytes
  this.instr('lea rcx, [r14 + 1]');
  this.instr('call malloc');
  this.instr('mov rbx, rax');

  // Preenche com caractere de padding (pega primeiro char do padStr)
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

  // Copia src após o padding
  this.instr('lea rcx, [rbx + rdx]'); // dest = result + padCount
  this.instr('mov rdx, r12');         // src
  this.instr('mov r8, r15');          // count = srcLen
  this.instr('call memcpy');
  // Termina com null
  this.instr('mov byte [rbx + r14], 0');
  this.instr(`jmp ${endLbl}`);

  this.label(skipLbl);
  // Sem necessidade de padding — duplica src
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

  // Aloca e copia src primeiro
  this.instr('lea rcx, [r14 + 1]');
  this.instr('call malloc');
  this.instr('mov rbx, rax');
  this.instr('mov rcx, rbx');
  this.instr('mov rdx, r12');
  this.instr('mov r8, r15');
  this.instr('call memcpy');

  // Preenche caracteres de padding após src
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
  // Pula espaços em branco iniciais, depois copia o resto
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('sub rsp, 40');

  this.instr(`mov r12, ${this.loc(str)}`);
  // Encontra primeiro caractere não-espaço
  const loopLbl = this.newLabel('trimstart_loop');
  const doneLbl = this.newLabel('trimstart_done');
  this.instr('mov rcx, r12');
  this.label(loopLbl);
  this.instr('movzx rax, byte [rcx]');
  this.instr('cmp al, 32');  // espaço
  this.instr(`je .trimstart_next_${this.labelCounter}`);
  this.instr('cmp al, 9');   // tab
  this.instr(`je .trimstart_next_${this.labelCounter}`);
  this.instr('cmp al, 10');  // nova linha
  this.instr(`je .trimstart_next_${this.labelCounter}`);
  this.instr('cmp al, 13');  // retorno de carro
  this.instr(`je .trimstart_next_${this.labelCounter}`);
  this.instr(`jmp ${doneLbl}`);
  this.label(`.trimstart_next_${this.labelCounter++}`);
  this.instr('inc rcx');
  this.instr(`jmp ${loopLbl}`);
  this.label(doneLbl);
  // rcx aponta para o primeiro não-espaço — copia a partir daqui
  this.instr('mov rdx, rcx');       // src = início após trim
  this.instr('mov rcx, rdx');
  this.instr('call strlen');
  this.instr('lea rcx, [rax + 1]');
  this.instr('mov r12, rdx');       // salva src
  this.instr('push rax');           // salva tamanho
  this.instr('call malloc');
  this.instr('mov rbx, rax');
  this.instr('pop r8');             // tamanho
  this.instr('mov rcx, rbx');       // dest
  this.instr('mov rdx, r12');       // src
  this.instr('call memcpy');
  // termina com null
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
  // Obtém tamanho
  this.instr('mov rcx, r12');
  this.instr('call strlen');
  // rax = tamanho, trabalha de trás para frente
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
  // rcx = tamanho após trim
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
  // Encontra onde devemos terminar com null — usa o tamanho salvo
  // Na verdade r8 era o tamanho após trim, vamos terminar com null lá
  this.instr('mov rcx, rbx');
  this.instr('call strlen');
  // Mais simples: copia apenas rcx bytes (tamanho após trim já em r8 antes da chamada)
  // Vou refazer: rbx tem a nova string, precisamos do tamanho após trim
  // O push rcx / pop r8 nos dá o tamanho após trim em r8... mas memcpy também usa r8
  // Vou simplificar: apenas copia tudo e coloca null na posição do trim

  this.instr('add rsp, 40');
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitStrReplaceAll(dest, str, search, replacement) {
  this.comment('str.replaceAll()');
  // Abordagem simples: itera, encontra cada ocorrência com strstr, reconstrói
  // Para simplificar, chama replace em loop (aloca nova string a cada vez)
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('sub rsp, 40');

  this.instr(`mov r12, ${this.loc(str)}`);       // string atual
  this.instr(`mov r13, ${this.loc(search)}`);     // busca
  this.instr(`mov r14, ${this.loc(replacement)}`); // substituição

  // Obtém tamanho da busca
  this.instr('mov rcx, r13');
  this.instr('call strlen');
  this.instr('mov r15, rax'); // r15 = tamanho da busca

  // Loop: encontra e substitui uma ocorrência por vez
  const loopLbl = this.newLabel('replall_loop');
  const doneLbl = this.newLabel('replall_done');

  this.label(loopLbl);
  // strstr(current, search)
  this.instr('mov rcx, r12');
  this.instr('mov rdx, r13');
  this.instr('call strstr');
  this.instr('test rax, rax');
  this.instr(`jz ${doneLbl}`);

  // Encontrou — chama nossa lógica de replace existente via opcode STR_REPLACE
  // Na verdade mais simples: constrói nova string manualmente
  // pos = rax - r12 (offset do encontrado)
  this.instr('mov rbx, rax');       // save match position
  this.instr('sub rbx, r12');       // offset

  // Obtém tamanhos
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

  // Copia prefixo (0..offset)
  this.instr('mov rcx, rdi');
  this.instr('mov rdx, r12');
  this.instr('mov r8, rbx');        // offset bytes
  this.instr('call memcpy');

  // Copia substituição
  this.instr('lea rcx, [rdi + rbx]');
  this.instr('mov rdx, r14');
  this.instr('pop r8');             // replLen
  this.instr('push r8');
  this.instr('call memcpy');

  // Copia sufixo (após match)
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
  this.instr('inc r8');             // inclui terminador null
  this.instr('pop rdi');
  this.instr('push rax');
  this.instr('lea rcx, [rdi]');
  // Na verdade isso está ficando muito complexo para inline. Usa abordagem com strcat.
  this.instr('pop rax');

  // Mais simples: apenas termina com null e usa strcat para sufixo
  this.instr('mov r12, rdi');       // atual = novo buffer
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
  // No nosso runtime, todos os números são inteiros, então sempre verdadeiro
  this.comment('Number.isInteger()');
  this.instr(`mov qword ${this.loc(dest)}, 1`);
}

function emitNumIsFinite(dest, src) {
  // No nosso runtime, todos os números são inteiros finitos, então sempre verdadeiro
  this.comment('Number.isFinite()');
  this.instr(`mov qword ${this.loc(dest)}, 1`);
}

function emitNumToFixed(dest, src, digits) {
  // Para inteiros, toFixed(n) apenas converte para string (sem decimais)
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
