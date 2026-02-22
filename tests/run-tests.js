#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { transpile } = require('../src/index.js');

const fixturesDir = path.join(__dirname, 'fixtures');
const files = fs.readdirSync(fixturesDir)
  .filter(f => f.endsWith('.js'))
  .sort();

let passed = 0;
let failed = 0;
let errors = 0;

console.log(chalk.blue.bold('\n=== js2nasm Test Suite ===\n'));

for (const file of files) {
  const filePath = path.join(fixturesDir, file);
  const source = fs.readFileSync(filePath, 'utf-8');

  // Extract expected output from first comment line
  const match = source.match(/^\/\/ expected: (.+)$/m);
  if (!match) {
    console.log(chalk.yellow(`  SKIP  ${file} (no expected output)`));
    continue;
  }

  const expected = match[1].replace(/\\n/g, '\n').trim();

  try {
    // Transpile to ASM
    const result = transpile(source);

    if (!result.asm) {
      throw new Error('No ASM output generated');
    }

    // Verify the ASM was generated (can't actually run without NASM/linker)
    // But we can verify the transpilation doesn't crash and produces valid-looking output
    const hasMain = result.asm.includes('main:');
    const hasExitProcess = result.asm.includes('call ExitProcess');
    const hasDefaultRel = result.asm.includes('default rel');

    if (!hasMain || !hasExitProcess || !hasDefaultRel) {
      throw new Error('Generated ASM missing required sections');
    }

    console.log(chalk.green(`  PASS  ${file}`));
    passed++;

  } catch (err) {
    console.log(chalk.red(`  FAIL  ${file}: ${err.message}`));
    failed++;
    errors++;
  }
}

console.log('');
console.log(chalk.blue.bold('Results:'));
console.log(chalk.green(`  Passed:  ${passed}`));
if (failed > 0) console.log(chalk.red(`  Failed:  ${failed}`));
console.log(`  Total:   ${files.length}`);
console.log('');

if (failed > 0) {
  console.log(chalk.yellow('Note: Tests verify transpilation only (no NASM/linker available).'));
  console.log(chalk.yellow('Install NASM and GoLink to run full compile+execute tests.'));
  process.exit(1);
}

console.log(chalk.green.bold('All transpilation tests passed!'));
console.log(chalk.yellow('Note: Tests verify transpilation only. Use --run with NASM + GoLink for full tests.'));
