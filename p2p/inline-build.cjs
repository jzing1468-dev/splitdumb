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

// Inline JS files — preserve type="module" for ES module syntax
const jsMatches = [...result.matchAll(/src="(\.\/assets\/[^"]+\.js)"/g)];
for (const m of jsMatches) {
  const file = m[1].replace('./', '');
  let js = fs.readFileSync('dist-single/' + file, 'utf8');
  const escaped = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  result = result.replace(new RegExp('<script[^>]*src="' + escaped + '"[^>]*></script>'), '<script type="module">' + js + '</script>');
}

// CRITICAL: Escape </script> strings inside inline script blocks
// The HTML parser terminates <script> at the first </script> it finds,
// even if it's inside a JS string literal. We must replace these with
// <\/script> (which JS treats identically but HTML parser ignores).
result = result.replace(/<\/script>/gi, '<\\/script>');

// But we need the ACTUAL closing tag to remain. After the replacement above,
// all </script> are now <\/script>. We need to fix the real closing tag back.
// The real closing tag is the LAST one in each <script> block. Since we
// inlined everything into one <script> block, there's exactly one closing tag
// at the end. Find it and restore it.
// 
// Actually, the replacement above turned the real </script> into <\/script> too.
// We need a different approach: only escape </script> inside script content,
// not the actual closing tag.
//
// Let's redo this properly:
result = fs.readFileSync('dist-single/index.html', 'utf8');
result = result.replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '');
if (cssMatch) {
  const file2 = cssMatch[1].replace('./', '');
  const css2 = fs.readFileSync('dist-single/' + file2, 'utf8');
  result = result.replace(/<link[^>]*rel="stylesheet"[^>]*>/, '<style>' + css2 + '</style>');
}

// Build the combined JS content first, escaping </script> within it
let combinedJs = '';
for (const m2 of [...result.matchAll(/src="(\.\/assets\/[^"]+\.js)"/g)]) {
  const file3 = m2[1].replace('./', '');
  let js2 = fs.readFileSync('dist-single/' + file3, 'utf8');
  // Escape </script> inside JS — replace with <\/script> which JS treats the same
  js2 = js2.replace(/<\/script>/gi, '<\\/script>');
  combinedJs += js2;
}

// Remove the old script tags
result = result.replace(/<script[^>]*src="\.\/assets\/[^"]+\.js"[^>]*><\/script>/g, '');
// Also remove modulepreload that we missed
result = result.replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '');

// Insert the combined script block before </head> or before </body>
result = result.replace('</head>', '<script type="module">' + combinedJs + '</' + 'script></head>');

fs.writeFileSync('dist-single/index-inline.html', result);
console.log('Written:', result.length, 'bytes');

// Verify: count </script> occurrences
const count = (result.match(/<\/script>/gi) || []).length;
console.log('Closing </script> tags:', count);