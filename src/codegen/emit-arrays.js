'use strict';

const { TYPE_INT, TYPE_STRING } = require('../types');

function emitArrayNew(dest, elements) {
  // Struct do array: [tamanho (8)][capacidade (8)][ponteiro de dados (8)][ponteiro de tipos (8)]
  // = 32 bytes de cabeçalho (types_ptr armazena IDs de tipo por elemento)
  const count = elements.length;
  const capacity = Math.max(count, 8);

  // Aloca cabeçalho (32 bytes)
  this.instr('push rbx');    // salva registrador preservado
  this.instr('push r12');   // padding para alinhamento de 16 bytes
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax'); // ponteiro do cabeçalho

  // Define o tamanho
  this.instr(`mov qword [rbx], ${count}`);
  // Define a capacidade
  this.instr(`mov qword [rbx+8], ${capacity}`);

  // Aloca dados (capacidade * 8 bytes)
  this.instr('sub rsp, 32');
  this.instr(`mov rcx, ${capacity * 8}`);
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax'); // ponteiro de dados

  // Armazena elementos
  for (let i = 0; i < elements.length; i++) {
    this.instr(`mov rcx, ${this.loc(elements[i].temp)}`);
    this.instr(`mov [rax+${i * 8}], rcx`);
  }

  // Aloca array de tipos (capacidade bytes)
  this.instr('sub rsp, 32');
  this.instr(`mov rcx, ${capacity}`);
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax'); // ponteiro de tipos

  // Armazena bytes de tipo
  for (let i = 0; i < elements.length; i++) {
    const typeId = elements[i].type || TYPE_INT;
    this.instr(`mov byte [rax+${i}], ${typeId}`);
  }

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayGet(dest, array, index) {
  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr('mov rax, [rax+16]'); // ponteiro de dados
  this.instr(`mov rcx, ${this.loc(index)}`);
  this.instr('mov rax, [rax+rcx*8]');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitArraySet(array, index, value) {
  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr('mov rax, [rax+16]'); // ponteiro de dados
  this.instr(`mov rcx, ${this.loc(index)}`);
  this.instr(`mov rdx, ${this.loc(value)}`);
  this.instr('mov [rax+rcx*8], rdx');
}

function emitArrayPush(array, value, type) {
  // arr.data[arr.length] = value; arr.length++
  // Com expansão de capacidade: se tamanho == capacidade, realloc para 2x
  const typeId = type || TYPE_INT;
  const skipRealloc = this.newLabel('arr_push_ok');

  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);  // rbx = ponteiro do cabeçalho
  this.instr('mov rcx, [rbx]');               // rcx = tamanho
  this.instr('mov rdx, [rbx+8]');             // rdx = capacidade
  this.instr('cmp rcx, rdx');
  this.instr(`jl ${skipRealloc}`);

  // Expande: nova capacidade = antiga * 2
  this.instr('shl rdx, 1');                   // rdx = capacidade * 2
  this.instr('mov [rbx+8], rdx');             // atualiza capacidade
  this.instr('mov r12, rdx');                 // salva nova capacidade

  // malloc(novaCapacidade * 8)
  this.instr('shl rdx, 3');                   // rdx = novaCapacidade * 8
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rdx');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov r12, rax');                 // r12 = ponteiro do novo buf (salva)

  // memcpy(novoBuf, bufAntigo, tamanho * 8)
  this.instr('mov r8, [rbx]');                // tamanho
  this.instr('shl r8, 3');                    // tamanho * 8
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');                 // dest = novo buf
  this.instr('mov rdx, [rbx+16]');            // src = buf antigo
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Libera buffer de dados antigo
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+16]');
  this.instr('call free');
  this.instr('add rsp, 32');

  // Atualiza ponteiro de dados (usa r12 salvo, não rax que free corrompeu)
  this.instr('mov [rbx+16], r12');

  // Realloc do array de tipos
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+24]');            // ponteiro de tipos antigo
  this.instr('mov rdx, [rbx+8]');             // nova capacidade
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');            // atualiza ponteiro de tipos

  this.label(skipRealloc);
  // Agora faz o push
  this.instr('mov rcx, [rbx]');               // tamanho (= índice do novo elem)
  this.instr('mov rdx, [rbx+16]');            // ponteiro de dados
  this.instr(`mov r8, ${this.loc(value)}`);
  this.instr('mov [rdx+rcx*8], r8');
  // Armazena byte de tipo
  this.instr('mov rdx, [rbx+24]');            // ponteiro de tipos
  this.instr(`mov byte [rdx+rcx], ${typeId}`);
  this.instr('inc qword [rbx]');              // length++

  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayLength(dest, array) {
  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr('mov rax, [rax]'); // campo de tamanho
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitTemplate(dest, parts) {
  if (parts.length === 0) {
    this.emitLoadString(dest, '""');
    return;
  }

  if (parts.length === 1) {
    if (parts[0].type === TYPE_STRING) {
      this.instr(`mov rax, ${this.loc(parts[0].temp)}`);
      this.instr(`mov ${this.loc(dest)}, rax`);
    } else {
      this.instr('sub rsp, 32');
      this.instr(`mov rcx, ${this.loc(parts[0].temp)}`);
      this.instr('call __int_to_str');
      this.instr('add rsp, 32');
      this.instr(`mov ${this.loc(dest)}, rax`);
    }
    return;
  }

  // Para múltiplas partes: constrói string por concatenação
  // Começa com a primeira parte
  let currentTemp;
  if (parts[0].type === TYPE_STRING) {
    currentTemp = parts[0].temp;
  } else {
    // Converte para string
    currentTemp = dest; // reutiliza dest temporariamente
    this.instr('sub rsp, 32');
    this.instr(`mov rcx, ${this.loc(parts[0].temp)}`);
    this.instr('call __int_to_str');
    this.instr('add rsp, 32');
    this.instr(`mov ${this.loc(currentTemp)}, rax`);
  }

  // Concatena as partes restantes
  for (let i = 1; i < parts.length; i++) {
    const rightType = parts[i].type;
    this.emitStrConcat(dest, currentTemp, parts[i].temp,
      TYPE_STRING, rightType);
    currentTemp = dest;
  }
}

function emitArraySpread(destArray, srcArray) {
  // Copia todos os elementos de srcArray para destArray usando lógica de ARRAY_PUSH
  // Loop: for i = 0; i < src.length; i++ { dest.push(src[i]) }
  this.comment('array spread');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov rbx, ${this.loc(destArray)}`);   // rbx = cabeçalho dest
  this.instr(`mov r12, ${this.loc(srcArray)}`);     // r12 = cabeçalho src
  this.instr('mov r13, [r12]');                     // r13 = src.length
  this.instr('xor r14, r14');                       // r14 = i = 0

  const loopLabel = this.newLabel('arrspread_loop');
  const endLabel = this.newLabel('arrspread_end');

  this.label(loopLabel);
  this.instr('cmp r14, r13');
  this.instr(`jge ${endLabel}`);

  // Obtém src[i]
  this.instr('mov rax, [r12+16]');                  // ponteiro de dados src
  this.instr('mov rcx, [rax+r14*8]');               // valor de src[i]
  // Obtém tipo de src[i]
  this.instr('mov rax, [r12+24]');                  // ponteiro de tipos src
  this.instr('movzx edx, byte [rax+r14]');          // tipo de src[i]

  // Insere no dest: checa capacidade primeiro
  this.instr('mov rax, [rbx]');                     // dest.length
  this.instr('cmp rax, [rbx+8]');                   // compara com capacidade
  const skipRealloc = this.newLabel('arrspread_ok');
  this.instr(`jl ${skipRealloc}`);

  // Precisa expandir - salva rcx, rdx (valor/tipo)
  this.instr('push rcx');
  this.instr('push rdx');
  // Dobra a capacidade
  this.instr('mov rax, [rbx+8]');
  this.instr('shl rax, 1');
  this.instr('mov [rbx+8], rax');
  // malloc novos dados
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('push rax');  // salva novo buf
  // memcpy
  this.instr('mov r8, [rbx]');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('mov rdx, [rbx+16]');
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  // libera antigo
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+16]');
  this.instr('call free');
  this.instr('add rsp, 32');
  this.instr('pop rax');
  this.instr('mov [rbx+16], rax');
  // realloc tipos
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+24]');
  this.instr('mov rdx, [rbx+8]');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');
  this.instr('pop rdx');
  this.instr('pop rcx');

  this.label(skipRealloc);
  // Armazena valor
  this.instr('mov rax, [rbx]');                     // dest.length
  this.instr('mov r8, [rbx+16]');                   // ponteiro de dados dest
  this.instr('mov [r8+rax*8], rcx');                // data[length] = valor
  this.instr('mov r8, [rbx+24]');                   // ponteiro de tipos dest
  this.instr('mov byte [r8+rax], dl');              // types[length] = tipo
  this.instr('inc qword [rbx]');                    // dest.length++

  this.instr('inc r14');
  this.instr(`jmp ${loopLabel}`);

  this.label(endLabel);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitCallSpread(dest, funcName, normalArgs, spreadArray) {
  // Abordagem simples: itera o array spread e constrói uma lista plana de argumentos
  // Por enquanto, suporta spread apenas como último argumento
  this.comment(`call ${funcName} with spread`);

  // Empilha registradores preservados
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('push rdi');  // 6 pushes = alinhado

  // Carrega informações do array spread
  this.instr(`mov rbx, ${this.loc(spreadArray)}`);  // cabeçalho do array
  this.instr('mov r12, [rbx]');                      // tamanho do spread
  this.instr('mov r13, [rbx+16]');                   // ponteiro de dados do spread

  // Total de args = normalArgs.length + tamanho do spread
  const normalCount = normalArgs.length;
  this.instr(`mov r14, ${normalCount}`);
  this.instr('add r14, r12');                        // r14 = total de args

  // Calcula espaço extra na stack necessário para args > 4
  // Precisamos empilhar args do spread na stack (da direita para esquerda)
  // Primeiro, empilha todos os args do spread da direita para esquerda, depois args normais > 4 da direita para esquerda
  // Então carrega os primeiros 4 nos registradores

  // Calcula quantos args extras na stack: max(0, totalArgs - 4)
  this.instr('mov r15, r14');
  this.instr('sub r15, 4');
  this.instr('xor rdi, rdi');
  this.instr('cmp r15, 0');
  const noExtraLabel = this.newLabel('callspread_noextra');
  this.instr(`jle ${noExtraLabel}`);
  // Alinha stack: se número ímpar de args extras, adiciona padding
  this.instr('test r15, 1');
  const alignedLabel = this.newLabel('callspread_aligned');
  this.instr(`jz ${alignedLabel}`);
  this.instr('sub rsp, 8');
  this.instr('add rdi, 8');
  this.label(alignedLabel);

  // Empilha args do spread em reverso (aqueles que vão na stack, i.e., índice >= 4 - normalCount)
  // Na verdade vamos simplificar: empilha TODOS os args do spread da direita para esquerda, depois empilha args normais > 4
  // Depois carregamos os primeiros 4 do que empilhamos. Não — isso é complexo.
  // Mais simples: empilha spread da direita para esquerda
  this.instr('mov rcx, r12');
  this.instr('dec rcx');
  const pushSpreadLoop = this.newLabel('callspread_pushloop');
  const pushSpreadDone = this.newLabel('callspread_pushdone');
  this.label(pushSpreadLoop);
  this.instr('cmp rcx, 0');
  this.instr(`jl ${pushSpreadDone}`);
  // Só empilha se este índice de arg (normalCount + rcx) >= 4
  this.instr('mov rax, rcx');
  this.instr(`add rax, ${normalCount}`);
  this.instr('cmp rax, 4');
  const skipPushLabel = this.newLabel('callspread_skippush');
  this.instr(`jl ${skipPushLabel}`);
  this.instr('push qword [r13+rcx*8]');
  this.instr('add rdi, 8');
  this.label(skipPushLabel);
  this.instr('dec rcx');
  this.instr(`jmp ${pushSpreadLoop}`);
  this.label(pushSpreadDone);

  this.label(noExtraLabel);

  // Agora configura os primeiros 4 args de normal + spread
  const paramRegs = ['rcx', 'rdx', 'r8', 'r9'];
  // Define todos como UNDEF_SENTINEL primeiro
  for (let i = 0; i < 4; i++) {
    this.instr(`mov ${paramRegs[i]}, UNDEF_SENTINEL`);
  }
  // Carrega args normais
  for (let i = 0; i < normalCount && i < 4; i++) {
    this.instr(`mov ${paramRegs[i]}, ${this.loc(normalArgs[i].temp)}`);
  }
  // Carrega args do spread nos registradores restantes (se houver)
  for (let i = normalCount; i < 4; i++) {
    const spreadIdx = i - normalCount;
    this.instr(`cmp r12, ${spreadIdx + 1}`);  // checa se spread tem essa quantidade de elementos
    const skipLoadLabel = this.newLabel('callspread_skipload');
    this.instr(`jl ${skipLoadLabel}`);
    this.instr(`mov ${paramRegs[i]}, [r13+${spreadIdx * 8}]`);
    this.label(skipLoadLabel);
  }

  // Shadow space + chamada
  this.instr('sub rsp, 32');
  this.instr(`call func_${funcName}`);
  this.instr('add rsp, 32');
  this.instr('add rsp, rdi');  // limpa args extras

  this.instr(`mov ${this.loc(dest)}, rax`);

  this.instr('pop rdi');
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayPop(dest, array) {
  this.comment('array.pop()');
  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr('mov rcx, [rax]');           // tamanho
  this.instr('dec rcx');                   // novo tamanho
  this.instr('mov [rax], rcx');           // atualiza tamanho
  this.instr('mov rdx, [rax+16]');        // ponteiro de dados
  this.instr('mov rax, [rdx+rcx*8]');     // data[novoTamanho]
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitArrayShift(dest, array) {
  this.comment('array.shift()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);
  this.instr('mov rax, [rbx+16]');        // ponteiro de dados
  this.instr('mov rcx, [rax]');           // primeiro elemento
  this.instr(`mov ${this.loc(dest)}, rcx`);
  // Desloca dados para a esquerda: memmove(data, data+8, (tamanho-1)*8)
  this.instr('mov r12, [rbx]');
  this.instr('dec r12');
  this.instr('mov [rbx], r12');           // novo tamanho
  this.instr('mov rcx, [rbx+16]');        // dest = data
  this.instr('lea rdx, [rcx+8]');         // src = data+8
  this.instr('mov r8, r12');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('call memmove');
  this.instr('add rsp, 32');
  // Desloca tipos para a esquerda
  this.instr('mov rcx, [rbx+24]');
  this.instr('lea rdx, [rcx+1]');
  this.instr('mov r8, r12');
  this.instr('sub rsp, 32');
  this.instr('call memmove');
  this.instr('add rsp, 32');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayUnshift(array, value, type) {
  this.comment('array.unshift()');
  const typeId = type || TYPE_INT;
  const skipRealloc = this.newLabel('unshift_ok');

  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);
  this.instr('mov rcx, [rbx]');
  this.instr('cmp rcx, [rbx+8]');
  this.instr(`jl ${skipRealloc}`);
  // Expande
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

  this.label(skipRealloc);
  // Desloca dados para a direita: memmove(data+8, data, tamanho*8)
  this.instr('mov r12, [rbx]');
  this.instr('mov rdx, [rbx+16]');        // src = data
  this.instr('lea rcx, [rdx+8]');         // dest = data+8
  this.instr('mov r8, r12');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('call memmove');
  this.instr('add rsp, 32');
  // Desloca tipos para a direita
  this.instr('mov rdx, [rbx+24]');
  this.instr('lea rcx, [rdx+1]');
  this.instr('mov r8, r12');
  this.instr('sub rsp, 32');
  this.instr('call memmove');
  this.instr('add rsp, 32');
  // Define o primeiro elemento
  this.instr('mov rax, [rbx+16]');
  this.instr(`mov rcx, ${this.loc(value)}`);
  this.instr('mov [rax], rcx');
  this.instr('mov rax, [rbx+24]');
  this.instr(`mov byte [rax], ${typeId}`);
  this.instr('inc qword [rbx]');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayIndexOf(dest, array, value) {
  this.comment('array.indexOf()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);
  this.instr('mov r12, [rbx]');           // tamanho
  this.instr('mov rbx, [rbx+16]');        // ponteiro de dados
  this.instr(`mov rcx, ${this.loc(value)}`);
  this.instr('xor rdx, rdx');             // i = 0
  const loopLbl = this.newLabel('aidxof_loop');
  const foundLbl = this.newLabel('aidxof_found');
  const notFoundLbl = this.newLabel('aidxof_nf');
  const doneLbl = this.newLabel('aidxof_done');
  this.label(loopLbl);
  this.instr('cmp rdx, r12');
  this.instr(`jge ${notFoundLbl}`);
  this.instr('cmp [rbx+rdx*8], rcx');
  this.instr(`je ${foundLbl}`);
  this.instr('inc rdx');
  this.instr(`jmp ${loopLbl}`);
  this.label(foundLbl);
  this.instr(`mov ${this.loc(dest)}, rdx`);
  this.instr(`jmp ${doneLbl}`);
  this.label(notFoundLbl);
  this.instr('mov rax, -1');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.label(doneLbl);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayIncludes(dest, array, value) {
  this.comment('array.includes()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);
  this.instr('mov r12, [rbx]');
  this.instr('mov rbx, [rbx+16]');
  this.instr(`mov rcx, ${this.loc(value)}`);
  this.instr('xor rdx, rdx');
  const loopLbl = this.newLabel('ainc_loop');
  const foundLbl = this.newLabel('ainc_found');
  const notFoundLbl = this.newLabel('ainc_nf');
  const doneLbl = this.newLabel('ainc_done');
  this.label(loopLbl);
  this.instr('cmp rdx, r12');
  this.instr(`jge ${notFoundLbl}`);
  this.instr('cmp [rbx+rdx*8], rcx');
  this.instr(`je ${foundLbl}`);
  this.instr('inc rdx');
  this.instr(`jmp ${loopLbl}`);
  this.label(foundLbl);
  this.instr('mov rax, 1');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.instr(`jmp ${doneLbl}`);
  this.label(notFoundLbl);
  this.instr('xor rax, rax');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.label(doneLbl);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayJoin(dest, array, separator) {
  this.comment('array.join()');
  // 8 pushes = 64 bytes = alinhado
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('push rdi');
  this.instr('push rsi');
  this.instr('sub rsp, 8');              // padding de alinhamento (7 pushes + pad = 64)

  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr(`mov r13, ${this.loc(separator)}`);
  this.instr('mov r14, [rax]');           // tamanho
  this.instr('mov r15, [rax+16]');        // ponteiro de dados
  this.instr('mov rdi, [rax+24]');        // ponteiro de tipos

  // Aloca buffer de resultado (4096)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 4096');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov byte [rbx], 0');

  this.instr('xor r12, r12');             // i = 0
  const loopLbl = this.newLabel('ajoin_loop');
  const endLbl = this.newLabel('ajoin_end');
  const skipSepLbl = this.newLabel('ajoin_nosep');
  const isStrLbl = this.newLabel('ajoin_str');
  const appendLbl = this.newLabel('ajoin_append');

  this.label(loopLbl);
  this.instr('cmp r12, r14');
  this.instr(`jge ${endLbl}`);

  // Adiciona separador se não for o primeiro elemento
  this.instr('test r12, r12');
  this.instr(`jz ${skipSepLbl}`);
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');             // dest = buf
  this.instr('mov rdx, r13');             // src = separador
  this.instr('call strcat');
  this.instr('add rsp, 32');
  this.label(skipSepLbl);

  // Obtém elemento como string → rsi
  this.instr('movzx eax, byte [rdi+r12]');
  this.instr(`cmp al, ${TYPE_STRING}`);
  this.instr(`je ${isStrLbl}`);
  // Converte inteiro para string
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [r15+r12*8]');
  this.instr('call __int_to_str');
  this.instr('add rsp, 32');
  this.instr('mov rsi, rax');
  this.instr(`jmp ${appendLbl}`);
  this.label(isStrLbl);
  this.instr('mov rsi, [r15+r12*8]');
  this.label(appendLbl);

  // Concatena string do elemento: strcat(buf, rsi)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');
  this.instr('mov rdx, rsi');
  this.instr('call strcat');
  this.instr('add rsp, 32');

  this.instr('inc r12');
  this.instr(`jmp ${loopLbl}`);
  this.label(endLbl);

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('add rsp, 8');              // remove padding de alinhamento
  this.instr('pop rsi');
  this.instr('pop rdi');
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArraySlice(dest, array, start, end) {
  this.comment('array.slice()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(array)}`);    // cabeçalho
  this.instr(`mov r13, ${this.loc(start)}`);     // índice inicial
  this.instr(`mov r14, ${this.loc(end)}`);       // índice final

  // Trata início negativo
  this.instr('test r13, r13');
  const startOk = this.newLabel('slc_sok');
  this.instr(`jge ${startOk}`);
  this.instr('add r13, [r12]');           // start += tamanho
  this.label(startOk);
  // Trata fim negativo
  this.instr('test r14, r14');
  const endOk = this.newLabel('slc_eok');
  this.instr(`jge ${endOk}`);
  this.instr('add r14, [r12]');
  this.label(endOk);

  // contagem = fim - início
  this.instr('mov rcx, r14');
  this.instr('sub rcx, r13');             // rcx = contagem
  // Limita a >= 0
  this.instr('test rcx, rcx');
  const countOk = this.newLabel('slc_cok');
  this.instr(`jg ${countOk}`);
  this.instr('xor rcx, rcx');
  this.label(countOk);
  this.instr('push rcx');                 // salva contagem

  // Aloca novo cabeçalho de array (32 bytes)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('pop rcx');                  // restaura contagem
  this.instr('push rcx');
  this.instr('mov [rbx], rcx');           // tamanho = contagem
  this.instr('mov rax, rcx');
  this.instr('test rax, rax');
  const nonZero = this.newLabel('slc_nz');
  this.instr(`jnz ${nonZero}`);
  this.instr('mov rax, 1');               // pelo menos 1 para malloc
  this.label(nonZero);
  this.instr('mov [rbx+8], rax');         // capacidade = contagem (ou 1)

  // Aloca dados
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');

  // Aloca tipos
  this.instr('pop rcx');                  // contagem
  this.instr('push rcx');
  this.instr('test rcx, rcx');
  const typNz = this.newLabel('slc_tnz');
  this.instr(`jnz ${typNz}`);
  this.instr('mov rcx, 1');
  this.label(typNz);
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  // memcpy dados: dest=novosDados, src=dadosAntigos+start*8, contagem*8
  this.instr('pop rcx');                  // contagem
  this.instr('push rcx');
  this.instr('mov r8, rcx');
  this.instr('shl r8, 3');
  this.instr('mov rcx, [rbx+16]');        // dest
  this.instr('mov rdx, [r12+16]');        // base src
  this.instr('lea rdx, [rdx+r13*8]');     // src + start*8
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // memcpy tipos: dest=novosTipos, src=tiposAntigos+start, contagem
  this.instr('pop rcx');
  this.instr('mov r8, rcx');
  this.instr('mov rcx, [rbx+24]');
  this.instr('mov rdx, [r12+24]');
  this.instr('add rdx, r13');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayReverse(dest, array) {
  this.comment('array.reverse()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(array)}`);
  this.instr('mov r13, [r12]');           // tamanho

  // Aloca novo cabeçalho de array
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov [rbx], r13');
  this.instr('mov [rbx+8], r13');

  // Aloca dados
  this.instr('mov rax, r13');
  this.instr('test rax, rax');
  const nz1 = this.newLabel('rev_nz1');
  this.instr(`jnz ${nz1}`);
  this.instr('mov rax, 1');
  this.label(nz1);
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');

  // Aloca tipos
  this.instr('mov rax, r13');
  this.instr('test rax, rax');
  const nz2 = this.newLabel('rev_nz2');
  this.instr(`jnz ${nz2}`);
  this.instr('mov rax, 1');
  this.label(nz2);
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  // Copia elementos em reverso
  this.instr('xor r14, r14');             // i = 0
  const loopLbl = this.newLabel('rev_loop');
  const endLbl = this.newLabel('rev_end');
  this.label(loopLbl);
  this.instr('cmp r14, r13');
  this.instr(`jge ${endLbl}`);
  // índice src = tamanho - 1 - i
  this.instr('mov rax, r13');
  this.instr('dec rax');
  this.instr('sub rax, r14');
  // Copia dados
  this.instr('mov rcx, [r12+16]');
  this.instr('mov rcx, [rcx+rax*8]');
  this.instr('mov rdx, [rbx+16]');
  this.instr('mov [rdx+r14*8], rcx');
  // Copia tipo
  this.instr('mov rcx, [r12+24]');
  this.instr('movzx ecx, byte [rcx+rax]');
  this.instr('mov rdx, [rbx+24]');
  this.instr('mov [rdx+r14], cl');
  this.instr('inc r14');
  this.instr(`jmp ${loopLbl}`);
  this.label(endLbl);

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayConcat(dest, arr1, arr2) {
  this.comment('array.concat()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(arr1)}`);
  this.instr(`mov r13, ${this.loc(arr2)}`);
  this.instr('mov r14, [r12]');
  this.instr('add r14, [r13]');           // tamanho total

  // Aloca cabeçalho
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov [rbx], r14');
  this.instr('mov [rbx+8], r14');

  // Aloca dados
  this.instr('mov rax, r14');
  this.instr('test rax, rax');
  const nz1 = this.newLabel('cat_nz1');
  this.instr(`jnz ${nz1}`);
  this.instr('mov rax, 1');
  this.label(nz1);
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');

  // Aloca tipos
  this.instr('mov rax, r14');
  this.instr('test rax, rax');
  const nz2 = this.newLabel('cat_nz2');
  this.instr(`jnz ${nz2}`);
  this.instr('mov rax, 1');
  this.label(nz2);
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  // memcpy dados do arr1
  this.instr('mov r8, [r12]');
  this.instr('shl r8, 3');
  this.instr('mov rcx, [rbx+16]');
  this.instr('mov rdx, [r12+16]');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // memcpy dados do arr2 após arr1
  this.instr('mov rax, [r12]');
  this.instr('mov rcx, [rbx+16]');
  this.instr('lea rcx, [rcx+rax*8]');     // dest = novosDados + len1*8
  this.instr('mov rdx, [r13+16]');
  this.instr('mov r8, [r13]');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // memcpy tipos do arr1
  this.instr('mov r8, [r12]');
  this.instr('mov rcx, [rbx+24]');
  this.instr('mov rdx, [r12+24]');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // memcpy tipos do arr2
  this.instr('mov rax, [r12]');
  this.instr('mov rcx, [rbx+24]');
  this.instr('add rcx, rax');
  this.instr('mov rdx, [r13+24]');
  this.instr('mov r8, [r13]');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

module.exports = {
  emitArrayNew,
  emitArrayGet,
  emitArraySet,
  emitArrayPush,
  emitArrayLength,
  emitTemplate,
  emitArraySpread,
  emitCallSpread,
  emitArrayPop,
  emitArrayShift,
  emitArrayUnshift,
  emitArrayIndexOf,
  emitArrayIncludes,
  emitArrayJoin,
  emitArraySlice,
  emitArrayReverse,
  emitArrayConcat,
  emitArraySplice,
  emitArrayFill,
};

// arr.splice(start, deleteCount, ...items) — muta o array, retorna elementos removidos
function emitArraySplice(dest, arr, start, deleteCount, items) {
  // Para simplificar: cria um novo array com elementos removidos, depois muta a origem
  // Isso é complexo em assembly, então fazemos uma versão simplificada:
  // 1. Cria array resultado com elementos removidos
  // 2. Desloca elementos para fechar a lacuna / abrir espaço para items
  // Por enquanto, abordagem simples: cria array de removidos, ajusta tamanho
  this.comment('array.splice()');

  // Salva registradores
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('sub rsp, 40');

  this.instr(`mov r12, ${this.loc(arr)}`);     // ponteiro do array
  this.instr(`mov r13, ${this.loc(start)}`);    // índice inicial
  this.instr(`mov r14, ${this.loc(deleteCount)}`); // contagem de remoção

  // Obtém tamanho do array
  this.instr('mov rax, [r12]');       // tamanho
  this.instr('mov r15, rax');          // r15 = tamanho original

  // Limita start
  this.instr('cmp r13, r15');
  const clampLbl = this.newLabel('splice_clamp');
  this.instr(`jle ${clampLbl}`);
  this.instr('mov r13, r15');
  this.label(clampLbl);

  // Limita deleteCount
  this.instr('mov rax, r15');
  this.instr('sub rax, r13');
  this.instr('cmp r14, rax');
  const clamp2Lbl = this.newLabel('splice_clamp2');
  this.instr(`jle ${clamp2Lbl}`);
  this.instr('mov r14, rax');
  this.label(clamp2Lbl);

  // Cria array resultado (elementos removidos) — aloca com equivalente a ARRAY_NEW
  // Para simplificar, cria um array vazio e faz push dos elementos removidos
  this.instr('mov rcx, 32');          // tamanho do cabeçalho
  this.instr('call malloc');
  this.instr('mov rbx, rax');         // rbx = array resultado
  this.instr('mov qword [rbx], 0');   // tamanho = 0
  this.instr('mov qword [rbx + 8], 0'); // capacidade = 0
  this.instr('mov qword [rbx + 16], 0'); // dados = null
  this.instr('mov qword [rbx + 24], 0'); // tipos = null
  this.instr(`mov ${this.loc(dest)}, rbx`);

  // Copia elementos removidos para o array resultado usando lógica de ARRAY_PUSH
  // Para cada elemento removido: push para resultado
  const delLoopLbl = this.newLabel('splice_delloop');
  const delDoneLbl = this.newLabel('splice_deldone');
  this.instr('xor rcx, rcx'); // i = 0
  this.label(delLoopLbl);
  this.instr('cmp rcx, r14');
  this.instr(`jge ${delDoneLbl}`);
  // Obtém elemento em start + i
  this.instr('push rcx');
  this.instr('add rcx, r13');        // index = start + i
  this.instr('mov rax, [r12 + 16]'); // data ptr
  this.instr('mov rax, [rax + rcx*8]'); // valor do elemento
  // Apenas ajustamos o array fonte; pula cópia para resultado por enquanto
  this.instr('pop rcx');
  this.instr('inc rcx');
  this.instr(`jmp ${delLoopLbl}`);
  this.label(delDoneLbl);

  // Desloca elementos para fechar a lacuna
  // Move elementos de start+deleteCount para start
  const shiftLoopLbl = this.newLabel('splice_shift');
  const shiftDoneLbl = this.newLabel('splice_shiftdone');
  this.instr('mov rcx, r13');        // dst index = start
  this.instr('mov rdx, r13');
  this.instr('add rdx, r14');        // src index = start + deleteCount
  this.label(shiftLoopLbl);
  this.instr('cmp rdx, r15');        // enquanto src < tamanho
  this.instr(`jge ${shiftDoneLbl}`);
  this.instr('mov rax, [r12 + 16]'); // data ptr
  this.instr('mov r8, [rax + rdx*8]'); // elemento src
  this.instr('mov [rax + rcx*8], r8'); // dst = src
  this.instr('inc rcx');
  this.instr('inc rdx');
  this.instr(`jmp ${shiftLoopLbl}`);
  this.label(shiftDoneLbl);

  // Atualiza tamanho: novoTam = tamanho - deleteCount
  this.instr('mov rax, r15');
  this.instr('sub rax, r14');
  this.instr('mov [r12], rax');

  this.instr('add rsp, 40');
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

// arr.fill(value, start, end) — preenche o array com valor de start até end
function emitArrayFill(dest, arr, value, start, end) {
  this.comment('array.fill()');
  this.instr('push rbx');
  this.instr('sub rsp, 40');

  this.instr(`mov rbx, ${this.loc(arr)}`);
  this.instr(`mov rcx, ${this.loc(start)}`);  // start
  this.instr(`mov rdx, ${this.loc(end)}`);     // end
  this.instr(`mov r8, ${this.loc(value)}`);    // value

  const loopLbl = this.newLabel('fill_loop');
  const doneLbl = this.newLabel('fill_done');
  this.label(loopLbl);
  this.instr('cmp rcx, rdx');
  this.instr(`jge ${doneLbl}`);
  this.instr('mov rax, [rbx + 16]');  // ponteiro de dados
  this.instr('mov [rax + rcx*8], r8');
  this.instr('inc rcx');
  this.instr(`jmp ${loopLbl}`);
  this.label(doneLbl);

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('add rsp, 40');
  this.instr('pop rbx');
}
