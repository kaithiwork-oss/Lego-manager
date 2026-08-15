#!/usr/bin/env node
/**
 * Deploy Apps Script mà KHÔNG đổi link web app.
 *
 * Mỗi lần chạy `clasp create-deployment` mà không truyền deployment ID,
 * Apps Script tạo ra một deployment mới => URL /exec mới. Script này ghim
 * deployment ID vào file `deployment.json` và luôn redeploy đúng deployment
 * đó (`clasp create-deployment -i <id>`), nên URL giữ nguyên mãi mãi.
 *
 * Cách dùng:
 *   npm run deploy                      # push + redeploy, giữ nguyên URL
 *   npm run deploy -- -d "Sửa bug ảnh"  # kèm mô tả cho version mới
 *   npm run deploy -- --id AKfycb...    # ghim một deployment ID cụ thể
 *   npm run deploy -- --no-push         # chỉ deploy, không push code
 *   npm run deploy:pin <link /exec>     # ghim link đang dùng, chưa deploy
 *   npm run deploy:url                  # chỉ in ra URL đang dùng
 */

const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'deployment.json');
const CLASP = path.join(ROOT, 'node_modules', '.bin', 'clasp');

function execUrl(deploymentId) {
  return `https://script.google.com/macros/s/${deploymentId}/exec`;
}

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`Không đọc được ${path.basename(CONFIG_FILE)}: ${err.message}`);
  }
}

function writeConfig(deploymentId) {
  const config = {
    deploymentId,
    webAppUrl: execUrl(deploymentId),
    _note: 'Deployment ID được ghim để mỗi lần deploy không đổi URL. Đừng xoá/sửa tay.',
  };
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function clasp(args, {capture = false} = {}) {
  const bin = fs.existsSync(CLASP) ? CLASP : 'npx';
  const argv = bin === 'npx' ? ['clasp', ...args] : args;
  return execFileSync(bin, argv, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });
}

