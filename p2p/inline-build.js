const fs = require('fs');
const html = fs.readFileSync('dist-single/index.html', 'utf8');

let result = html;

// Remove modulepreload links
result = result.replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '');

// Inline CSS
const cssMatch = result.match(/href="(\.\/assets\/[^"]+\.css)"/);
if (cssMatch) {
  const file = cssMatch[1].replace('./', '');
  const css = fs.readFileSync('dist-single/' + file, 'utf8');
  result = result.replace(/<link[^>]*rel="stylesheet"[^>]*>/, '<style>' + css + '</style>');
}

// Inline JS files
const jsMatches = [...result.matchAll(/src="(\.\/assets\/[^"]+\.js)"/g)];
for (const m of jsMatches) {
  const file = m[1].replace('./', '');
  const js = fs.readFileSync('dist-single/' + file, 'utf8');
  const escaped = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  result = result.replace(new RegExp('<script[^>]*src="' + escaped + '"[^>]*></script>'), '<script>' + js + '</script>');
}

fs.writeFileSync('dist-single/index-inline.html', result);
console.log('Written:', result.length, 'bytes');