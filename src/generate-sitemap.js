const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://navrik.com.au';
const DEFAULT_OUTPUT_DIRECTORY = path.resolve(__dirname, '../dist/navrik');

const staticPages = [
  { path: '', priority: '1.0', changefreq: 'weekly' },
  { path: 'products', priority: '0.9', changefreq: 'weekly' },
  { path: 'contact', priority: '0.6', changefreq: 'monthly' },
  { path: 'refund-policy', priority: '0.4', changefreq: 'yearly' },
  { path: 'privacy', priority: '0.3', changefreq: 'yearly' },
  { path: 'terms', priority: '0.3', changefreq: 'yearly' },
  { path: 'register-warranty', priority: '0.3', changefreq: 'yearly' },
];

function navrikSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': `${BASE_URL}/#business`,
        name: 'Navrik Australia Canopies',
        url: BASE_URL,
        email: 'info@navrik.com.au',
        description: 'Aluminium canopies for Australian vehicles, backed by product guidance and tailored quotes.',
        areaServed: {
          '@type': 'Country',
          name: 'Australia',
        },
        address: {
          '@type': 'PostalAddress',
          addressCountry: 'AU',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${BASE_URL}/#website`,
        url: BASE_URL,
        name: 'Navrik',
        inLanguage: 'en-AU',
        publisher: { '@id': `${BASE_URL}/#business` },
      },
    ],
  };
}

function sitemapContent(today) {
  const entries = staticPages.map((page) => `
  <url>
    <loc>${BASE_URL}/${page.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}
</urlset>`;
}

function injectIndexOptimisations(indexContent, outputDirectory) {
  const files = fs.readdirSync(outputDirectory);
  const preloads = files
    .filter((file) => ['runtime', 'polyfills', 'main'].some((prefix) => file.startsWith(prefix)) && file.endsWith('.js'))
    .map((file) => `<link rel="modulepreload" href="${file}">`)
    .join('\n    ');

  let updated = indexContent
    .replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
    .replace(/<script\s+type="application\/ld\+json"[^>]*>.*?<\/script>\s*/gs, '');
  if (preloads) updated = updated.replace('<head>', `<head>\n    ${preloads}`);

  const schemaScript = `\n    <script type="application/ld+json">${JSON.stringify(navrikSchema())}</script>`;
  return updated.replace('</head>', `${schemaScript}\n</head>`);
}

function generateSitemap({ outputDirectory = DEFAULT_OUTPUT_DIRECTORY, today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!fs.existsSync(outputDirectory) || !fs.statSync(outputDirectory).isDirectory()) {
    throw new Error(`Configured build output directory does not exist: ${outputDirectory}`);
  }

  fs.writeFileSync(path.join(outputDirectory, 'sitemap.xml'), sitemapContent(today));
  fs.writeFileSync(path.join(outputDirectory, 'robots.txt'), `User-agent: *\nDisallow: /admin\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml`);

  const indexPath = path.join(outputDirectory, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error(`Build index.html not found: ${indexPath}`);
  fs.writeFileSync(indexPath, injectIndexOptimisations(fs.readFileSync(indexPath, 'utf8'), outputDirectory));

  return {
    outputDirectory,
    sitemapPath: path.join(outputDirectory, 'sitemap.xml'),
    robotsPath: path.join(outputDirectory, 'robots.txt'),
    indexPath,
  };
}

if (require.main === module) {
  try {
    generateSitemap();
    console.log('Sitemap, robots.txt, and Navrik LocalBusiness schema generated.');
  } catch (error) {
    console.error(`Sitemap generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
  }
}

module.exports = { generateSitemap };
