'use strict';

const { OP } = require('../ir');
const { TYPE_INT, TYPE_STRING } = require('../types');

function visitReturnStatement(node) {
  if (node.argument) {
    const { temp, type } = this.visitExpression(node.argument);
    // Rastreia tipo de retorno para a função atual
    if (this._currentFunctionReturnType === undefined || this._currentFunctionReturnType === TYPE_INT) {
      this._currentFunctionReturnType = type;
    }
    // Rastreia se está retornando um parâmetro diretamente (para propagação de tipo no call site)
    if (node.argument.type === 'Identifier' && this._currentFunctionParams) {
      const paramIdx = this._currentFunctionParams.indexOf(node.argument.name);
      if (paramIdx !== -1) {
        this._currentFunctionReturnParam = paramIdx;
      }
    }
    this.emit(OP.RETURN, temp);
  } else {
    this.emit(OP.RETURN);
  }
}

function visitIfStatement(node) {
  const { temp: cond } = this.visitExpression(node.test);
  const elseLabel = this.newLabel('else');
  const endLabel = this.newLabel('endif');

  if (node.alternate) {
    this.emit(OP.JUMP_IF_FALSE, cond, elseLabel);
    this.visitStatement(node.consequent);
    this.emit(OP.JUMP, endLabel);
    this.emit(OP.LABEL, elseLabel);
    this.visitStatement(node.alternate);
    this.emit(OP.LABEL, endLabel);
  } else {
    this.emit(OP.JUMP_IF_FALSE, cond, endLabel);
    this.visitStatement(node.consequent);
    this.emit(OP.LABEL, endLabel);
  }
}

function visitWhileStatement(node) {
  const loopLabel = this.newLabel('while');
  const endLabel = this.newLabel('endwhile');

  this.loopStack.push({ continueLabel: loopLabel, breakLabel: endLabel });

  this.emit(OP.LABEL, loopLabel);
  const { temp: cond } = this.visitExpression(node.test);
  this.emit(OP.JUMP_IF_FALSE, cond, endLabel);
  this.visitStatement(node.body);
  this.emit(OP.JUMP, loopLabel);
  this.emit(OP.LABEL, endLabel);

  this.loopStack.pop();
}

function visitForStatement(node) {
  const updateLabel = this.newLabel('forupd');
  const loopLabel = this.newLabel('for');
  const endLabel = this.newLabel('endfor');

  this.loopStack.push({ continueLabel: updateLabel, breakLabel: endLabel });

  // Inicialização
  if (node.init) {
    if (node.init.type === 'VariableDeclaration') {
      this.visitVariableDeclaration(node.init);
    } else {
      this.visitExpression(node.init);
    }
  }

  // Teste
  this.emit(OP.LABEL, loopLabel);
  if (node.test) {
    const { temp: cond } = this.visitExpression(node.test);
    this.emit(OP.JUMP_IF_FALSE, cond, endLabel);
  }

  // Corpo
  this.visitStatement(node.body);

  // Atualização
  this.emit(OP.LABEL, updateLabel);
  if (node.update) {
    if (node.update.type === 'UpdateExpression') {
      this.visitUpdateExpression(node.update);
    } else if (node.update.type === 'AssignmentExpression') {
      this.visitAssignment(node.update);
    } else {
      this.visitExpression(node.update);
    }
  }

  this.emit(OP.JUMP, loopLabel);
  this.emit(OP.LABEL, endLabel);

  this.loopStack.pop();
}

function visitDoWhileStatement(node) {
  const loopLabel = this.newLabel('dowhile');
  const continueLabel = this.newLabel('dowhile_cont');
  const endLabel = this.newLabel('enddowhile');

  this.loopStack.push({ continueLabel, breakLabel: endLabel });

  this.emit(OP.LABEL, loopLabel);
  this.visitStatement(node.body);
  this.emit(OP.LABEL, continueLabel);
  const { temp: cond } = this.visitExpression(node.test);
  this.emit(OP.JUMP_IF_TRUE, cond, loopLabel);
  this.emit(OP.LABEL, endLabel);

  this.loopStack.pop();
}

