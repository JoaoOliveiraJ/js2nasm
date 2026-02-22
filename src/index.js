'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { generate } = require('astring');
const { IRGenerator } = require('./ir-generator');
const { IRProgram } = require('./ir');
const { CodeGenerator } = require('./codegen');
const { ModuleResolver } = require('./module-resolver');

/**
 * Transpile a single JS source string (backward-compatible, no module support).
 */
function transpile(source, options = {}) {
  // 1. Parse JS → AST using acorn
  const ast = acorn.parse(source, {
    ecmaVersion: 2022,
    sourceType: 'script',
    locations: true,
  });

  if (options.emitAst) {
    return { ast, astString: JSON.stringify(ast, null, 2) };
  }

  // 2. Generate IR from AST
  const irGen = new IRGenerator();
  const ir = irGen.generate(ast);

  if (options.emitIr) {
    return { ir, irString: formatIR(ir) };
  }

  // 3. Generate NASM from IR
  const codegen = new CodeGenerator(ir);
  const asm = codegen.generate();

  return { asm, ir, ast };
}

/**
 * Transpile a project starting from an entry file.
 * Resolves ES module imports recursively and merges into a single IR.
 * Falls back to single-file transpile() if no module syntax detected.
 */
function transpileProject(entryPath, options = {}) {
  const absEntry = path.resolve(entryPath);
  const source = fs.readFileSync(absEntry, 'utf-8');

  // Try to resolve modules
  const resolver = new ModuleResolver();
  const resolved = resolver.resolve(absEntry);

  // No module syntax — fall back to single-file transpile
  if (!resolved) {
    return transpile(source, options);
  }

  const { modules, order } = resolved;

  if (options.emitAst) {
    // Show AST for entry module only
    const entryInfo = modules.get(absEntry);
    return { ast: entryInfo.ast, astString: JSON.stringify(entryInfo.ast, null, 2) };
  }

  // Generate IR per module in topological order
  const moduleIRs = [];
  for (const absPath of order) {
    const modInfo = modules.get(absPath);
    const irGen = new IRGenerator(modInfo.id, modInfo, modules);
    const ir = irGen.generate(modInfo.ast);
    moduleIRs.push({ moduleInfo: modInfo, ir });
  }

  // Merge all IRs
  const mergedIR = mergeIRPrograms(moduleIRs);

  if (options.emitIr) {
    return { ir: mergedIR, irString: formatIR(mergedIR) };
  }

  // Generate NASM from merged IR
  const codegen = new CodeGenerator(mergedIR);
  const asm = codegen.generate();

  return { asm, ir: mergedIR };
}

/**
 * Merge multiple module IRs into a single IRProgram.
 * Order is topological (dependencies first, entry last).
 */
function mergeIRPrograms(moduleIRs) {
  const merged = new IRProgram();

  for (const { ir } of moduleIRs) {
    // Merge functions
    for (const func of ir.functions) {
      merged.functions.push(func);
    }

    // Merge main (top-level code) in topological order
    for (const inst of ir.main) {
      merged.main.push(inst);
    }

    // Merge strings (deduplicate by value)
    for (const s of ir.strings) {
      const existing = merged.strings.find(ms => ms.value === s.value);
      if (!existing) {
        merged.strings.push({ label: s.label, value: s.value });
      }
      // Note: labels stay as emitted by each module's IRGenerator.
      // Since each module has its own string counter, labels won't collide.
    }

    // Merge floats (deduplicate by value)
    for (const f of ir.floats) {
      const existing = merged.floats.find(mf => mf.value === f.value);
      if (!existing) {
        merged.floats.push({ label: f.label, value: f.value });
      }
    }

    // Merge globals
    for (const g of ir.globals) {
      merged.globals.add(g);
    }
  }

  return merged;
}

function formatIR(ir) {
  const lines = [];

  // Functions
  for (const func of ir.functions) {
    lines.push(`function ${func.name}(${func.params.join(', ')}):`);
    for (const inst of func.body) {
      lines.push(`  ${inst.toString()}`);
    }
    lines.push('');
  }

  // Main
  lines.push('main:');
  for (const inst of ir.main) {
    lines.push(`  ${inst.toString()}`);
  }

  // Data
  if (ir.strings.length > 0) {
    lines.push('\nstrings:');
    for (const s of ir.strings) {
      lines.push(`  ${s.label} = "${s.value}"`);
    }
  }

  if (ir.floats.length > 0) {
    lines.push('\nfloats:');
    for (const f of ir.floats) {
      lines.push(`  ${f.label} = ${f.value}`);
    }
  }

  return lines.join('\n');
}

module.exports = { transpile, transpileProject };
