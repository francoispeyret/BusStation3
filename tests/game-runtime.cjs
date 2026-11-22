const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Follow the browser's script order, including when the game opens from file://.
module.exports = function gameRuntime() {
  const dist = path.join(__dirname, '../dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const context = vm.createContext({window:{}, Math:Object.create(Math)});
  for (const match of html.matchAll(/<script src="([^"?]+)/g)) {
    const file = match[1];
    if (file === 'world.js') break;
    if (file.startsWith('assets/')) continue;
    vm.runInContext(fs.readFileSync(path.join(dist, file), 'utf8'), context, {filename:file});
  }
  return context;
};
