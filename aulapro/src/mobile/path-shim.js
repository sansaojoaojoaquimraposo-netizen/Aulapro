'use strict';
const join = (...p) => p.join('/').replace(/\/+/g, '/');
const basename = (p, ext) => { let b = String(p).split(/[\\/]/).pop(); if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length); return b; };
const extname = (p) => { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
const dirname = (p) => String(p).replace(/\/[^/]*$/, '') || '/';
module.exports = { join, basename, extname, dirname, sep: '/' };
