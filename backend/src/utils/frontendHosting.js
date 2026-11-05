/* eslint-disable security/detect-non-literal-fs-filename -- paths are built from our own build folder or a temp folder, never from user input (request paths are checked to stay inside the folder) */
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');

// Used when the API also serves the built React app (one container, one port; see the root Dockerfile and
// the Render section of the README). The API keeps its own strict policy (nothing may load from a JSON
// response); only the pages get the policy below, which is the same one nginx sends in the two-container setup.
const pageHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: 'no-referrer' },
});

// Sends API requests through the API's own header policy and everything else through the page policy.
function chooseHeaders(apiHeaders) {
  return (req, res, next) => (req.path.startsWith('/api') ? apiHeaders(req, res, next) : pageHelmet(req, res, next));
}

function mountFrontend(app, distDir) {
  const root = path.resolve(distDir);
  const indexFile = path.join(root, 'index.html');
  if (!fs.existsSync(indexFile)) throw new Error(`SERVE_FRONTEND is on but ${indexFile} does not exist.`);

  // Built files carry a hash in their name, so they can be cached for a year. index.html must never be.
  app.use('/assets', express.static(path.join(root, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  // Real files at the top level (favicon, robots.txt) are served by the static handler, which refuses anything outside the folder.
  app.use(express.static(root, { index: false, dotfiles: 'ignore', maxAge: 0 }));
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api')) return next();
    res.set('Cache-Control', 'no-cache');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    return res.sendFile(indexFile);
  });
}

module.exports = { chooseHeaders, mountFrontend };