function visitForOfStatement(node) {
  // Desaçucara for...of em loop for baseado em índice
  // Suporta arrays e strings
  const iterLabel = this.newLabel('forof');
  const updateLabel = this.newLabel('forof_upd');
  const endLabel = this.newLabel('endforof');

  this.loopStack.push({ continueLabel: updateLabel, breakLabel: endLabel });

  // Obtém o iterável
  const { temp: iterTemp, type: iterType } = this.visitExpression(node.right);
  const isString = iterType === TYPE_STRING;

  // Cria variável de índice
  const idxName = `_forof_idx_${this.labelCounter}`;
  const idxTemp = this.newTemp();
  this.emit(OP.LOAD_INT, idxTemp, 0);
  this.emit(OP.STORE_VAR, idxName, idxTemp);

  // Início do loop
  this.emit(OP.LABEL, iterLabel);

  // Teste: idx < iterável.length
  const lenTemp = this.newTemp();
  if (isString) {
    this.emit(OP.STR_LENGTH, lenTemp, iterTemp);
  } else {
    this.emit(OP.ARRAY_LENGTH, lenTemp, iterTemp);
  }
  const idxLoad = this.newTemp();
  this.emit(OP.LOAD_VAR, idxLoad, idxName);
  const cmpTemp = this.newTemp();
  this.emit(OP.CMP_LT, cmpTemp, idxLoad, lenTemp);
  this.emit(OP.JUMP_IF_FALSE, cmpTemp, endLabel);

  // Declara variável do loop: let x = iterable[idx]
  const elemTemp = this.newTemp();
  const idxLoad2 = this.newTemp();
  this.emit(OP.LOAD_VAR, idxLoad2, idxName);
  if (isString) {
    this.emit(OP.STR_CHAR_AT, elemTemp, iterTemp, idxLoad2);
  } else {
    this.emit(OP.ARRAY_GET, elemTemp, iterTemp, idxLoad2);
  }

  // Trata destructuring na variável do loop
  const leftDecl = node.left.type === 'VariableDeclaration' ? node.left.declarations[0] : null;
  if (leftDecl && leftDecl.id.type === 'ArrayPattern') {
    const tempName = `_forof_elem_${this.labelCounter}`;
    this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
    this.emit(OP.STORE_VAR, tempName, elemTemp);
    this._emitArrayDestructuringDecl(tempName, leftDecl.id, false);
  } else if (leftDecl && leftDecl.id.type === 'ObjectPattern') {
    const tempName = `_forof_elem_${this.labelCounter}`;
    this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
    this.emit(OP.STORE_VAR, tempName, elemTemp);
    this._emitObjectDestructuringDecl(tempName, leftDecl.id, false);
  } else {
    const varName = leftDecl ? leftDecl.id.name : node.left.name;
    this.analyzer.currentScope.declare(varName, { type: isString ? TYPE_STRING : TYPE_INT, isConst: false });
    this.emit(OP.STORE_VAR, varName, elemTemp);
  }

  // Corpo
  this.visitStatement(node.body);

  // Atualização: idx++
  this.emit(OP.LABEL, updateLabel);
  const incTemp = this.newTemp();
  this.emit(OP.PRE_INC, incTemp, idxName);

  this.emit(OP.JUMP, iterLabel);
  this.emit(OP.LABEL, endLabel);

  this.loopStack.pop();
}

