'use strict';

const { OP } = require('../ir');
const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_BOOL, TYPE_ARRAY, TYPE_FUNCTION } = require('../types');

function visitExpression(node) {
  switch (node.type) {
    case 'Literal':
      return this.visitLiteral(node);
    case 'Identifier':
      return this.visitIdentifier(node);
    case 'BinaryExpression':
      return this.visitBinaryExpression(node);
    case 'UnaryExpression':
      return this.visitUnaryExpression(node);
    case 'LogicalExpression':
      return this.visitLogicalExpression(node);
    case 'CallExpression':
      return this.visitCallExpression(node);
    case 'AssignmentExpression':
      return this.visitAssignment(node);
    case 'UpdateExpression':
      return this.visitUpdateExpression(node);
    case 'ConditionalExpression':
      return this.visitConditionalExpression(node);
    case 'MemberExpression':
      return this.visitMemberExpression(node);
    case 'ObjectExpression':
      return this.visitObjectExpression(node);
    case 'ArrayExpression':
      return this.visitArrayExpression(node);
    case 'TemplateLiteral':
      return this.visitTemplateLiteral(node);
    case 'ArrowFunctionExpression':
      return this.visitArrowFunction(node);
    case 'FunctionExpression':
      return this.visitFunctionExpression(node);
    case 'SequenceExpression':
      return this.visitSequenceExpression(node);
    case 'ChainExpression':
      return this.visitChainExpression(node);
    case 'NewExpression':
      return this.visitNewExpression(node);
    case 'ThisExpression':
      return this.visitThisExpression(node);
    default:
      throw new Error(this._unsupportedError(node));
  }
}

function visitLiteral(node) {
  const t = this.newTemp();
  if (typeof node.value === 'number') {
    if (Number.isInteger(node.value)) {
      this.emit(OP.LOAD_INT, t, node.value);
      return { temp: t, type: TYPE_INT };
    } else {
      const label = this.program.addFloat(node.value);
      this.emit(OP.LOAD_FLOAT, t, label);
      return { temp: t, type: TYPE_FLOAT };
    }
  }
  if (typeof node.value === 'string') {
    const label = this.program.addString(node.value);
    this.emit(OP.LOAD_STRING, t, label);
    return { temp: t, type: TYPE_STRING };
  }
  if (typeof node.value === 'boolean') {
    this.emit(OP.LOAD_BOOL, t, node.value ? 1 : 0);
    return { temp: t, type: TYPE_BOOL };
  }
  if (node.value === null) {
    this.emit(OP.LOAD_NULL, t);
    return { temp: t, type: TYPE_INT };
  }
  this.emit(OP.LOAD_UNDEFINED, t);
  return { temp: t, type: TYPE_INT };
}

function visitIdentifier(node) {
  const t = this.newTemp();

  // Global constants
  if (node.name === 'undefined') {
    this.emit(OP.LOAD_UNDEFINED, t);
    return { temp: t, type: TYPE_INT };
  }
  if (node.name === 'Infinity') {
    this.emit(OP.LOAD_INT, t, 9007199254740991); // MAX_SAFE_INTEGER as approximation
    return { temp: t, type: TYPE_INT };
  }
  if (node.name === 'NaN') {
    this.emit(OP.LOAD_INT, t, 0); // NaN approximated as 0
    return { temp: t, type: TYPE_INT };
  }

  const info = this.analyzer.currentScope.lookup(node.name);

  // Resolve the variable name: importMap → qualified global → raw name
  let resolvedName = node.name;
  if (this.importMap.has(node.name)) {
    resolvedName = this.importMap.get(node.name);
  } else if (info && info.qualifiedName) {
    resolvedName = info.qualifiedName;
  }

  this.emit(OP.LOAD_VAR, t, resolvedName);
  return { temp: t, type: info ? info.type : TYPE_INT };
}

