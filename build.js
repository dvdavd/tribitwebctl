const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const INPUT_HTML = 'index.html';
const OUTPUT_HTML = 'standalone.html';
const JS_ENTRY = 'js/main.js';
const CSS_FILE = 'styles/main.css';

const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

function getBase64(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = mimeTypes[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
}

function build() {
    console.log('Building standalone HTML...');

    // 1. Bundle JS using esbuild (IIFE format)
    console.log('Bundling JavaScript...');
    const bundledJs = esbuild.buildSync({
        entryPoints: [JS_ENTRY],
        bundle: true,
        minify: true,
        format: 'iife',
        write: false
    }).outputFiles[0].text;

    // 2. Read HTML
    let html = fs.readFileSync(INPUT_HTML, 'utf8');

    // Remove CSP for standalone version to ensure it works as a local file
    // Handle potential multiline CSP tags
    const cspRegex = /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*>/gis;
    html = html.replace(cspRegex, '');

    // 3. Remove manifest link (not useful for standalone file)
    html = html.replace(/<link rel="manifest" href="manifest\.webmanifest">/, '');

    // 4. Inline CSS
    console.log('Inlining CSS...');
    const cssContent = fs.readFileSync(CSS_FILE, 'utf8');
    html = html.replace(
        /<link rel="stylesheet" href="styles\/main\.css">/,
        `<style>\n${cssContent}\n</style>`
    );

    // 5. Inline JS
    console.log('Inlining JavaScript...');
    let bundledJsWithAssets = bundledJs;
    const jsAssetRegex = /"assets\/([^"]+)"/g;
    bundledJsWithAssets = bundledJsWithAssets.replace(jsAssetRegex, (match, assetPath) => {
        const fullPath = path.join(__dirname, 'assets', assetPath);
        if (fs.existsSync(fullPath)) {
            const base64 = getBase64(fullPath);
            console.log(`  Inlining JS asset: ${assetPath}`);
            return `"${base64}"`;
        }
        return match;
    });

    html = html.replace(
        /<script type="module" src="js\/main\.js"><\/script>/,
        `<script>\n${bundledJsWithAssets}\n</script>`
    );

    // 6. Convert Assets to Base64 (Images, Icons, etc.)
    console.log('Converting assets to data URIs...');
    const assetRegex = /(src|href)="assets\/([^"]+)"/g;
    html = html.replace(assetRegex, (match, attr, assetPath) => {
        const fullPath = path.join(__dirname, 'assets', assetPath);
        if (fs.existsSync(fullPath)) {
            const base64 = getBase64(fullPath);
            console.log(`  Inlining ${assetPath}`);
            return `${attr}="${base64}"`;
        }
        console.warn(`Warning: Asset not found: ${fullPath}`);
        return match;
    });

    // 7. Remove Service Worker registration from the bundled JS
    html = html.replace(/registerServiceWorker\(\);/, '// registerServiceWorker();');

    // 7. Write Output
    fs.writeFileSync(OUTPUT_HTML, html);
    console.log(`Successfully created ${OUTPUT_HTML}`);
}

try {
    build();
} catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
}
