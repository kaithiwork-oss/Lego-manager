// Chạy autoSyncShippingStatus() trên sheet giả lập + fetch giả lập
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'Shipping.js');

// ---- sheet giả: 18 cột, header ở dòng 1 (không nằm trong data) ----
// [Mã GD, Ngày, Shop, ..., nguon(10), maVanDon(11), trangThai(12), ..., ngayTT(17), ...]
function mkRow(maGD, nguon, maVanDon, trangThai, ngayTT) {
  const r = new Array(18).fill('');
  r[0] = maGD; r[9] = nguon; r[10] = maVanDon; r[11] = trangThai; r[16] = ngayTT || '';
  return r;
}

const rows = [
  mkRow('GD001', 'Shopee', '149554355818', 'Đang vận chuyển', '2026-08-01'), // -> Đã nhận hàng
  mkRow('GD002', 'Bank',   '149554355818', 'Đang vận chuyển', '2026-08-01'), // cùng vận đơn, cùng đổi
  mkRow('GD003', 'Bank',   '149000000002', 'Chờ hàng',        '2026-08-05'), // -> Đang vận chuyển
  mkRow('GD004', 'Bank',   '149000000003', 'Đã nhận hàng',    '2026-07-01'), // đã xong -> bỏ qua
  mkRow('GD005', 'Bank',   '149000000004', 'Hoàn trả',        '2026-07-02'), // đã xong -> bỏ qua
  mkRow('GD006', 'Bank',   '',             'Chờ hàng',        ''),           // không mã -> bỏ qua
  mkRow('GD007', 'Shopee', 'SPXVN123456',  'Đang vận chuyển', '2026-08-02'), // hãng chưa hỗ trợ
  mkRow('GD008', 'Bank',   '149000000005', 'Đang vận chuyển', '2026-08-03'), // trạng thái lạ -> không ghi
  mkRow('GD009', 'Bank',   '149000000006', 'Đang vận chuyển', '2026-08-04'), // fetch lỗi
];

const writes = [];
const logCalls = [];
let cacheInvalidated = false;

function mkRange(rowStart, colStart, numRows, numCols) {
  return {
    getValues() {
      const out = [];
      for (let i = 0; i < numRows; i++) {
        const src = rows[rowStart - 2 + i];
        out.push(src.slice(colStart - 1, colStart - 1 + numCols).map(v => v));
      }
      return out;
    },
    setValues(vals) {
      writes.push({ colStart, numCols, vals: JSON.parse(JSON.stringify(vals)) });
      for (let i = 0; i < vals.length; i++) {
        for (let j = 0; j < numCols; j++) rows[rowStart - 2 + i][colStart - 1 + j] = vals[i][j];
      }
    }
  };
}

const sheet = { getLastRow: () => rows.length + 1, getRange: mkRange };