function visitBinaryExpression(node) {
  const { temp: left, type: lt } = this.visitExpression(node.left);
  const { temp: right, type: rt } = this.visitExpression(node.right);
  const t = this.newTemp();

  // String concatenation
  if (node.operator === '+' && (lt === TYPE_STRING || rt === TYPE_STRING)) {
    this.emit(OP.STR_CONCAT, t, left, right, lt, rt);
    return { temp: t, type: TYPE_STRING };
  }

  // String comparison: use strcmp-based comparison
  if (lt === TYPE_STRING && rt === TYPE_STRING &&
      ['<', '>', '<=', '>=', '==', '===', '!=', '!=='].includes(node.operator)) {
    const setInstrMap = {
      '<': 'setl', '>': 'setg', '<=': 'setle', '>=': 'setge',
      '==': 'sete', '===': 'sete', '!=': 'setne', '!==': 'setne',
    };
    this.emit(OP.STR_CMP, t, setInstrMap[node.operator], left, right);
    return { temp: t, type: TYPE_BOOL };
  }

  // "key" in obj → OBJ_HAS_OWN
  if (node.operator === 'in') {
    if (lt === TYPE_STRING || (node.left.type === 'Literal' && typeof node.left.value === 'string')) {
      const keyLabel = this.program.addString(
        node.left.type === 'Literal' ? node.left.value : '__dynamic'
      );
      this.emit(OP.OBJ_HAS_OWN, t, right, keyLabel);
    } else {
      this.emit(OP.LOAD_BOOL, t, 0);
    }
    return { temp: t, type: TYPE_BOOL };
  }

  // instanceof — check className from analyzer
  if (node.operator === 'instanceof') {
    // Check if left operand has className matching right operand's name
    if (node.left.type === 'Identifier' && node.right.type === 'Identifier') {
      const objInfo = this.analyzer.currentScope.lookup(node.left.name);
      if (objInfo && objInfo.className === node.right.name) {
        this.emit(OP.LOAD_BOOL, t, 1);
      } else {
        this.emit(OP.LOAD_BOOL, t, 0);
      }
    } else {
      this.emit(OP.LOAD_BOOL, t, 0);
    }
    return { temp: t, type: TYPE_BOOL };
  }

  const opMap = {
    '+': OP.ADD, '-': OP.SUB, '*': OP.MUL,
    '/': OP.DIV, '%': OP.MOD, '**': OP.POW,
    '<': OP.CMP_LT, '>': OP.CMP_GT, '<=': OP.CMP_LE, '>=': OP.CMP_GE,
    '==': OP.CMP_EQ, '===': OP.CMP_SEQ, '!=': OP.CMP_NE, '!==': OP.CMP_SNE,
    '&': OP.BIT_AND, '|': OP.BIT_OR, '^': OP.BIT_XOR,
    '<<': OP.SHL, '>>': OP.SHR, '>>>': OP.USHR,
  };

  const op = opMap[node.operator];
  if (!op) throw new Error(`Unsupported operator: ${node.operator}`);

  this.emit(op, t, left, right);

  const resultType = ['<', '>', '<=', '>=', '==', '===', '!=', '!=='].includes(node.operator)
    ? TYPE_BOOL
    : (lt === TYPE_FLOAT || rt === TYPE_FLOAT ? TYPE_FLOAT : TYPE_INT);

  return { temp: t, type: resultType };
}

function visitUnaryExpression(node) {
  // typeof is special — argument may be undefined identifier
  if (node.operator === 'typeof') {
    return this.visitTypeofExpression(node);
  }

  const { temp: src, type } = this.visitExpression(node.argument);
  const t = this.newTemp();

  if (node.operator === '-') {
    this.emit(OP.NEG, t, src);
    return { temp: t, type };
  }
  if (node.operator === '!') {
    this.emit(OP.NOT, t, src);
    return { temp: t, type: TYPE_BOOL };
  }
  if (node.operator === '+') {
    return { temp: src, type };
  }
  if (node.operator === '~') {
    this.emit(OP.BIT_NOT, t, src);
    return { temp: t, type: TYPE_INT };
  }
  if (node.operator === 'void') {
    this.emit(OP.LOAD_UNDEFINED, t);
    return { temp: t, type: TYPE_INT };
  }
  if (node.operator === 'delete') {
    // delete obj.prop
    if (node.argument.type === 'MemberExpression' && !node.argument.computed) {
      const { temp: objTemp } = this.visitExpression(node.argument.object);
      const keyLabel = this.program.addString(node.argument.property.name);
      this.emit(OP.OBJ_DELETE, objTemp, keyLabel);
      this.emit(OP.LOAD_BOOL, t, 1);
      return { temp: t, type: TYPE_BOOL };
    }
    // delete obj["key"]
    if (node.argument.type === 'MemberExpression' && node.argument.computed) {
      const { temp: objTemp } = this.visitExpression(node.argument.object);
      if (node.argument.property.type === 'Literal' && typeof node.argument.property.value === 'string') {
        const keyLabel = this.program.addString(node.argument.property.value);
        this.emit(OP.OBJ_DELETE, objTemp, keyLabel);
      }
      this.emit(OP.LOAD_BOOL, t, 1);
      return { temp: t, type: TYPE_BOOL };
    }
    this.emit(OP.LOAD_BOOL, t, 1);
    return { temp: t, type: TYPE_BOOL };
  }

  throw new Error(`Unsupported unary operator: ${node.operator}`);
}