function visitSwitchStatement(node) {
  const endLabel = this.newLabel('endswitch');

  this.loopStack.push({ continueLabel: null, breakLabel: endLabel });

  const { temp: disc } = this.visitExpression(node.discriminant);
  const caseLabels = [];

  // Gera labels para cada case
  for (let i = 0; i < node.cases.length; i++) {
    caseLabels.push(this.newLabel(`case_${i}`));
  }

  // Gera jumps de comparação
  for (let i = 0; i < node.cases.length; i++) {
    const c = node.cases[i];
    if (c.test) {
      // valor do case:
      const { temp: testVal } = this.visitExpression(c.test);
      const cmpTemp = this.newTemp();
      this.emit(OP.CMP_SEQ, cmpTemp, disc, testVal);
      this.emit(OP.JUMP_IF_TRUE, cmpTemp, caseLabels[i]);
    } else {
      // padrão (default):
      this.emit(OP.JUMP, caseLabels[i]);
    }
  }

  // Se nenhum default casou, pula pro final
  this.emit(OP.JUMP, endLabel);

  // Emite corpos dos cases (comportamento fall-through)
  for (let i = 0; i < node.cases.length; i++) {
    this.emit(OP.LABEL, caseLabels[i]);
    for (const stmt of node.cases[i].consequent) {
      this.visitStatement(stmt);
    }
  }

  this.emit(OP.LABEL, endLabel);
  this.loopStack.pop();
}

function visitForInStatement(node) {
  // for (let key in obj) → pega Object.keys(obj), itera com índice
  const iterLabel = this.newLabel('forin');
  const updateLabel = this.newLabel('forin_upd');
  const endLabel = this.newLabel('endforin');

  this.loopStack.push({ continueLabel: updateLabel, breakLabel: endLabel });

  // Pega as chaves do objeto como array
  const { temp: objTemp } = this.visitExpression(node.right);
  const keysTemp = this.newTemp();
  this.emit(OP.OBJ_KEYS, keysTemp, objTemp);

  // Cria variável de índice
  const idxName = `_forin_idx_${this.labelCounter}`;
  const idxTemp = this.newTemp();
  this.emit(OP.LOAD_INT, idxTemp, 0);
  this.emit(OP.STORE_VAR, idxName, idxTemp);

  this.emit(OP.LABEL, iterLabel);

  // Teste: idx < keys.length
  const lenTemp = this.newTemp();
  this.emit(OP.ARRAY_LENGTH, lenTemp, keysTemp);
  const idxLoad = this.newTemp();
  this.emit(OP.LOAD_VAR, idxLoad, idxName);
  const cmpTemp = this.newTemp();
  this.emit(OP.CMP_LT, cmpTemp, idxLoad, lenTemp);
  this.emit(OP.JUMP_IF_FALSE, cmpTemp, endLabel);

  // Declara variável do loop: let key = keys[idx]
  const elemTemp = this.newTemp();
  const idxLoad2 = this.newTemp();
  this.emit(OP.LOAD_VAR, idxLoad2, idxName);
  this.emit(OP.ARRAY_GET, elemTemp, keysTemp, idxLoad2);

  const varName = node.left.type === 'VariableDeclaration'
    ? node.left.declarations[0].id.name
    : node.left.name;

  this.analyzer.currentScope.declare(varName, { type: TYPE_INT, isConst: false });
  this.emit(OP.STORE_VAR, varName, elemTemp);

  // Corpo
  this.visitStatement(node.body);

  // Atualização: idx++
  this.emit(OP.LABEL, updateLabel);
  const incTemp = this.newTemp();
  this.emit(OP.PRE_INC, incTemp, idxName);

  this.emit(OP.JUMP, iterLabel);
  this.emit(OP.LABEL, endLabel);

  this.loopStack.pop();
}

function visitLabeledStatement(node) {
  const labelName = node.label.name;
  // Se o corpo é um loop, adiciona info de label ao loopStack para break/continue com label
  const body = node.body;

  // Cria label de break para esta declaração com label
  const breakLabel = this.newLabel(`label_${labelName}_break`);

  if (['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement'].includes(body.type)) {
    // Empilha uma entrada especial com o nome do label para que break/continue possam encontrá-lo
    this._labelMap = this._labelMap || {};
    this._labelMap[labelName] = { breakLabel };
    // Visita o loop — ele vai empilhar sua própria entrada no loopStack
    this.visitStatement(body);
    // Depois do loop, emite o label de break
    this.emit(OP.LABEL, breakLabel);
    // Corrige: atualiza a entrada do loopStack que foi adicionada pelo loop
    delete this._labelMap[labelName];
  } else {
    // Declaração com label sem loop — apenas para break
    this._labelMap = this._labelMap || {};
    this._labelMap[labelName] = { breakLabel };
    this.visitStatement(body);
    this.emit(OP.LABEL, breakLabel);
    delete this._labelMap[labelName];
  }
}

