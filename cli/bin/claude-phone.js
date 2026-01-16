#!/usr/bin/env node

// Early Node.js version check - ES5 compatible for old Node versions
// This MUST run before any ES module imports to catch version issues
var nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
var requiredMajor = 18;

if (nodeMajor < requiredMajor) {
  console.error('');
  console.error('\x1b[31m' + 'ERROR: Node.js version too old' + '\x1b[0m');
  console.error('  Current: v' + process.versions.node);
  console.error('  Required: v' + requiredMajor + '.0.0 or higher');
  console.error('');
  console.error('\x1b[33m' + 'To install Node.js ' + requiredMajor + '+:' + '\x1b[0m');
  console.error('  macOS/Linux: curl -fsSL https://fnm.vercel.app/install | bash');
  console.error('               fnm install 20 && fnm default 20');
  console.error('  Or visit: https://nodejs.org/');
  console.error('');
  process.exit(1);
}

// Node version OK - load the actual CLI
import('./cli-main.js');
