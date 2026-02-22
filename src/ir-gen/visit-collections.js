'use strict';

const { OP } = require('../ir');
const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_ARRAY } = require('../types');

function visitMemberExpression(node) {
  // Math constants: Math.PI, Math.E
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

  // Number constants: Number.MAX_SAFE_INTEGER, etc.
  if (!node.computed && node.object.type === 'Identifier' && node.object.name === 'Number' &&
      node.property.type === 'Identifier') {
    const numberConstants = {
      'MAX_SAFE_INTEGER': 9007199254740991,
      'MIN_SAFE_INTEGER': -9007199254740991,
      'MAX_VALUE': 9007199254740991,  // approximate for int
      'POSITIVE_INFINITY': 9007199254740991,
      'NEGATIVE_INFINITY': -9007199254740991,
      'EPSILON': 0,  // no float precision concept for ints
    };
    const val = numberConstants[node.property.name];
    if (val !== undefined) {
      const t = this.newTemp();
      this.emit(OP.LOAD_INT, t, val);
      return { temp: t, type: TYPE_INT };
    }
  }

  // .length property
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

  // Computed access: arr[i] or obj["key"]
  if (node.computed) {
    const { temp: objTemp } = this.visitExpression(node.object);
    const prop = node.property;
    // String key → object property access
    if (prop.type === 'Literal' && typeof prop.value === 'string') {
      const keyLabel = this.program.addString(prop.value);
      const t = this.newTemp();
      this.emit(OP.OBJ_GET, t, objTemp, keyLabel);
      // Try to infer type from known object property types
      let propType = TYPE_INT;
      if (node.object.type === 'Identifier') {
        const info = this.analyzer.currentScope.lookup(node.object.name);
        if (info && info.propTypes && info.propTypes[prop.value] !== undefined) {
          propType = info.propTypes[prop.value];
        }
      }
      return { temp: t, type: propType };
    }
    // Numeric index → array access
    const { temp: idxTemp } = this.visitExpression(prop);
    const t = this.newTemp();
    this.emit(OP.ARRAY_GET, t, objTemp, idxTemp);
    // Infer element type from known array element types
    let elemType = TYPE_INT;
    if (node.object.type === 'Identifier') {
      const info = this.analyzer.currentScope.lookup(node.object.name);
      if (info && info.elemTypes) {
        // If index is a literal number, use exact type
        if (prop.type === 'Literal' && typeof prop.value === 'number' && info.elemTypes[prop.value] !== undefined) {
          elemType = info.elemTypes[prop.value];
        } else if (info.elemTypes.length > 0) {
          // If all elements same type, use that; otherwise default to INT
          const allSame = info.elemTypes.every(t => t === info.elemTypes[0]);
          if (allSame) elemType = info.elemTypes[0];
        }
      }
    }
    return { temp: t, type: elemType };
  }

  // Non-computed property access: obj.prop
  if (!node.computed && node.property.type === 'Identifier') {
    // Check if this is a getter access on a class instance
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
    // Check if this.prop is a getter
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
    // Try to infer type from known object property types
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

  // Check for computed keys or method shorthand that need dynamic handling
  const needsDynamic = hasSpread || node.properties.some(p =>
    p.type !== 'SpreadElement' && (p.computed || p.method)
  );

  if (!needsDynamic) {
    const keys = [];
    const values = [];
    const propTypes = {}; // key → type mapping for type tracking
    for (const prop of node.properties) {
      // Get key name
      const keyName = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
      const keyLabel = this.program.addString(keyName);
      keys.push(keyLabel);
      // Property shorthand: { x } → { x: x }
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
    return { temp: t, type: TYPE_INT, propTypes }; // TYPE_INT as generic pointer
  }

  // Dynamic: has spread, computed keys, or method shorthand
  const t = this.newTemp();
  this.emit(OP.OBJ_NEW, t, [], []);
  const propTypes = {};
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      const { temp: srcObj } = this.visitExpression(prop.argument);
      this.emit(OP.OBJ_SPREAD, t, srcObj);
    } else if (prop.computed) {
      // Computed key: { [expr]: val }
      const { temp: keyTemp, type: keyType } = this.visitExpression(prop.key);
      // Convert key to string if it's not already
      let keyLabel;
      if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
        keyLabel = this.program.addString(prop.key.value);
      } else {
        // Dynamic key — convert to string and use OBJ_SET with the string
        const keyStr = this.newTemp();
        if (keyType === TYPE_STRING) {
          // Already a string pointer, use it directly with a dynamic approach
          // We need OBJ_SET to accept string pointers too — for now convert
          keyLabel = null;
        } else {
          keyLabel = null;
        }
      }
      const { temp: valTemp, type: valType } = this.visitExpression(prop.value);
      if (keyLabel) {
        this.emit(OP.OBJ_SET, t, keyLabel, valTemp);
      } else {
        // For dynamic keys, convert to string and use OBJ_SET
        // Since our OBJ_SET expects a label, we'll use the key expression value
        // as a runtime string pointer
        this.emit(OP.OBJ_SET, t, keyTemp, valTemp);
      }
    } else if (prop.method) {
      // Method shorthand: { foo() {} } → { foo: function() {} }
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

  // Has spread: create empty array, then push/spread each element
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
  // Build parts: alternating quasis (strings) and expressions
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
