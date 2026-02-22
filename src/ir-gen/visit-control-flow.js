'use strict';

const { OP } = require('../ir');
const { TYPE_INT, TYPE_STRING } = require('../types');

function visitReturnStatement(node) {
  if (node.argument) {
    const { temp, type } = this.visitExpression(node.argument);
    // Track return type for the current function
    if (this._currentFunctionReturnType === undefined || this._currentFunctionReturnType === TYPE_INT) {
      this._currentFunctionReturnType = type;
    }
    // Track if returning a parameter directly (for call-site type propagation)
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

  // Init
  if (node.init) {
    if (node.init.type === 'VariableDeclaration') {
      this.visitVariableDeclaration(node.init);
    } else {
      this.visitExpression(node.init);
    }
  }

  // Test
  this.emit(OP.LABEL, loopLabel);
  if (node.test) {
    const { temp: cond } = this.visitExpression(node.test);
    this.emit(OP.JUMP_IF_FALSE, cond, endLabel);
  }

  // Body
  this.visitStatement(node.body);

  // Update
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
  // Desugar for...of into index-based for loop
  // Supports both arrays and strings
  const iterLabel = this.newLabel('forof');
  const updateLabel = this.newLabel('forof_upd');
  const endLabel = this.newLabel('endforof');

  this.loopStack.push({ continueLabel: updateLabel, breakLabel: endLabel });

  // Get the iterable
  const { temp: iterTemp, type: iterType } = this.visitExpression(node.right);
  const isString = iterType === TYPE_STRING;

  // Create index variable
  const idxName = `_forof_idx_${this.labelCounter}`;
  const idxTemp = this.newTemp();
  this.emit(OP.LOAD_INT, idxTemp, 0);
  this.emit(OP.STORE_VAR, idxName, idxTemp);

  // Loop start
  this.emit(OP.LABEL, iterLabel);

  // Test: idx < iterable.length
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

  // Declare loop variable: let x = iterable[idx]
  const elemTemp = this.newTemp();
  const idxLoad2 = this.newTemp();
  this.emit(OP.LOAD_VAR, idxLoad2, idxName);
  if (isString) {
    this.emit(OP.STR_CHAR_AT, elemTemp, iterTemp, idxLoad2);
  } else {
    this.emit(OP.ARRAY_GET, elemTemp, iterTemp, idxLoad2);
  }

  // Handle destructuring in loop variable
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

  // Body
  this.visitStatement(node.body);

  // Update: idx++
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

  // Generate labels for each case
  for (let i = 0; i < node.cases.length; i++) {
    caseLabels.push(this.newLabel(`case_${i}`));
  }

  // Generate comparison jumps
  for (let i = 0; i < node.cases.length; i++) {
    const c = node.cases[i];
    if (c.test) {
      // case value:
      const { temp: testVal } = this.visitExpression(c.test);
      const cmpTemp = this.newTemp();
      this.emit(OP.CMP_SEQ, cmpTemp, disc, testVal);
      this.emit(OP.JUMP_IF_TRUE, cmpTemp, caseLabels[i]);
    } else {
      // default:
      this.emit(OP.JUMP, caseLabels[i]);
    }
  }

  // If no default matched, jump to end
  this.emit(OP.JUMP, endLabel);

  // Emit case bodies (fall-through behavior)
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
  // for (let key in obj) → get Object.keys(obj), iterate with index
  const iterLabel = this.newLabel('forin');
  const updateLabel = this.newLabel('forin_upd');
  const endLabel = this.newLabel('endforin');

  this.loopStack.push({ continueLabel: updateLabel, breakLabel: endLabel });

  // Get the object's keys as an array
  const { temp: objTemp } = this.visitExpression(node.right);
  const keysTemp = this.newTemp();
  this.emit(OP.OBJ_KEYS, keysTemp, objTemp);

  // Create index variable
  const idxName = `_forin_idx_${this.labelCounter}`;
  const idxTemp = this.newTemp();
  this.emit(OP.LOAD_INT, idxTemp, 0);
  this.emit(OP.STORE_VAR, idxName, idxTemp);

  this.emit(OP.LABEL, iterLabel);

  // Test: idx < keys.length
  const lenTemp = this.newTemp();
  this.emit(OP.ARRAY_LENGTH, lenTemp, keysTemp);
  const idxLoad = this.newTemp();
  this.emit(OP.LOAD_VAR, idxLoad, idxName);
  const cmpTemp = this.newTemp();
  this.emit(OP.CMP_LT, cmpTemp, idxLoad, lenTemp);
  this.emit(OP.JUMP_IF_FALSE, cmpTemp, endLabel);

  // Declare loop variable: let key = keys[idx]
  const elemTemp = this.newTemp();
  const idxLoad2 = this.newTemp();
  this.emit(OP.LOAD_VAR, idxLoad2, idxName);
  this.emit(OP.ARRAY_GET, elemTemp, keysTemp, idxLoad2);

  const varName = node.left.type === 'VariableDeclaration'
    ? node.left.declarations[0].id.name
    : node.left.name;

  this.analyzer.currentScope.declare(varName, { type: TYPE_INT, isConst: false });
  this.emit(OP.STORE_VAR, varName, elemTemp);

  // Body
  this.visitStatement(node.body);

  // Update: idx++
  this.emit(OP.LABEL, updateLabel);
  const incTemp = this.newTemp();
  this.emit(OP.PRE_INC, incTemp, idxName);

  this.emit(OP.JUMP, iterLabel);
  this.emit(OP.LABEL, endLabel);

  this.loopStack.pop();
}

function visitLabeledStatement(node) {
  const labelName = node.label.name;
  // If the body is a loop, add label info to loopStack for labeled break/continue
  const body = node.body;

  // Create break label for this labeled statement
  const breakLabel = this.newLabel(`label_${labelName}_break`);

  if (['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement'].includes(body.type)) {
    // Push a special entry with the label name so break/continue can find it
    this._labelMap = this._labelMap || {};
    this._labelMap[labelName] = { breakLabel };
    // Visit the loop — it will push its own entry to loopStack
    this.visitStatement(body);
    // After the loop, emit the break label
    this.emit(OP.LABEL, breakLabel);
    // Patch: update the loopStack entry that was added by the loop
    delete this._labelMap[labelName];
  } else {
    // Non-loop labeled statement — just for break
    this._labelMap = this._labelMap || {};
    this._labelMap[labelName] = { breakLabel };
    this.visitStatement(body);
    this.emit(OP.LABEL, breakLabel);
    delete this._labelMap[labelName];
  }
}

function visitBreakStatement(node) {
  // Labeled break
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
  // Labeled continue
  if (node && node.label) {
    const labelName = node.label.name;
    if (this._labelMap && this._labelMap[labelName]) {
      // For labeled continue, we need the continue label from the loop
      // The loop that was most recently pushed with this label
      // Since we can't easily associate label with loop stack entry,
      // jump to the continue label of the innermost loop (simplification)
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

  // Push exception handler
  this.emit(OP.TRY_PUSH, catchLabel);

  // Try body
  for (const stmt of node.block.body) {
    this.visitStatement(stmt);
  }

  // Normal path — pop handler
  this.emit(OP.TRY_POP);
  this.emit(OP.JUMP, finallyLabel || endLabel);

  // Catch block
  this.emit(OP.LABEL, catchLabel);
  if (node.handler) {
    // Declare catch parameter and load exception value
    if (node.handler.param) {
      const paramName = node.handler.param.name;
      this.analyzer.currentScope.declare(paramName, { type: TYPE_INT, isConst: false });
      // The exception value is stored in _exc_value BSS by THROW;
      // Register as global so codegen resolves to gvar__exc_value
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

  // Finally block
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
