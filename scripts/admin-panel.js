/**
 * Custom Admin Panel for Hexo + hexo-admin
 * Replaces the default admin UI with a modern, Soar-themed interface
 * while preserving hexo-admin's backend API and authentication.
 */

const path = require('path');
const fs = require('fs');
const urlParser = require('url');

const adminUiPath = path.join(hexo.base_dir, 'admin-ui');
const passwordProtected = hexo.config.admin && hexo.config.admin.username;

// Helper to serve a static file
function serveStaticFile(filePath, res) {
  try {
    if (!fs.existsSync(filePath)) return false;
    var stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;

    // Determine content type
    var ext = path.extname(filePath).toLowerCase();
    var mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };
    var mime = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch (e) {
    return false;
  }
}

// Register with priority 0 (highest) to run BEFORE hexo-admin's default static serving
hexo.extend.filter.register('server_middleware', function (app) {
  // Normalize root: default is '/', treat '/' as empty for path construction
  var root = hexo.config.root || '';
  if (root === '/') root = '';
  root = root.replace(/^\/+|\/+$/g, ''); // remove leading/trailing slashes
  const adminBase = (root ? '/' + root : '') + '/admin';
  const adminBaseSlash = adminBase + '/';

  // === Auth (reuse hexo-admin's auth module) ===
  if (passwordProtected) {
    if (!hexo.config.admin.password_hash) {
      hexo.log.error('[custom-admin] config admin.password_hash is required');
    } else if (hexo.config.admin.password_hash.length <= 32) {
      throw new Error('[custom-admin] password_hash must be bcrypt, not md5');
    } else if (!hexo.config.admin.secret) {
      hexo.log.error('[custom-admin] config admin.secret is required');
    } else {
      try {
        require('../node_modules/hexo-admin/auth')(app, hexo);
        hexo.log.info('[custom-admin] Authentication enabled');
      } catch (err) {
        hexo.log.error('[custom-admin] Auth setup failed:', err.message);
      }
    }
  }

  // Intercept /admin/ routes and serve custom UI files
  app.use(function (req, res, next) {
    var parsedUrl = urlParser.parse(req.url || '');
    var url = parsedUrl.pathname || '';

    // Only intercept admin routes (not API, not login)
    if (url.indexOf(adminBaseSlash) !== 0 && url !== adminBase) return next();
    if (url.indexOf(adminBaseSlash + 'api/') === 0) return next();
    // Serve login page from custom UI
    if (url.indexOf(adminBaseSlash + 'login') === 0) {
      var loginPath = path.join(adminUiPath, 'login.html');
      if (serveStaticFile(loginPath, res)) return;
      return next();
    }

    if (url === adminBase) {
      res.writeHead(302, {
        Location: adminBaseSlash + (parsedUrl.search || ''),
      });
      res.end();
      return;
    }

    // Extract relative path
    var relativePath = url.slice(adminBaseSlash.length) || '';

    // Serve index.html for root admin path
    if (relativePath === '' || relativePath === '/') {
      var indexPath = path.join(adminUiPath, 'index.html');
      if (serveStaticFile(indexPath, res)) return;
      return next();
    }

    // Serve static assets from admin-ui/{css,js,assets}/
    var segments = relativePath.split('/').filter(Boolean);
    var firstSegment = segments[0];
    var staticDirs = { css: 'css', js: 'js', assets: 'assets' };

    if (firstSegment && staticDirs[firstSegment]) {
      var subPath = segments.slice(1).join('/');
      var filePath = path.join(adminUiPath, staticDirs[firstSegment], subPath);
      if (serveStaticFile(filePath, res)) return;
    }

    return next();
  });

}, 0);

hexo.log.info('[custom-admin] Modern admin panel ready at /admin/');
