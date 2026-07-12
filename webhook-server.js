/**
 * GitHub Webhook 自动部署服务器
 * 接收 GitHub push 事件后自动 git pull 并重新生成 Hexo 博客
 */

const http = require('http');
const crypto = require('crypto');
const querystring = require('querystring');
const { exec } = require('child_process');

// ============ 配置 ============
const PORT = 9000;
const SECRET = 'cx-blog-webhook-secret-2024'; // 请修改为你自己的 secret
const REPO_DIR = '/home/ubuntu/cx-blog';
const BRANCH = 'master'; // 监听的分支

// ============ 日志 ============
function log(level, msg) {
  const time = new Date().toISOString();
  console.log(`[${time}] [${level}] ${msg}`);
}

// ============ 执行命令 ============
function runCommand(cmd, cwd) {
  return new Promise((resolve, reject) => {
    log('INFO', `执行命令: ${cmd}`);
    exec(cmd, { cwd }, (error, stdout, stderr) => {
      if (error) {
        log('ERROR', `命令失败: ${error.message}`);
        reject(error);
      } else {
        if (stdout) log('INFO', stdout.trim());
        if (stderr) log('WARN', stderr.trim());
        resolve(stdout);
      }
    });
  });
}

// ============ 自动部署 ============
async function deploy() {
  log('INFO', '========== 开始自动部署 ==========');
  try {
    // 1. 拉取最新代码
    log('INFO', 'Step 1: git pull');
    await runCommand('git fetch origin', REPO_DIR);
    await runCommand('git reset --hard origin/' + BRANCH, REPO_DIR);

    // 2. 安装依赖（如有变更）
    log('INFO', 'Step 2: npm install');
    await runCommand('npm install', REPO_DIR).catch(() => {
      log('WARN', 'npm install 失败，继续执行');
    });

    // 3. 生成静态页面
    log('INFO', 'Step 3: hexo generate');
    await runCommand('npx hexo generate', REPO_DIR);

    // 4. 重启 Hexo 服务器
    log('INFO', 'Step 4: 重启 Hexo 服务器');
    await runCommand('sudo systemctl restart hexo-blog', REPO_DIR);

    log('INFO', '========== 部署完成 ==========');
    return true;
  } catch (err) {
    log('ERROR', '部署失败: ' + err.message);
    return false;
  }
}

// ============ 验证 GitHub 签名 ============
function verifySignature(payload, signature) {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ============ 解析请求体中的 JSON payload ============
function extractPayload(body, contentType) {
  if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
    const params = querystring.parse(body);
    if (params.payload) return params.payload;
  }
  return body;
}

// ============ HTTP 服务器 ============
const server = http.createServer(async (req, res) => {
  // 健康检查（支持直接访问和 nginx 代理路径）
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/webhook/health' || req.url === '/webhook')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', repo: REPO_DIR, branch: BRANCH }));
    return;
  }

  // 只接受 POST 请求
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  // 读取请求体
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    // 验证事件类型
    const event = req.headers['x-github-event'];
    const signature = req.headers['x-hub-signature-256'];

    log('INFO', '收到事件: ' + (event || 'unknown'));

    // 验证签名
    if (SECRET && !verifySignature(body, signature)) {
      log('WARN', '签名验证失败');
      res.writeHead(403);
      res.end('Forbidden: Invalid signature');
      return;
    }

    // 只处理 push 事件
    if (event !== 'push') {
      log('INFO', '忽略事件类型: ' + event);
      res.writeHead(200);
      res.end('OK: ignored ' + event + ' event');
      return;
    }

    // 解析 payload 检查分支
    try {
      const jsonStr = extractPayload(body, req.headers['content-type']);
      const payload = JSON.parse(jsonStr);
      const ref = payload.ref || '';
      const pushedBranch = ref.replace('refs/heads/', '');

      log('INFO', 'Push 事件, 分支: ' + pushedBranch);

      if (pushedBranch !== BRANCH) {
        log('INFO', '忽略分支 ' + pushedBranch + '（只监听 ' + BRANCH + '）');
        res.writeHead(200);
        res.end('OK: branch ' + pushedBranch + ' ignored');
        return;
      }

      // 立即响应 GitHub，避免超时
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'deploying', branch: pushedBranch }));

      // 异步执行部署
      const pusher = payload.pusher?.name || 'unknown';
      const commit = payload.head_commit?.id?.substring(0, 7) || 'unknown';
      log('INFO', 'Push 来自: ' + pusher + ', commit: ' + commit);
      await deploy();

    } catch (err) {
      log('ERROR', '处理 webhook 失败: ' + err.message);
      if (!res.writableEnded) {
        res.writeHead(400);
        res.end('Bad Request');
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  log('INFO', 'Webhook 服务器启动在端口 ' + PORT);
  log('INFO', '监听仓库: ' + REPO_DIR);
  log('INFO', '监听分支: ' + BRANCH);
  log('INFO', '健康检查: http://0.0.0.0:' + PORT + '/health');
  log('INFO', '通过 nginx 代理: http://42.193.149.44/webhook');
});
