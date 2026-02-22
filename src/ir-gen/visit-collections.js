'use strict';

const { OP } = require('../ir');
const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_ARRAY } = require('../types');

function visitMemberExpression(node) {
  // Constantes Math: Math.PI, Math.E
  if (!node.computed && node.object.type === 'Identifier' && node.object.name === 'Math' &&
      node.property.type === 'Identifier') {
    const mathConstants = {
      'PI': Math.PI,
      'E': Math.E,
      'LN2': Math.LN2,
      'LN10': Math.LN10,
      'LOG2E': Math.LOG2E,
      'LOG10E': Math.LOG10E,
      'SQRT2': Math.SQRT2,
      'SQRT1_2': Math.SQRT1_2,
    };
    const val = mathConstants[node.property.name];
    if (val !== undefined) {
      const t = this.newTemp();
      const label = this.program.addFloat(val);
      this.emit(OP.LOAD_FLOAT, t, label);
      return { temp: t, type: TYPE_FLOAT };
    }
  }

  // Constantes Number: Number.MAX_SAFE_INTEGER, etc.
  if (!node.computed && node.object.type === 'Identifier' && node.object.name === 'Number' &&
      node.property.type === 'Identifier') {
    const numberConstants = {
      'MAX_SAFE_INTEGER': 9007199254740991,
      'MIN_SAFE_INTEGER': -9007199254740991,
      'MAX_VALUE': 9007199254740991,  // aproximação para int
      'POSITIVE_INFINITY': 9007199254740991,
      'NEGATIVE_INFINITY': -9007199254740991,
      'EPSILON': 0,  // sem conceito de precisão float para ints
    };
    const val = numberConstants[node.property.name];
    if (val !== undefined) {
      const t = this.newTemp();
      this.emit(OP.LOAD_INT, t, val);
      return { temp: t, type: TYPE_INT };
    }
  }

  // Propriedade .length
  if (!node.computed && node.property.type === 'Identifier' && node.property.name === 'length') {
    const { temp: objTemp, type } = this.visitExpression(node.object);
    const t = this.newTemp();
    if (type === TYPE_STRING) {
      this.emit(OP.STR_LENGTH, t, objTemp);
    } else {
      this.emit(OP.ARRAY_LENGTH, t, objTemp);
    }
    return { temp: t, type: TYPE_INT };
  }

  // Acesso computado: arr[i] ou obj["key"]
  if (node.computed) {
    const { temp: objTemp } = this.visitExpression(node.object);
    const prop = node.property;
    // Chave string → acesso de propriedade de objeto
    if (prop.type === 'Literal' && typeof prop.value === 'string') {
      const keyLabel = this.program.addString(prop.value);
      const t = this.newTemp();
      this.emit(OP.OBJ_GET, t, objTemp, keyLabel);
      // Tenta inferir tipo a partir de tipos de propriedade conhecidos
      let propType = TYPE_INT;
      if (node.object.type === 'Identifier') {
        const info = this.analyzer.currentScope.lookup(node.object.name);
        if (info && info.propTypes && info.propTypes[prop.value] !== undefined) {
          propType = info.propTypes[prop.value];
        }
      }
      return { temp: t, type: propType };
    }
    // Índice numérico → acesso de array
    const { temp: idxTemp } = this.visitExpression(prop);
    const t = this.newTemp();
    this.emit(OP.ARRAY_GET, t, objTemp, idxTemp);
    // Infere tipo do elemento a partir de tipos de elementos conhecidos do array
    let elemType = TYPE_INT;
    if (node.object.type === 'Identifier') {
      const info = this.analyzer.currentScope.lookup(node.object.name);
      if (info && info.elemTypes) {
        // Se índice é número literal, usa tipo exato
        if (prop.type === 'Literal' && typeof prop.value === 'number' && info.elemTypes[prop.value] !== undefined) {
          elemType = info.elemTypes[prop.value];
        } else if (info.elemTypes.length > 0) {
          // Se todos os elementos são do mesmo tipo, usa esse; senão default para INT
          const allSame = info.elemTypes.every(t => t === info.elemTypes[0]);
          if (allSame) elemType = info.elemTypes[0];
        }
      }
    }
    return { temp: t, type: elemType };
  }

  // Acesso de propriedade não-computado: obj.prop
  if (!node.computed && node.property.type === 'Identifier') {
    // Checa se é acesso a getter em instância de classe
    if (node.object.type === 'Identifier') {
      const info = this.analyzer.currentScope.lookup(node.object.name);
      if (info && info.className && this._isGetter(info.className, node.property.name)) {
        const { temp: objTemp } = this.visitExpression(node.object);
        let qualClsName = info.className;
        const clsInfo = this.analyzer.currentScope.lookup(info.className);
        if (clsInfo && clsInfo.qualifiedName) qualClsName = clsInfo.qualifiedName;
        const getterName = this._resolveClassMethod(qualClsName, node.property.name);
        const t = this.newTemp();
        this.emit(OP.CALL, t, getterName, [{ temp: objTemp, type: TYPE_INT }]);
        return { temp: t, type: TYPE_INT };
      }
    }
    // Checa se this.prop é um getter
    if (node.object.type === 'Identifier' && node.object.name === 'this') {
      const thisInfo = this.analyzer.currentScope.lookup('this');
      if (thisInfo && thisInfo.className && this._isGetter(thisInfo.className, node.property.name)) {
        const { temp: objTemp } = this.visitExpression(node.object);
        let qualClsName = thisInfo.className;
        const clsInfo = this.analyzer.currentScope.lookup(thisInfo.className);
        if (clsInfo && clsInfo.qualifiedName) qualClsName = clsInfo.qualifiedName;
        const getterName = this._resolveClassMethod(qualClsName, node.property.name);
        const t = this.newTemp();
        this.emit(OP.CALL, t, getterName, [{ temp: objTemp, type: TYPE_INT }]);
        return { temp: t, type: TYPE_INT };
      }
    }

    const { temp: objTemp } = this.visitExpression(node.object);
    const keyLabel = this.program.addString(node.property.name);
    const t = this.newTemp();
    this.emit(OP.OBJ_GET, t, objTemp, keyLabel);
    // Tenta inferir tipo a partir de tipos de propriedade conhecidos
    let propType = TYPE_INT;
    if (node.object.type === 'Identifier') {
      const info = this.analyzer.currentScope.lookup(node.object.name);
      if (info && info.propTypes && info.propTypes[node.property.name] !== undefined) {
        propType = info.propTypes[node.property.name];
      }
    }
    return { temp: t, type: propType };
  }

  throw new Error(`Unsupported member expression: ${node.property.name || node.property.value}`);
}