function visitTypeofExpression(node) {
  const t = this.newTemp();
  let typeHint = TYPE_INT;
  try {
    const { type } = this.visitExpression(node.argument);
    typeHint = type;
  } catch (e) {
    // typeof on undeclared var returns "undefined"
  }
  const typeStr = {
    [TYPE_INT]: 'number', [TYPE_FLOAT]: 'number',
    [TYPE_STRING]: 'string', [TYPE_BOOL]: 'boolean',
    [TYPE_ARRAY]: 'object', [TYPE_FUNCTION]: 'function',
  }[typeHint] || 'undefined';
  const label = this.program.addString(typeStr);
  this.emit(OP.LOAD_STRING, t, label);
  return { temp: t, type: TYPE_STRING };
}

function visitLogicalExpression(node) {
  const t = this.newTemp();

  if (node.operator === '&&') {
    const skipLabel = this.newLabel('and_skip');
    const endLabel = this.newLabel('and_end');

    const { temp: left } = this.visitExpression(node.left);
    this.emit(OP.JUMP_IF_FALSE, left, skipLabel);
    const { temp: right } = this.visitExpression(node.right);
    // result is the right value
    this.emit(OP.STORE_VAR, t, right);
    this.emit(OP.JUMP, endLabel);
    this.emit(OP.LABEL, skipLabel);
    this.emit(OP.STORE_VAR, t, left);
    this.emit(OP.LABEL, endLabel);
    this.emit(OP.LOAD_VAR, t, t);
    return { temp: t, type: TYPE_BOOL };
  }

  if (node.operator === '||') {
    const skipLabel = this.newLabel('or_skip');
    const endLabel = this.newLabel('or_end');

    const { temp: left } = this.visitExpression(node.left);
    this.emit(OP.JUMP_IF_TRUE, left, skipLabel);
    const { temp: right } = this.visitExpression(node.right);
    this.emit(OP.STORE_VAR, t, right);
    this.emit(OP.JUMP, endLabel);
    this.emit(OP.LABEL, skipLabel);
    this.emit(OP.STORE_VAR, t, left);
    this.emit(OP.LABEL, endLabel);
    this.emit(OP.LOAD_VAR, t, t);
    return { temp: t, type: TYPE_BOOL };
  }

  // ?? (nullish coalescing) — without runtime type tags, behaves like ||
  // (checks falsy, not just null/undefined)
  if (node.operator === '??') {
    const skipLabel = this.newLabel('nc_skip');
    const endLabel = this.newLabel('nc_end');

    const { temp: left, type: lt } = this.visitExpression(node.left);
    this.emit(OP.JUMP_IF_TRUE, left, skipLabel);
    const { temp: right, type: rt } = this.visitExpression(node.right);
    this.emit(OP.STORE_VAR, t, right);
    this.emit(OP.JUMP, endLabel);
    this.emit(OP.LABEL, skipLabel);
    this.emit(OP.STORE_VAR, t, left);
    this.emit(OP.LABEL, endLabel);
    this.emit(OP.LOAD_VAR, t, t);
    return { temp: t, type: lt };
  }

  throw new Error(`Unsupported logical operator: ${node.operator}`);
}

function visitConditionalExpression(node) {
  const { temp: cond } = this.visitExpression(node.test);
  const t = this.newTemp();
  const elseLabel = this.newLabel('tern_else');
  const endLabel = this.newLabel('tern_end');

  this.emit(OP.JUMP_IF_FALSE, cond, elseLabel);

  const { temp: consq, type: ct } = this.visitExpression(node.consequent);
  this.emit(OP.STORE_VAR, t, consq);
  this.emit(OP.JUMP, endLabel);

  this.emit(OP.LABEL, elseLabel);
  const { temp: alt } = this.visitExpression(node.alternate);
  this.emit(OP.STORE_VAR, t, alt);

  this.emit(OP.LABEL, endLabel);
  this.emit(OP.LOAD_VAR, t, t);

  return { temp: t, type: ct };
}

