const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { generateSitemap } = require('./generate-sitemap.js');

test('generates a public-only sitemap and one coherent Navrik publisher graph', () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'navrik-sitemap-'));
  const indexPath = path.join(outputDirectory, 'index.html');
  fs.writeFileSync(indexPath, '<html><head><script type="application/ld+json">{"@type":"Product","name":"Board game"}</script></head><body></body></html>');

  generateSitemap({ outputDirectory, today: '2026-08-24' });

  const sitemap = fs.readFileSync(path.join(outputDirectory, 'sitemap.xml'), 'utf8');
  const robots = fs.readFileSync(path.join(outputDirectory, 'robots.txt'), 'utf8');
  const index = fs.readFileSync(indexPath, 'utf8');
  assert.match(sitemap, /https:\/\/navrik\.com\.au\/products/);
  assert.doesNotMatch(sitemap, /navrik\.co\.za|\/accessories|\/finance/);
  assert.doesNotMatch(sitemap, /\/admin(?:\/|<)/);
  assert.match(robots, /Sitemap: https:\/\/navrik\.com\.au\/sitemap\.xml/);
  assert.doesNotMatch(robots, /navrik\.co\.za/);
  assert.match(robots, /Disallow: \/admin/);
  assert.doesNotMatch(index, /"@type":"Product"/);
  assert.match(index, /"@type":"LocalBusiness"/);
  assert.match(index, /"@type":"WebSite"/);
  const schemaJson = index.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
  assert.ok(schemaJson, 'the generated index should contain one JSON-LD graph');
  const schema = JSON.parse(schemaJson);
  const business = schema['@graph'].find((entry) => entry['@type'] === 'LocalBusiness');
  const website = schema['@graph'].find((entry) => entry['@type'] === 'WebSite');
  assert.equal(business.name, 'Navrik Trays, Canopies & Accessories');
  assert.deepEqual(business.areaServed, { '@type': 'Country', name: 'Australia' });
  assert.equal(business.logo, undefined, 'the static build must not publish a stale local logo');
  assert.equal(business.image, undefined, 'the static build must not publish a stale local logo');
  assert.equal(website.inLanguage, 'en-AU');
  assert.deepEqual(website.publisher, { '@id': 'https://navrik.com.au/#business' });
});

test('source metadata has no deleted local brand-logo fallback', () => {
  const sourceRoot = path.resolve(__dirname);
  const sourceFiles = [
    'index.html',
    path.join('website', 'website.component.ts'),
    path.join('website', '_services', 'site-settings.service.ts'),
    'generate-sitemap.js',
  ];

  for (const sourceFile of sourceFiles) {
    const content = fs.readFileSync(path.join(sourceRoot, sourceFile), 'utf8');
    assert.doesNotMatch(
      content,
      /assets\/brand-logo\/(?:navrik-primary\.jpg|NavrikLogo\.png)/,
      `${sourceFile} must not reference a local Navrik logo instead of the configured brand asset`,
    );
  }
});

test('public runtime metadata publishes the configured logo in one marked Organization graph', () => {
  const component = fs.readFileSync(path.join(__dirname, 'website', 'website.component.ts'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  assert.match(component, /data-navrik-configured-organization/);
  assert.match(component, /'@type': 'Organization'/);
  assert.match(component, /logo: logoUrl/);
  assert.match(component, /configuredLogoDocumentUrl\(configuredLogoUrl, this\.document\.location\.origin\)/);
  assert.match(component, /removeConfiguredBrandMetadata\(\)/);
  assert.match(index, /<link rel="icon" href="data:,">/);
});