function visitBreakStatement(node) {
  // Break com label
  if (node && node.label) {
    const labelName = node.label.name;
    if (this._labelMap && this._labelMap[labelName]) {
      this.emit(OP.JUMP, this._labelMap[labelName].breakLabel);
      return;
    }
  }
  if (this.loopStack.length === 0) {
    throw new Error('break statement outside of loop');
  }
  this.emit(OP.JUMP, this.loopStack[this.loopStack.length - 1].breakLabel);
}

function visitContinueStatement(node) {
  // Continue com label
  if (node && node.label) {
    const labelName = node.label.name;
    if (this._labelMap && this._labelMap[labelName]) {
      // Para continue com label, precisamos do label de continue do loop
      // O loop que foi empilhado mais recentemente com este label
      // Como não podemos facilmente associar label com entrada do loop stack,
      // pula para o label de continue do loop mais interno (simplificação)
      if (this.loopStack.length > 0) {
        this.emit(OP.JUMP, this.loopStack[this.loopStack.length - 1].continueLabel);
        return;
      }
    }
  }
  if (this.loopStack.length === 0) {
    throw new Error('continue statement outside of loop');
  }
  this.emit(OP.JUMP, this.loopStack[this.loopStack.length - 1].continueLabel);
}

function visitTryStatement(node) {
  const catchLabel = this.newLabel('catch');
  const finallyLabel = node.finalizer ? this.newLabel('finally') : null;
  const endLabel = this.newLabel('endtry');

  // Empilha handler de exceção
  this.emit(OP.TRY_PUSH, catchLabel);

  // Corpo do try
  for (const stmt of node.block.body) {
    this.visitStatement(stmt);
  }

  // Caminho normal — desempilha handler
  this.emit(OP.TRY_POP);
  this.emit(OP.JUMP, finallyLabel || endLabel);

  // Bloco catch
  this.emit(OP.LABEL, catchLabel);
  if (node.handler) {
    // Declara parâmetro do catch e carrega valor da exceção
    if (node.handler.param) {
      const paramName = node.handler.param.name;
      this.analyzer.currentScope.declare(paramName, { type: TYPE_INT, isConst: false });
      // O valor da exceção é armazenado em _exc_value BSS pelo THROW;
      // Registra como global para que o codegen resolva para gvar__exc_value
      this.program.globals.add('_exc_value');
      const excTemp = this.newTemp();
      this.emit(OP.LOAD_VAR, excTemp, '_exc_value');
      this.emit(OP.STORE_VAR, paramName, excTemp);
    }
    for (const stmt of node.handler.body.body) {
      this.visitStatement(stmt);
    }
  }
  this.emit(OP.JUMP, finallyLabel || endLabel);

  // Bloco finally
  if (node.finalizer) {
    this.emit(OP.LABEL, finallyLabel);
    for (const stmt of node.finalizer.body) {
      this.visitStatement(stmt);
    }
  }

  this.emit(OP.LABEL, endLabel);
}

function visitThrowStatement(node) {
  const { temp } = this.visitExpression(node.argument);
  this.emit(OP.THROW, temp);
}

module.exports = {
  visitReturnStatement,
  visitIfStatement,
  visitWhileStatement,
  visitForStatement,
  visitDoWhileStatement,
  visitForOfStatement,
  visitForInStatement,
  visitSwitchStatement,
  visitBreakStatement,
  visitContinueStatement,
  visitTryStatement,
  visitThrowStatement,
  visitLabeledStatement,
};