function visitSequenceExpression(node) {
  let result;
  for (const expr of node.expressions) {
    result = this.visitExpression(expr);
  }
  return result;
}

function visitThisExpression(node) {
  // 'this' is treated as a regular variable
  const t = this.newTemp();
  this.emit(OP.LOAD_VAR, t, 'this');
  const info = this.analyzer.currentScope.lookup('this');
  return { temp: t, type: info ? info.type : TYPE_INT };
}

function visitChainExpression(node) {
  // ChainExpression wraps a chain of optional member/call expressions.
  // We walk the inner expression, inserting null-checks at each optional step.
  const endLabel = this.newLabel('chain_end');
  const result = this.newTemp();

  const { temp, type } = this._visitChainInner(node.expression, endLabel, result);
  this.emit(OP.STORE_VAR, result, temp);
  this.emit(OP.LABEL, endLabel);
  this.emit(OP.LOAD_VAR, result, result);
  return { temp: result, type };
}

function _visitChainInner(node, endLabel, resultTemp) {
  // MemberExpression with optional: obj?.prop or obj?.[expr]
  if (node.type === 'MemberExpression') {
    let objResult;
    // Recursively handle chained optionals on the object side
    if (node.object.type === 'MemberExpression' && (node.object.optional || false)) {
      objResult = this._visitChainInner(node.object, endLabel, resultTemp);
    } else if (node.object.type === 'CallExpression' && (node.object.optional || false)) {
      objResult = this._visitChainInner(node.object, endLabel, resultTemp);
    } else {
      objResult = this.visitExpression(node.object);
    }

    // If this step is optional, emit null check
    if (node.optional) {
      const zeroTemp = this.newTemp();
      this.emit(OP.LOAD_INT, zeroTemp, 0);
      this.emit(OP.STORE_VAR, resultTemp, zeroTemp);
      this.emit(OP.JUMP_IF_FALSE, objResult.temp, endLabel);
    }

    // Now do the member access
    if (node.computed) {
      const prop = node.property;
      if (prop.type === 'Literal' && typeof prop.value === 'string') {
        const keyLabel = this.program.addString(prop.value);
        const t = this.newTemp();
        this.emit(OP.OBJ_GET, t, objResult.temp, keyLabel);
        return { temp: t, type: TYPE_INT };
      }
      const { temp: idxTemp } = this.visitExpression(prop);
      const t = this.newTemp();
      this.emit(OP.ARRAY_GET, t, objResult.temp, idxTemp);
      return { temp: t, type: TYPE_INT };
    } else {
      // .length special case
      if (node.property.name === 'length') {
        const t = this.newTemp();
        if (objResult.type === TYPE_STRING) {
          this.emit(OP.STR_LENGTH, t, objResult.temp);
        } else {
          this.emit(OP.ARRAY_LENGTH, t, objResult.temp);
        }
        return { temp: t, type: TYPE_INT };
      }
      const keyLabel = this.program.addString(node.property.name);
      const t = this.newTemp();
      this.emit(OP.OBJ_GET, t, objResult.temp, keyLabel);
      return { temp: t, type: TYPE_INT };
    }
  }

  // CallExpression with optional: obj?.method()
  if (node.type === 'CallExpression') {
    // For optional calls, we delegate to the normal visitCallExpression
    // but first handle the optional check on the callee
    if (node.optional && node.callee.type === 'MemberExpression') {
      // Evaluate the object first
      let objResult;
      if (node.callee.object.type === 'MemberExpression' && (node.callee.object.optional || false)) {
        objResult = this._visitChainInner(node.callee.object, endLabel, resultTemp);
      } else {
        objResult = this.visitExpression(node.callee.object);
      }

      const zeroTemp = this.newTemp();
      this.emit(OP.LOAD_INT, zeroTemp, 0);
      this.emit(OP.STORE_VAR, resultTemp, zeroTemp);
      this.emit(OP.JUMP_IF_FALSE, objResult.temp, endLabel);
    }
    // Delegate to normal call expression visitor
    return this.visitCallExpression(node);
  }

  // Not optional — just visit normally
  return this.visitExpression(node);
}

module.exports = {
  visitExpression,
  visitLiteral,
  visitIdentifier,
  visitBinaryExpression,
  visitUnaryExpression,
  visitTypeofExpression,
  visitLogicalExpression,
  visitConditionalExpression,
  visitSequenceExpression,
  visitThisExpression,
  visitChainExpression,
  _visitChainInner,
};
