#!/usr/bin/env node
/*
 * Builds two folders from src/:
 *   dist/          pushed (clasp) or pasted into Apps Script
 *   preview-dist/  static pages for a local click-through; google.script.run
 *                  is replaced by preview/preview-shim.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const CLIENT = path.join(SRC, 'client');
const DIST = path.join(ROOT, 'dist');
const PREVIEW = path.join(ROOT, 'preview-dist');
const SERVER_FILES = ['shared/logic.js', 'shared/service.js', 'server/sheet_store.js', 'server/main.js'];
const BOOT_LINE = '<script>window.BOOT = <?!= bootJson ?>;</script>';
const INCLUDE = /<\?!= include\('([a-z_]+)'\) \?>/g;

function read(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

function reset(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function clientFiles(ext) {
  return fs.readdirSync(CLIENT).filter((f) => f.endsWith(ext)).sort();
}

function wrapScript(code) {
  if (/<\/script/i.test(code)) throw new Error('Script source must not contain "</script" (any case)');
  return '<script>\n' + code + '</script>\n';
}

function wrapStyle(css) {
  if (/<\/style/i.test(css)) throw new Error('Stylesheet source must not contain "</style" (any case)');
  return '<style>\n' + css + '</style>\n';
}

function collectIncludes() {
  const includes = {
    styles: wrapStyle(read('client/styles.css')),
    js_logic: wrapScript(read('shared/logic.js'))
  };
  clientFiles('.js').forEach((f) => {
    includes['js_' + path.basename(f, '.js')] = wrapScript(read('client/' + f));
  });
  return includes;
}

function buildDist(includes, pages) {
  reset(DIST);
  fs.copyFileSync(path.join(SRC, 'appsscript.json'), path.join(DIST, 'appsscript.json'));
  SERVER_FILES.forEach((rel) => fs.writeFileSync(path.join(DIST, path.basename(rel)), read(rel)));
  Object.keys(includes).forEach((name) => fs.writeFileSync(path.join(DIST, name + '.html'), includes[name]));
  pages.forEach((page) => fs.writeFileSync(path.join(DIST, page), read('client/' + page)));
}

function buildPreview(includes, pages) {
  reset(PREVIEW);
  fs.writeFileSync(path.join(PREVIEW, 'logic.js'), read('shared/logic.js'));
  fs.writeFileSync(path.join(PREVIEW, 'service.js'), read('shared/service.js'));
  fs.copyFileSync(path.join(ROOT, 'preview', 'preview-shim.js'), path.join(PREVIEW, 'preview-shim.js'));
  pages.forEach((page) => {
    const name = path.basename(page, '.html');
    let html = read('client/' + page);
    if (html.indexOf(BOOT_LINE) === -1) throw new Error(page + ' is missing the BOOT line');
    html = html.replace(INCLUDE, (match, inc) => {
      if (!includes[inc]) throw new Error(page + ' includes unknown file ' + inc);
      return includes[inc];
    });
    html = html.replace(BOOT_LINE, () => [
      '<script src="logic.js"></script>',
      '<script src="service.js"></script>',
      '<script src="preview-shim.js"></script>',
      '<script>window.BOOT = PreviewShim.boot(' + JSON.stringify(name) + ');</script>'
    ].join('\n'));
    if (html.indexOf('<?') !== -1) throw new Error(page + ' still has an unprocessed scriptlet');
    html = html.replace('<head>', () => '<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Preview: ' + name + '</title>');
    fs.writeFileSync(path.join(PREVIEW, page), html);
  });
  const links = pages.map((p) => '<li><a href="' + p + '">' + p + '</a></li>').join('');
  fs.writeFileSync(path.join(PREVIEW, 'index.html'), '<!DOCTYPE html><meta charset="utf-8"><title>Preview</title>' +
    '<h1>Meeting Scheduler preview</h1><ul>' + links + '</ul>');
}

const includes = collectIncludes();
const pages = clientFiles('.html');
buildDist(includes, pages);
buildPreview(includes, pages);
console.log('Built dist/ (' + fs.readdirSync(DIST).length + ' files) and preview-dist/ (' + pages.length + ' pages)');
