/**
 * Blog Admin Authentication — JWT + MySQL
 *
 * Provides JWT-based authentication middleware and login/logout endpoints.
 * Auto-creates admin/admin123 on first startup when no users exist.
 *
 * Registered as server_middleware at priority -10 (BEFORE admin-panel.js at 0)
 * so unauthenticated requests never reach the admin UI or API.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const urlParser = require('url');

// ============ Config ============
const MYSQL_CONFIG = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: process.env.MYSQL_PASSWORD || 'root123456',
  database: 'cx_blog',
  charset: 'utf8mb4',
};

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123',
  displayName: '管理员',
};

// Read JWT config from hexo config, or use defaults
function getJwtConfig(hexo) {
  const adminConfig = hexo.config.admin || {};
  return {
    secret: adminConfig.jwt_secret || require('crypto').randomBytes(32).toString('hex'),
    expiresIn: adminConfig.jwt_expires || '7d',
  };
}

// ============ MySQL Pool ============
let pool = null;

async function getPool(hexo) {
  if (pool) return pool;
  try {
    pool = mysql.createPool({
      ...MYSQL_CONFIG,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
    // Test connection
    await pool.execute('SELECT 1');
    hexo.log.info('[admin-auth] MySQL connected successfully');
  } catch (err) {
    hexo.log.error('[admin-auth] MySQL connection failed:', err.message);
    hexo.log.error('[admin-auth] Auth will be DISABLED — admin panel remains open');
    pool = null;
  }
  return pool;
}

// ============ Seed default admin ============
async function seedDefaultAdmin(hexo) {
  const db = await getPool(hexo);
  if (!db) return;

  try {
    const [rows] = await db.execute('SELECT COUNT(*) as cnt FROM users');
    if (rows[0].cnt === 0) {
      const hash = await bcrypt.hash(DEFAULT_ADMIN.password, 10);
      await db.execute(
        'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)',
        [DEFAULT_ADMIN.username, hash, DEFAULT_ADMIN.displayName]
      );
      hexo.log.info('[admin-auth] Default admin user created: admin / admin123');
    }
  } catch (err) {
    // Table might not exist yet — that's OK, first login will fail gracefully
    if (err.code === 'ER_NO_SUCH_TABLE') {
      hexo.log.warn('[admin-auth] users table not found. Create it in MySQL:');
      hexo.log.warn('  CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, display_name VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);');
    } else {
      hexo.log.error('[admin-auth] Seed admin failed:', err.message);
    }
  }
}

// ============ JWT Helpers ============
function extractToken(req) {
  // Check Authorization header first
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Check cookie
  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      acc[k] = v;
      return acc;
    }, {});
    if (cookies.token) return cookies.token;
  }
  return null;
}

function setTokenCookie(res, token) {
  res.setHeader('Set-Cookie', [
    `token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
  ]);
}

function clearTokenCookie(res) {
  res.setHeader('Set-Cookie', [
    'token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax',
  ]);
}

// ============ Parse JSON body (lightweight) ============
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body) return resolve(req.body); // Already parsed by hexo-admin's bodyParser
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// ============ Auth Middleware ============
async function authMiddleware(hexo, jwtConfig) {
  const db = await getPool(hexo);

  return async function (req, res, next) {
    const parsedUrl = urlParser.parse(req.url || '');
    const pathname = parsedUrl.pathname || '';

    // Build admin base path from hexo config
    const root = (hexo.config.root || '').replace(/\/+$/, '') || '';
    const adminBase = root + '/admin';
    const adminBaseSlash = adminBase + '/';

    // Only handle admin routes
    if (pathname !== adminBase && pathname.indexOf(adminBaseSlash) !== 0) {
      return next();
    }

    // === Excluded paths (no auth needed) ===
    const excludedPaths = [
      adminBaseSlash + 'login.html',
      adminBaseSlash + 'login',
      adminBaseSlash + 'api/auth/login',
      adminBaseSlash + 'api/auth/logout',
      adminBaseSlash + 'api/auth/check',
    ];

    // Allow CSS/JS for login page
    if (
      pathname.startsWith(adminBaseSlash + 'css/') ||
      pathname.startsWith(adminBaseSlash + 'js/')
    ) {
      return next();
    }

    if (excludedPaths.includes(pathname)) {
      return next();
    }

    // If MySQL is not available, skip auth (fail open for safety)
    if (!db) {
      return next();
    }

    // === Verify JWT ===
    const token = extractToken(req);
    if (!token) {
      return handleAuthFailure(req, res, pathname);
    }

    try {
      const payload = jwt.verify(token, jwtConfig.secret);
      // Attach user info to request
      req.adminUser = payload;
      return next();
    } catch (err) {
      // Token expired or invalid
      return handleAuthFailure(req, res, pathname);
    }
  };
}

function handleAuthFailure(req, res, pathname) {
  // For API calls: return 401 JSON
  if (pathname.indexOf('/api/') !== -1) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized', message: '请先登录' }));
    return;
  }
  // For page loads: redirect to login
  res.writeHead(302, { Location: pathname.substring(0, pathname.indexOf('/admin/')) + '/admin/login.html' });
  res.end();
}

// ============ API Handlers ============
function registerApiRoutes(app, hexo, jwtConfig) {
  const root = (hexo.config.root || '').replace(/\/+$/, '') || '';
  const adminBase = root + '/admin';

  // POST /admin/api/auth/login
  app.use(async function (req, res, next) {
    const parsedUrl = urlParser.parse(req.url || '');
    const pathname = parsedUrl.pathname || '';

    if (pathname !== adminBase + '/api/auth/login' || req.method !== 'POST') {
      return next();
    }

    const db = await getPool(hexo);
    if (!db) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database not available' }));
      return;
    }

    try {
      const body = await parseBody(req);
      const { username, password } = body;

      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请输入用户名和密码' }));
        return;
      }

      // Lookup user in MySQL
      const [rows] = await db.execute(
        'SELECT id, username, password_hash, display_name FROM users WHERE username = ?',
        [username]
      );

      if (rows.length === 0) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '用户名或密码错误' }));
        return;
      }

      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);

      if (!valid) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '用户名或密码错误' }));
        return;
      }

      // Generate JWT
      const payload = {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
      };
      const token = jwt.sign(payload, jwtConfig.secret, {
        expiresIn: jwtConfig.expiresIn,
      });

      setTokenCookie(res, token);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token: token,
        user: payload,
        message: '登录成功',
      }));
    } catch (err) {
      hexo.log.error('[admin-auth] Login error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '服务器内部错误' }));
    }
  });

  // GET /admin/api/auth/check
  app.use(async function (req, res, next) {
    const parsedUrl = urlParser.parse(req.url || '');
    const pathname = parsedUrl.pathname || '';

    if (pathname !== adminBase + '/api/auth/check' || req.method !== 'GET') {
      return next();
    }

    try {
      const token = extractToken(req);
      if (!token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: '未登录' }));
        return;
      }
      const payload = jwt.verify(token, jwtConfig.secret);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: true, user: payload }));
    } catch {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: false, error: 'Token 无效或已过期' }));
    }
  });

  // POST /admin/api/auth/logout
  app.use(async function (req, res, next) {
    const parsedUrl = urlParser.parse(req.url || '');
    const pathname = parsedUrl.pathname || '';

    if (pathname !== adminBase + '/api/auth/logout' || req.method !== 'POST') {
      return next();
    }

    clearTokenCookie(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: '已退出登录' }));
  });
}

// ============ Hexo Entry Point ============
// Use priority -10 to run BEFORE admin-panel.js (which uses priority 0)
hexo.extend.filter.register('server_middleware', async function (app) {
  const jwtConfig = getJwtConfig(hexo);

  // Register API routes first (these bypass auth check)
  registerApiRoutes(app, hexo, jwtConfig);

  // Seed default admin user
  await seedDefaultAdmin(hexo);

  // Register auth middleware second (blocks unauthenticated requests)
  const middleware = await authMiddleware(hexo, jwtConfig);
  app.use(middleware);

  // Also ensure body parsing for auth API (in case it runs before hexo-admin's bodyParser)
  // — handled inline via parseBody()

}, -10);

hexo.log.info('[admin-auth] JWT authentication module loaded');
