const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT });

function dist(file) {
  return fs.readFileSync(path.join(ROOT, 'dist', file), 'utf8');
}

function preview(file) {
  return fs.readFileSync(path.join(ROOT, 'preview-dist', file), 'utf8');
}

test('dist holds the manifest and the server files', () => {
  for (const f of ['appsscript.json', 'logic.js', 'service.js', 'sheet_store.js', 'main.js']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist', f)), f);
  }
  assert.equal(JSON.parse(dist('appsscript.json')).timeZone, 'America/Indiana/Indianapolis');
  assert.equal(fs.existsSync(path.join(ROOT, 'dist', 'preview-shim.js')), false, 'preview shim must not ship');
});

test('styles and client scripts are wrapped as HTML includes', () => {
  assert.match(dist('styles.html'), /^<style>\n[\s\S]*<\/style>\n$/);
  for (const name of ['js_logic', 'js_dom', 'js_api']) {
    assert.match(dist(name + '.html'), /^<script>\n[\s\S]*<\/script>\n$/, name);
  }
  assert.ok(dist('js_logic.html').includes('var Logic = (function () {'), 'js_logic carries the Logic module');
});

test('page templates are copied unchanged into dist', () => {
  assert.equal(dist('message.html'), fs.readFileSync(path.join(ROOT, 'src', 'client', 'message.html'), 'utf8'));
});

test('preview pages have every scriptlet resolved', () => {
  const html = preview('message.html');
  assert.equal(html.indexOf('<?'), -1);
  assert.match(html, /PreviewShim\.boot\("message"\)/);
  assert.match(html, /<script src="preview-shim\.js"><\/script>/);
  assert.ok(fs.existsSync(path.join(ROOT, 'preview-dist', 'index.html')));
  assert.ok(fs.existsSync(path.join(ROOT, 'preview-dist', 'service.js')));
});

test('organizer page and its scripts are built', () => {
  assert.match(dist('organizer.html'), /<\?!= include\('js_organizer'\) \?>/);
  for (const name of ['js_grid', 'js_organizer']) {
    assert.match(dist(name + '.html'), /^<script>\n[\s\S]*<\/script>\n$/, name);
  }
  const html = preview('organizer.html');
  assert.equal(html.indexOf('<?'), -1);
  assert.match(html, /PreviewShim\.boot\("organizer"\)/);
  assert.match(html, /<div id="dialog-root"><\/div>/);
});
