'use strict';

const { OP } = require('../ir');

function visitExportNamedDeclaration(node) {
  // `export function foo() {}` or `export const x = 1;`
  if (node.declaration) {
    this.visitStatement(node.declaration);
  }
  // `export { a, b }` — names already qualified via visitVariableDeclaration/visitFunctionDeclaration
}

function visitExportDefaultDeclaration(node) {
  if (node.declaration.type === 'FunctionDeclaration') {
    this.visitFunctionDeclaration(node.declaration);
  } else {
    // Expression default export — treat as variable assignment
    const { temp } = this.visitExpression(node.declaration);
    const name = this.qualifyName(`_default_${this.moduleId}`);
    if (!this.inFunction) {
      this.program.globals.add(name);
    }
    this.emit(OP.STORE_VAR, name, temp);
  }
}

function _buildImportMap() {
  for (const imp of this.moduleInfo.imports) {
    const depInfo = this.allModules.get(imp.from);
    if (!depInfo) continue;
    for (const spec of imp.specifiers) {
      // spec.imported is the name exported by the dep
      // spec.local is the name used in this module
      const exportedLocal = depInfo.exports.get(spec.imported);
      if (exportedLocal === undefined) {
        throw new Error(`Module '${depInfo.absPath}' does not export '${spec.imported}'`);
      }
      const qualifiedName = `${depInfo.id}__${exportedLocal}`;
      this.importMap.set(spec.local, qualifiedName);
    }
  }
}

module.exports = {
  visitExportNamedDeclaration,
  visitExportDefaultDeclaration,
  _buildImportMap,
};