function claspJson(args) {
  const out = clasp([...args, '--json'], {capture: true});
  // clasp có thể in thêm log trước JSON — chỉ lấy từ dấu ngoặc đầu tiên.
  const start = out.search(/[[{]/);
  if (start === -1) throw new Error(`clasp ${args.join(' ')} không trả về JSON:\n${out}`);
  return JSON.parse(out.slice(start));
}

function listDeployments() {
  const results = claspJson(['list-deployments']);
  return results.filter(d => d.deploymentId);
}

/** Deployment @HEAD (không có versionNumber) luôn tồn tại và không dùng để phát hành. */
function isHead(deployment) {
  return deployment.versionNumber === undefined || deployment.versionNumber === null;
}

/**
 * Nhận cả deployment ID trần lẫn nguyên link web app —
 * cái người dùng có sẵn trong tay thường là link `/macros/s/<ID>/exec`.
 */
function toDeploymentId(value) {
  const input = (value ?? '').trim();
  if (!input) return '';
  // Link thường: /macros/s/<ID>/exec — link Workspace: /a/macros/<domain>/s/<ID>/exec
  const fromUrl = input.match(/\/macros\/(?:[^/]+\/)*s\/([A-Za-z0-9_-]+)/) || input.match(/\/s\/([A-Za-z0-9_-]+)/);
  const id = fromUrl ? fromUrl[1] : input;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Deployment ID không hợp lệ: ${input}\n  Dán link dạng https://script.google.com/macros/s/<ID>/exec hoặc chính <ID>.`);
  }
  return id;
}

function parseArgs(argv) {
  const args = {description: '', deploymentId: '', push: true, urlOnly: false, pinOnly: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-d' || arg === '--description') args.description = argv[++i] ?? '';
    else if (arg === '-i' || arg === '--id' || arg === '--deploymentId') args.deploymentId = toDeploymentId(argv[++i]);
    else if (arg === '--no-push') args.push = false;
    else if (arg === '--url') args.urlOnly = true;
    else if (arg === '--pin') args.pinOnly = true;
    else if (args.pinOnly && !args.deploymentId) args.deploymentId = toDeploymentId(arg);
    else throw new Error(`Không hiểu tham số: ${arg}`);
  }
  return args;
}

function defaultDescription() {
  const now = new Date().toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh', hour12: false});
  return `Deploy ${now}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig();
  let deploymentId = args.deploymentId || process.env.CLASP_DEPLOYMENT_ID || config.deploymentId || '';

  if (args.urlOnly) {
    if (!deploymentId) {
      console.error('Chưa có deployment nào được ghim. Chạy `npm run deploy` một lần trước.');
      process.exitCode = 1;
      return;
    }
    console.log(execUrl(deploymentId));
    return;
  }

  if (args.pinOnly) {
    // Ghim thì phải nói rõ ghim cái nào — không im lặng lấy lại giá trị cũ.
    deploymentId = args.deploymentId;
    if (!deploymentId) {
      console.error(
        'Thiếu link. Dùng: npm run deploy:pin -- "https://script.google.com/macros/s/<ID>/exec"',
      );
      process.exitCode = 1;
      return;
    }
    const saved = writeConfig(deploymentId);
    console.log(`✓ Đã ghim link hiện tại vào ${path.basename(CONFIG_FILE)}`);
    console.log(`  URL: ${saved.webAppUrl}`);
    console.log('  Từ giờ `npm run deploy` sẽ luôn deploy vào đúng link này. Nhớ commit file này.');
    return;
  }

  if (args.push) {
    console.log('→ Đẩy code lên Apps Script...');
    clasp(['push', '-f']);
  }

  const deployments = listDeployments();

  if (deploymentId && !deployments.some(d => d.deploymentId === deploymentId)) {
    console.error(
      `\n✗ Deployment ${deploymentId} không còn tồn tại trên Apps Script (có thể đã bị xoá).\n` +
        '  Deploy tiếp sẽ tạo URL mới, nên script dừng lại để bạn quyết định.\n' +
        '  - Muốn dùng deployment khác: npm run deploy -- --id <deploymentId>\n' +
        `  - Chấp nhận URL mới: xoá ${path.basename(CONFIG_FILE)} rồi chạy lại.\n` +
        `  Deployment hiện có:\n${deployments.map(d => `    - ${d.deploymentId} ${isHead(d) ? '@HEAD' : `@${d.versionNumber}`}`).join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  const pinned = deployments.find(d => d.deploymentId === deploymentId);
  if (pinned && isHead(pinned)) {
    console.error(
      `\n✗ ${deploymentId} là deployment @HEAD (link /dev, luôn chạy code mới nhất) — Apps Script không cho phát hành vào đó.\n` +
        '  Ghim link /exec của bản đang dùng thay vì link /dev:\n' +
        '    npm run deploy:pin -- "https://script.google.com/macros/s/<ID>/exec"',
    );
    process.exitCode = 1;
    return;
  }

  if (!deploymentId) {
    // Chưa ghim: nhận nuôi deployment đang chạy nếu chỉ có đúng một cái.
    const versioned = deployments.filter(d => !isHead(d));
    if (versioned.length === 1) {
      deploymentId = versioned[0].deploymentId;
      console.log(`→ Ghim deployment đang chạy sẵn: ${deploymentId}`);
    } else if (versioned.length > 1) {
      console.error(
        '\n✗ Có nhiều deployment, không đoán được cái nào là bản đang dùng.\n' +
          '  Chọn đúng deployment (chính là ID nằm trong URL /macros/s/<ID>/exec) rồi chạy:\n' +
          '    npm run deploy -- --id <deploymentId>\n\n' +
          `${versioned.map(d => `    - ${d.deploymentId} @${d.versionNumber}${d.description ? ` - ${d.description}` : ''}`).join('\n')}`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const description = args.description || defaultDescription();
  const deployArgs = ['create-deployment', '-d', description];
  if (deploymentId) {
    console.log(`→ Redeploy vào deployment sẵn có (giữ nguyên URL): ${deploymentId}`);
    deployArgs.push('-i', deploymentId);
  } else {
    console.log('→ Chưa có deployment nào, tạo mới và ghim lại cho các lần sau...');
  }

  const result = claspJson(deployArgs);
  const finalId = result.deploymentId || deploymentId;
  if (!finalId) throw new Error('clasp không trả về deployment ID.');

  const saved = writeConfig(finalId);
  const changed = config.deploymentId && config.deploymentId !== finalId;

  console.log(`\n✓ Đã deploy @${result.versionNumber ?? 'HEAD'} — ${description}`);
  console.log(`  URL: ${saved.webAppUrl}`);
  if (!config.deploymentId) {
    console.log(`  Đã ghi ${path.basename(CONFIG_FILE)} — nhớ commit file này để URL không đổi.`);
  } else if (changed) {
    console.log('  ⚠ Deployment ID đã thay đổi so với lần trước — URL cũ không còn dùng được.');
  } else {
    console.log('  URL không đổi so với lần deploy trước.');
  }
}

try {
  main();
} catch (err) {
  console.error(`\n✗ Deploy thất bại: ${err.message}`);
  process.exitCode = 1;
}