function visitObjectExpression(node) {
  const hasSpread = node.properties.some(p => p.type === 'SpreadElement');

  // Checa chaves computadas ou shorthand de método que precisam de tratamento dinâmico
  const needsDynamic = hasSpread || node.properties.some(p =>
    p.type !== 'SpreadElement' && (p.computed || p.method)
  );

  if (!needsDynamic) {
    const keys = [];
    const values = [];
    const propTypes = {}; // mapeamento chave → tipo para rastreamento de tipo
    for (const prop of node.properties) {
      // Pega nome da chave
      const keyName = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
      const keyLabel = this.program.addString(keyName);
      keys.push(keyLabel);
      // Shorthand de propriedade: { x } → { x: x }
      if (prop.shorthand) {
        const { temp, type } = this.visitExpression(prop.key);
        values.push(temp);
        propTypes[keyName] = type;
      } else {
        const { temp, type } = this.visitExpression(prop.value);
        values.push(temp);
        propTypes[keyName] = type;
      }
    }
    const t = this.newTemp();
    this.emit(OP.OBJ_NEW, t, keys, values);
    return { temp: t, type: TYPE_INT, propTypes }; // TYPE_INT como ponteiro genérico
  }

  // Dinâmico: tem spread, chaves computadas ou shorthand de método
  const t = this.newTemp();
  this.emit(OP.OBJ_NEW, t, [], []);
  const propTypes = {};
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      const { temp: srcObj } = this.visitExpression(prop.argument);
      this.emit(OP.OBJ_SPREAD, t, srcObj);
    } else if (prop.computed) {
      // Chave computada: { [expr]: val }
      const { temp: keyTemp, type: keyType } = this.visitExpression(prop.key);
      // Converte chave para string se ainda não for
      let keyLabel;
      if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
        keyLabel = this.program.addString(prop.key.value);
      } else {
        // Chave dinâmica — converte para string e usa OBJ_SET com a string
        const keyStr = this.newTemp();
        if (keyType === TYPE_STRING) {
          // Já é um ponteiro de string, usa diretamente com abordagem dinâmica
          // Precisamos que OBJ_SET aceite ponteiros de string também — por enquanto converte
          keyLabel = null;
        } else {
          keyLabel = null;
        }
      }
      const { temp: valTemp, type: valType } = this.visitExpression(prop.value);
      if (keyLabel) {
        this.emit(OP.OBJ_SET, t, keyLabel, valTemp);
      } else {
        // Para chaves dinâmicas, converte para string e usa OBJ_SET
        // Como nosso OBJ_SET espera um label, vamos usar o valor da expressão da chave
        // como ponteiro de string em runtime
        this.emit(OP.OBJ_SET, t, keyTemp, valTemp);
      }
    } else if (prop.method) {
      // Shorthand de método: { foo() {} } → { foo: function() {} }
      const keyName = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
      const keyLabel = this.program.addString(keyName);
      const { temp: valTemp, type: valType } = this.visitExpression(prop.value);
      this.emit(OP.OBJ_SET, t, keyLabel, valTemp);
      propTypes[keyName] = valType;
    } else {
      const keyName = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
      const keyLabel = this.program.addString(keyName);
      let valTemp, valType;
      if (prop.shorthand) {
        ({ temp: valTemp, type: valType } = this.visitExpression(prop.key));
      } else {
        ({ temp: valTemp, type: valType } = this.visitExpression(prop.value));
      }
      this.emit(OP.OBJ_SET, t, keyLabel, valTemp);
      propTypes[keyName] = valType;
    }
  }
  return { temp: t, type: TYPE_INT, propTypes };
}

