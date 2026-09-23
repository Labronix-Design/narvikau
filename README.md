# Navrik Australia

Australian canopies-only deployment of the established Navrik Angular site. The
canonical public origin is `https://navrik.com.au`. This repository retains
catalogue browsing, quotes, contact, warranty, public content, analytics consent,
uploads, and administration; it does not contain a customer payment flow.

The application uses Angular 21, Netlify Functions, and a dedicated Netlify
Database. See [docs/netlify-au-configuration.md](docs/netlify-au-configuration.md)
for the non-secret setup checklist. Do not reuse another Navrik deployment's
database or email credentials.

## Install

```bash
npm ci
```

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Building

To build the project run:

```bash
npm run build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

The production build also generates the canopies-only sitemap, robots file, and
structured data for `navrik.com.au`.

## Verification

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
npm run test:functions
node --test src/generate-sitemap.test.cjs
npm run build
```

The workspace currently has no Angular unit-test target, so the production build
is the Angular compilation gate until that test infrastructure is added.
