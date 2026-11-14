'use strict';
// Capacitor 6 uses a default import; patched tar 7 exposes named CommonJS exports.
// Keep the Capacitor Android generation intact while removing vulnerable tar 6.
const fs=require('node:fs'),path=require('node:path');
const file=path.join(path.dirname(require.resolve('@capacitor/cli/package.json')),'dist/util/template.js');
const source=fs.readFileSync(file,'utf8');
const fixed='(tar_1.default || tar_1).extract';
if(source.includes(fixed))process.exit(0);
if(!source.includes('tar_1.default.extract'))throw Error('Capacitor tar integration changed; review the security compatibility shim before building.');
fs.writeFileSync(file,source.replace('tar_1.default.extract',fixed));
console.log('Applied Capacitor 6 / patched tar 7 compatibility shim.');
