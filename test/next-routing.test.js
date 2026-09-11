const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const frontendRoots = [path.join(root, 'frontend', 'app'), path.join(root, 'frontend', 'lib')];
const nextConfig = fs.readFileSync(path.join(root, 'frontend', 'next.config.ts'), 'utf8');
const proxyConfig = fs.readFileSync(path.join(root, 'deploy', 'proelium-next-proxy.example.conf'), 'utf8');
const legacyApp = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(tsx?|ts)$/.test(entry.name) ? [entryPath] : [];
  });
}

function apiReferences() {
  const references = new Set();
  const pattern = /["'`](\/api\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)/gi;
  for (const file of frontendRoots.flatMap(sourceFiles)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) references.add(match[1]);
  }
  return [...references].sort();
}

test('APIs usadas pelo Next possuem rewrite e proxy publicados', () => {
  const localNextRoutes = new Set(['/api/auth/login']);
  const rootHandledAuth = new Set(['/api/auth/logout', '/api/auth/google', '/api/auth/google/callback']);
  const missingRewrite = [];
  const missingProxy = [];
  for (const route of apiReferences()) {
    const familyRoute = route.split('/').slice(0, 3).join('/');
    const hasRewrite = nextConfig.includes(`source: '${route}'`) || nextConfig.includes(`source: '${familyRoute}/:path*'`);
    if (!localNextRoutes.has(route) && !rootHandledAuth.has(route) && !hasRewrite) missingRewrite.push(route);
    if (route.startsWith('/api/auth/')) continue;
    const family = route.split('/')[2];
    const covered = family === 'company' ? proxyConfig.includes('company/(') : proxyConfig.includes(family);
    if (!covered) missingProxy.push(route);
  }
  assert.deepEqual(missingRewrite, [], `rewrites ausentes: ${missingRewrite.join(', ')}`);
  assert.deepEqual(missingProxy, [], `famílias ausentes no proxy: ${missingProxy.join(', ')}`);
});
test('atalho de projeto em andamento preserva a visao de detalhe', () => {
  assert.match(legacyApp, /'projectDetail','serviceOrderDetail'/);
  assert.match(legacyApp, /if\(view==='projectDetail'\)return canViewRole\('projects',role\)/);
  assert.match(legacyApp, /data-dashboard-project/);
  assert.match(legacyApp, /state\.view='projectDetail';render\(\)/);
});
test('produtos compativeis ficam separados por area tecnica', () => {
  assert.match(legacyApp, /const productAreas=\['network','automation','audio-video','cameras'\]/);
  assert.match(legacyApp, /network:'Rede',automation:'Automacao','audio-video':'Audio e Video',cameras:'Cameras'/);
});