// ---- stub Apps Script globals ----
global.SpreadsheetApp = {};
global.Utilities = {
  formatDate(d, tz, fmt) {
    const p = n => String(n).padStart(2, '0');
    const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return fmt.indexOf('HH') >= 0 ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` : s;
  }
};
global.PropertiesService = { getScriptProperties: () => ({ setProperty() {}, getProperty: () => '' }) };
global.ScriptApp = {};
global.Logger = { log() {} };
global.UrlFetchApp = {};

// hàm từ Code.gs mà Shipping.gs dùng
global.TAB_GIAODICH = 'DataGiaoDich';
global._openSS = () => ({ getSheetByName: () => sheet });
global._normVal = (v, key) => (v === null || v === undefined) ? '' : String(v).trim();
global.appendLog = (ss, maGD, loai, summary, details) => { logCalls.push({ maGD, summary, details }); };
global.invalidateDashCache = () => { cacheInvalidated = true; };
global._prop = () => '';

const src = fs.readFileSync(SRC, 'utf8');
eval(src);

// ---- chặn gọi mạng thật, trả trạng thái giả ----
const FAKE = {
  '149554355818': { ok: true, statusText: 'Giao hàng thành công' },
  '149000000002': { ok: true, statusText: 'Đang giao hàng' },
  '149000000005': { ok: true, statusText: 'Trạng thái lạ hoắc' },
  '149000000006': { ok: false, message: 'HTTP 500' },
};
let fetched = [];
shipFetchStatus = function (code, nguon) {
  fetched.push(code);
  if (shipDetectCarrier(code, nguon) !== 'vtp') return { ok: false, message: 'Chưa hỗ trợ tra tự động' };
  return FAKE[code] || { ok: false, message: 'không có dữ liệu giả' };
};

const res = autoSyncShippingStatus();

let fail = 0;
function eq(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (mong ' + JSON.stringify(b) + ')'));
}

console.log('== gom đơn cần tra ==');
eq(res.pending, 5, 'số vận đơn cần tra (bỏ đơn đã xong + đơn không mã)');
eq(fetched.slice().sort(), ['149000000002','149000000005','149000000006','149554355818','SPXVN123456'].sort(), 'đúng các mã được tra');
eq(fetched.indexOf('149554355818') < fetched.indexOf('149000000002'), true, 'đơn cũ nhất tra trước');

console.log('\n== kết quả ghi ==');
eq(res.updated, 3, 'số dòng được cập nhật (GD001, GD002, GD003)');
eq(rows[0][11], 'Đã nhận hàng', 'GD001 -> Đã nhận hàng');
eq(rows[1][11], 'Đã nhận hàng', 'GD002 cùng vận đơn cũng đổi');
eq(rows[2][11], 'Đang vận chuyển', 'GD003 Chờ hàng -> Đang vận chuyển');
eq(rows[3][11], 'Đã nhận hàng', 'GD004 đã xong, giữ nguyên');
eq(rows[4][11], 'Hoàn trả', 'GD005 đã xong, giữ nguyên');
eq(rows[6][11], 'Đang vận chuyển', 'GD007 hãng chưa hỗ trợ, giữ nguyên');
eq(rows[7][11], 'Đang vận chuyển', 'GD008 trạng thái lạ, giữ nguyên');
eq(rows[8][11], 'Đang vận chuyển', 'GD009 fetch lỗi, giữ nguyên');

console.log('\n== ngày cập nhật TT ==');
const today = Utilities.formatDate(new Date(), 'x', 'yyyy-MM-dd');
eq(rows[0][16], today, 'GD001 được set ngày hôm nay');
eq(rows[3][16], '2026-07-01', 'GD004 không đổi giữ nguyên ngày cũ');
eq(rows[7][16], '2026-08-03', 'GD008 không ghi thì không đụng ngày');

console.log('\n== log + cache ==');
eq(logCalls.length, 3, 'ghi 3 dòng DataLog');
eq(logCalls[0].details[0].field, 'trangThaiDon', 'log đúng field');
eq(logCalls[0].details[0].old, 'Đang vận chuyển', 'log giữ trạng thái cũ');
eq(logCalls[0].details[0]['new'], 'Đã nhận hàng', 'log trạng thái mới');
eq(logCalls[0].summary.indexOf('Giao hàng thành công') >= 0, true, 'log kèm nguyên văn hãng trả về');
eq(cacheInvalidated, true, 'đã xoá cache dashboard');
eq(writes.length, 2, 'chỉ ghi sheet 2 lần (cột L và cột Q)');

console.log('\n== báo cáo ==');
eq(res.unmapped, ['149000000005 → "Trạng thái lạ hoắc"'], 'báo trạng thái chưa map');
eq(res.failed.length, 2, 'báo 2 mã tra không được (SPX + lỗi HTTP)');

console.log('\n' + (fail ? '✗ ' + fail + ' case sai' : '✓ Tất cả case đúng'));
process.exit(fail ? 1 : 0);