function visitArrayExpression(node) {
  const hasSpread = node.elements.some(e => e && e.type === 'SpreadElement');

  if (!hasSpread) {
    const elements = [];
    const elemTypes = [];
    for (const elem of node.elements) {
      const { temp, type } = this.visitExpression(elem);
      elements.push({ temp, type });
      elemTypes.push(type);
    }
    const t = this.newTemp();
    this.emit(OP.ARRAY_NEW, t, elements);
    return { temp: t, type: TYPE_ARRAY, elemTypes };
  }

  // Tem spread: cria array vazio, depois push/spread cada elemento
  const t = this.newTemp();
  this.emit(OP.ARRAY_NEW, t, []);
  for (const elem of node.elements) {
    if (!elem) continue;
    if (elem.type === 'SpreadElement') {
      const { temp: srcArr } = this.visitExpression(elem.argument);
      this.emit(OP.ARRAY_SPREAD, t, srcArr);
    } else {
      const { temp: valTemp, type: valType } = this.visitExpression(elem);
      this.emit(OP.ARRAY_PUSH, t, valTemp, valType);
    }
  }
  return { temp: t, type: TYPE_ARRAY, elemTypes: [] };
}

function visitTemplateLiteral(node) {
  // Constrói partes: alternando quasis (strings) e expressões
  const parts = [];
  for (let i = 0; i < node.quasis.length; i++) {
    const quasi = node.quasis[i];
    if (quasi.value.cooked.length > 0) {
      const label = this.program.addString(quasi.value.cooked);
      const st = this.newTemp();
      this.emit(OP.LOAD_STRING, st, label);
      parts.push({ temp: st, type: TYPE_STRING });
    }
    if (i < node.expressions.length) {
      const { temp, type } = this.visitExpression(node.expressions[i]);
      parts.push({ temp, type });
    }
  }

  const t = this.newTemp();
  this.emit(OP.TEMPLATE, t, parts);
  return { temp: t, type: TYPE_STRING };
}

module.exports = {
  visitMemberExpression,
  visitObjectExpression,
  visitArrayExpression,
  visitTemplateLiteral,
};
