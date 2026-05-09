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

// Build the combined JS content, escaping </script> inside JS
let combinedJs = '';
const jsMatches = [...result.matchAll(/src="(\.\/assets\/[^"]+\.js)"/g)];
for (const m of jsMatches) {
  const file = m[1].replace('./', '');
  let js = fs.readFileSync('dist-single/' + file, 'utf8');
  // Escape </script> inside JS — HTML parser terminates at first </script>
  js = js.replace(/<\/script>/gi, '<\\/script>');
  combinedJs += js;
}

// Remove the old script tags
result = result.replace(/<script[^>]*src="\.\/assets\/[^"]+\.js"[^>]*><\/script>/g, '');

// Insert as a plain <script> (NOT module) — same as the old working build
result = result.replace('</head>', '<script>' + combinedJs + '</' + 'script></head>');

fs.writeFileSync('dist-single/index-inline.html', result);
console.log('Written:', result.length, 'bytes');

// Verify: count script tags
const opening = (result.match(/<script[^>]*>/g) || []).length;
const closing = (result.match(/<\/script>/gi) || []).length;
console.log('Opening script tags:', opening);
console.log('Closing script tags:', closing);