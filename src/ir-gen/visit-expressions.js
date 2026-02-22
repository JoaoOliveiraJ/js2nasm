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

  // Constantes globais
  if (node.name === 'undefined') {
    this.emit(OP.LOAD_UNDEFINED, t);
    return { temp: t, type: TYPE_INT };
  }
  if (node.name === 'Infinity') {
    this.emit(OP.LOAD_INT, t, 9007199254740991); // MAX_SAFE_INTEGER como aproximação
    return { temp: t, type: TYPE_INT };
  }
  if (node.name === 'NaN') {
    this.emit(OP.LOAD_INT, t, 0); // NaN aproximado como 0
    return { temp: t, type: TYPE_INT };
  }

  const info = this.analyzer.currentScope.lookup(node.name);

  // Resolve o nome da variável: importMap → qualified global → nome bruto
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

  // Concatenação de strings
  if (node.operator === '+' && (lt === TYPE_STRING || rt === TYPE_STRING)) {
    this.emit(OP.STR_CONCAT, t, left, right, lt, rt);
    return { temp: t, type: TYPE_STRING };
  }

  // Comparação de strings: usa comparação baseada em strcmp
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

  // instanceof — checa className do analyzer
  if (node.operator === 'instanceof') {
    // Checa se o operando esquerdo tem className correspondente ao nome do operando direito
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
  // typeof é especial — argumento pode ser identificador indefinido
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
    // delete obj.prop (acesso por ponto)
    if (node.argument.type === 'MemberExpression' && !node.argument.computed) {
      const { temp: objTemp } = this.visitExpression(node.argument.object);
      const keyLabel = this.program.addString(node.argument.property.name);
      this.emit(OP.OBJ_DELETE, objTemp, keyLabel);
      this.emit(OP.LOAD_BOOL, t, 1);
      return { temp: t, type: TYPE_BOOL };
    }
    // delete obj["key"] (acesso por colchete)
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
    // typeof em variável não declarada retorna "undefined"
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
    // resultado é o valor da direita
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

  // ?? (nullish coalescing) — sem type tags em runtime, se comporta como ||
  // (checa falsy, não só null/undefined)
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
  // 'this' é tratado como uma variável normal
  const t = this.newTemp();
  this.emit(OP.LOAD_VAR, t, 'this');
  const info = this.analyzer.currentScope.lookup('this');
  return { temp: t, type: info ? info.type : TYPE_INT };
}

function visitChainExpression(node) {
  // ChainExpression envolve uma cadeia de expressões member/call opcionais.
  // Percorremos a expressão interna, inserindo checagens de null em cada passo opcional.
  const endLabel = this.newLabel('chain_end');
  const result = this.newTemp();

  const { temp, type } = this._visitChainInner(node.expression, endLabel, result);
  this.emit(OP.STORE_VAR, result, temp);
  this.emit(OP.LABEL, endLabel);
  this.emit(OP.LOAD_VAR, result, result);
  return { temp: result, type };
}

function _visitChainInner(node, endLabel, resultTemp) {
  // MemberExpression com optional: obj?.prop ou obj?.[expr]
  if (node.type === 'MemberExpression') {
    let objResult;
    // Lida recursivamente com optionals encadeados no lado do objeto
    if (node.object.type === 'MemberExpression' && (node.object.optional || false)) {
      objResult = this._visitChainInner(node.object, endLabel, resultTemp);
    } else if (node.object.type === 'CallExpression' && (node.object.optional || false)) {
      objResult = this._visitChainInner(node.object, endLabel, resultTemp);
    } else {
      objResult = this.visitExpression(node.object);
    }

    // Se esse passo é opcional, emite checagem de null
    if (node.optional) {
      const zeroTemp = this.newTemp();
      this.emit(OP.LOAD_INT, zeroTemp, 0);
      this.emit(OP.STORE_VAR, resultTemp, zeroTemp);
      this.emit(OP.JUMP_IF_FALSE, objResult.temp, endLabel);
    }

    // Agora faz o acesso ao membro
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
      // Caso especial de .length
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

  // CallExpression com optional: obj?.method()
  if (node.type === 'CallExpression') {
    // Para chamadas opcionais, delegamos ao visitCallExpression normal
    // mas primeiro tratamos a checagem opcional no callee
    if (node.optional && node.callee.type === 'MemberExpression') {
      // Avalia o objeto primeiro
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
    // Delega ao visitor normal de call expression
    return this.visitCallExpression(node);
  }

  // Não é opcional — visita normalmente
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
