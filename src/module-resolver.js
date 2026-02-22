'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

/**
 * Resolves ES module imports recursively from an entry file.
 * Builds a dependency graph, performs topological sort, and detects cycles.
 */
class ModuleResolver {
  constructor() {
    this.modules = new Map(); // absPath → ModuleInfo
    this.order = [];          // topologically sorted absPath[]
    this.nextId = 0;
  }

  /**
   * Resolve all modules starting from the entry file.
   * Returns { modules: Map<absPath, ModuleInfo>, order: string[] }
   *
   * ModuleInfo: { id: 'mod0', absPath, source, ast, exports: Map, imports: [] }
   */
  resolve(entryPath) {
    const absEntry = path.resolve(entryPath);
    if (!fs.existsSync(absEntry)) {
      throw new Error(`Entry file not found: ${absEntry}`);
    }

    // Check if entry uses module syntax
    const entrySource = fs.readFileSync(absEntry, 'utf-8');
    if (!this._usesModuleSyntax(entrySource)) {
      return null; // signal: use single-file path
    }

    // DFS to discover all modules
    const visiting = new Set(); // cycle detection (gray nodes)
    const visited = new Set();  // fully processed (black nodes)

    this._visit(absEntry, visiting, visited);

    return {
      modules: this.modules,
      order: this.order, // dependencies first, entry last
    };
  }

  _visit(absPath, visiting, visited) {
    if (visited.has(absPath)) return;

    if (visiting.has(absPath)) {
      throw new Error(`Circular dependency detected involving: ${absPath}`);
    }

    visiting.add(absPath);

    const source = fs.readFileSync(absPath, 'utf-8');
    const ast = acorn.parse(source, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
    });

    const moduleInfo = {
      id: `mod${this.nextId++}`,
      absPath,
      source,
      ast,
      exports: new Map(),  // exportedName → localName
      imports: [],          // { from: absPath, specifiers: [{imported, local}] }
    };

    // Scan for imports and exports
    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration') {
        const fromPath = this._resolveSpecifier(node.source.value, absPath);
        const specifiers = [];
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') {
            specifiers.push({
              imported: spec.imported.name,
              local: spec.local.name,
            });
          } else if (spec.type === 'ImportDefaultSpecifier') {
            specifiers.push({
              imported: 'default',
              local: spec.local.name,
            });
          }
        }
        moduleInfo.imports.push({ from: fromPath, specifiers });

        // Recurse into dependency
        this._visit(fromPath, visiting, visited);
      } else if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration) {
          if (node.declaration.type === 'FunctionDeclaration') {
            const name = node.declaration.id.name;
            moduleInfo.exports.set(name, name);
          } else if (node.declaration.type === 'VariableDeclaration') {
            for (const decl of node.declaration.declarations) {
              moduleInfo.exports.set(decl.id.name, decl.id.name);
            }
          }
        }
        if (node.specifiers) {
          for (const spec of node.specifiers) {
            moduleInfo.exports.set(spec.exported.name, spec.local.name);
          }
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
          moduleInfo.exports.set('default', node.declaration.id.name);
        } else if (node.declaration.type === 'Identifier') {
          moduleInfo.exports.set('default', node.declaration.name);
        } else {
          // anonymous default export — give it a synthetic name
          moduleInfo.exports.set('default', `_default_${moduleInfo.id}`);
        }
      }
    }

    this.modules.set(absPath, moduleInfo);

    visiting.delete(absPath);
    visited.add(absPath);
    this.order.push(absPath); // post-order = topological order
  }

  /**
   * Resolve a relative specifier to an absolute path.
   * Adds .js extension if missing.
   */
  _resolveSpecifier(specifier, fromPath) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      throw new Error(`Bare specifiers not supported: '${specifier}' in ${fromPath}`);
    }

    const dir = path.dirname(fromPath);
    let resolved = path.resolve(dir, specifier);

    // Add .js if missing
    if (!path.extname(resolved)) {
      resolved += '.js';
    }

    if (!fs.existsSync(resolved)) {
      throw new Error(`Module not found: '${specifier}' (resolved to ${resolved}) imported from ${fromPath}`);
    }

    return resolved;
  }

  /**
   * Quick check: does the source contain import or export statements?
   */
  _usesModuleSyntax(source) {
    // Try parsing as module and check for import/export nodes
    try {
      const ast = acorn.parse(source, {
        ecmaVersion: 2022,
        sourceType: 'module',
        locations: true,
      });
      for (const node of ast.body) {
        if (node.type === 'ImportDeclaration' ||
            node.type === 'ExportNamedDeclaration' ||
            node.type === 'ExportDefaultDeclaration' ||
            node.type === 'ExportAllDeclaration') {
          return true;
        }
      }
    } catch (e) {
      // Not valid module syntax — treat as script
    }
    return false;
  }
}

module.exports = { ModuleResolver };
