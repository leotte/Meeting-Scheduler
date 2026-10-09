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
});

test('styles and client scripts are wrapped as HTML includes', () => {
  assert.match(dist('styles.html'), /^<style>\n[\s\S]*<\/style>\n$/);
  for (const name of ['js_logic', 'js_dom', 'js_api']) {
    assert.match(dist(name + '.html'), /^<script>\n[\s\S]*<\/script>\n$/, name);
  }
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
