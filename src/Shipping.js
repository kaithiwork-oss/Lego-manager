// =============================================
// LEGO TRANSACTION MANAGER - Shipping.gs
// Tự động tra trạng thái vận chuyển theo mã vận đơn
// và đồng bộ vào DataGiaoDich mỗi ngày lúc 0h (giờ VN).
//
// Đơn đã hoàn thành (Đã nhận hàng / Hoàn trả) và đơn chưa
// có mã vận đơn đều được bỏ qua.
// =============================================


// Cột trong DataGiaoDich (1-indexed) — xem HEADERS_GIAODICH ở Code.gs
var SHIP_COL_MAGD      = 1;
var SHIP_COL_NGUON     = 10;
var SHIP_COL_MAVANDON  = 11;
var SHIP_COL_TRANGTHAI = 12;
var SHIP_COL_NGAY_TT   = 17;

// Trạng thái coi như đã xong -> không tra nữa
var SHIP_DONE_STATUSES = ['Đã nhận hàng', 'Hoàn trả'];

// Trần số mã vận đơn tra mỗi lần chạy (tránh chạm giới hạn 6 phút của Apps Script).
// Đơn lâu chưa cập nhật nhất được ưu tiên, phần dư để lần chạy sau.
var SHIP_SYNC_MAX_PER_RUN = 150;

// Ngừng tra khi đã chạy quá lâu, chừa thời gian ghi sheet
// (Apps Script cắt ở phút thứ 6 với tài khoản thường).
var SHIP_SYNC_TIME_BUDGET_MS = 4.5 * 60 * 1000;

var SHIP_SYNC_TRIGGER_FN = 'autoSyncShippingStatus';
var SHIP_SYNC_LAST_RUN_KEY = 'SHIP_SYNC_LAST_RUN';


// =============================================
// NHẬN DẠNG HÃNG VẬN CHUYỂN (bản server, khớp với detectCarrier ở Index.html)
// Khác 1 điểm: không có mã thì trả 'unknown' luôn, vì không có gì để tra.
// =============================================

function shipDetectCarrier(code, nguon) {
  var c = String(code || '').trim().toUpperCase();
  var n = String(nguon || '').toLowerCase();
  if (!c) return 'unknown';

  // Mã VTP dạng số: 12 chữ số bắt đầu bằng 1 (vd 149554355818).
  // Đặt trước nhánh Shopee vì định dạng mã cụ thể đáng tin hơn suy đoán theo nguồn.
  if (/^1[0-9]{11}$/.test(c)) return 'vtp';
  if (c.indexOf('VTP') === 0 || c.indexOf('VV') === 0 || /^VN[0-9]/.test(c)) return 'vtp';

  if (n.indexOf('shopee') >= 0 || c.indexOf('SPX') === 0 || /^[0-9]{20,}$/.test(c)) return 'shopee';
  if (c.indexOf('GHN') === 0 || c.indexOf('GHTK') === 0 || c.indexOf('J&T') === 0 || c.indexOf('JT') === 0) return 'other';
  return 'unknown';
}


// =============================================
// MAP TRẠNG THÁI CỦA HÃNG -> TRẠNG THÁI TRONG APP
// Ưu tiên đọc theo chữ (tên trạng thái) vì mã số của hãng hay đổi.
// Không map được thì trả '' và đơn đó được BỎ QUA (không ghi bừa).
// =============================================

/** Bỏ dấu tiếng Việt để so khớp cho chắc */
function _shipNoAccent(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}


function shipMapStatusText(raw) {
  var s = _shipNoAccent(raw);
  if (!s) return '';

  // 1. Giao hụt / delay — vẫn đang trên đường, phải xét TRƯỚC "thành công"
  if (/(khong thanh cong|khong lien lac|khong gap|cho giao lai|giao lai|delay|hen giao lai|chua giao duoc)/.test(s) ||
      /(delivery failed|failed delivery|delivery attempt|attempt failed|unsuccessful|reschedul)/.test(s)) {
    return 'Đang vận chuyển';
  }

  // 2. Lấy hàng thành công = mới rời người gửi, chưa phải đã giao
  if (/(lay hang thanh cong|da lay hang|nhan hang tu nguoi gui|nhan tu nguoi gui|da tiep nhan hang)/.test(s) ||
      /(picked up|pickup done|pickup success|collected from seller)/.test(s)) {
    return 'Đang vận chuyển';
  }

  // 3. Hoàn / trả / hủy — "da hoan" không được nuốt "đã hoàn thành"
  if (/(chuyen hoan|dang hoan|hoan hang|hoan buu gui|tra hang|huy don|da huy|da hoan(?!\s*(thanh|tat)))/.test(s) ||
      /(return to sender|returned|returning|cancell?ed|refund)/.test(s)) {
    return 'Hoàn trả';
  }

  // 4. Giao xong
  if (/(giao thanh cong|phat thanh cong|giao hang thanh cong|da giao hang|nguoi nhan da nhan|da nhan hang|hoan thanh|hoan tat|thanh cong)/.test(s) ||
      /(delivered|received by|order completed|completed)/.test(s)) {
    return 'Đã nhận hàng';
  }

  // 5. Đang trên đường
  if (/(dang giao|di giao|dang van chuyen|luan chuyen|van chuyen|xuat kho|nhap kho|den buu cuc|roi buu cuc|tren duong|dang trung chuyen)/.test(s) ||
      /(in transit|on the way|out for delivery|arrived at|departed|sorting|shipped|on vehicle|received at)/.test(s)) {
    return 'Đang vận chuyển';
  }

  // 6. Chờ lấy hàng / mới tạo
  if (/(cho lay hang|chua lay hang|cho xu ly|dang cho|tiep nhan|tao don|chuan bi hang|cho lay)/.test(s) ||
      /(order created|pending pickup|ready to ship|waiting for|to be picked|order placed)/.test(s)) {
    return 'Chờ hàng';
  }

  return '';
}


// =============================================
// ĐỌC TRẠNG THÁI TỪ PAYLOAD CỦA HÃNG
// =============================================

// Tên trường chứa chữ trạng thái. Xếp theo độ cụ thể giảm dần.
// Cố ý KHÔNG lấy 'MESSAGE' (hay là "success" của lớp bọc) và 'STATUS'
// (hay là số) để khỏi đọc nhầm.
var SHIP_STATUS_KEYS = [
  // Viettel Post
  'ORDER_STATUS_NAME', 'STATUS_NAME', 'STATUSNAME', 'TEN_TRANG_THAI',
  'TRANG_THAI', 'ORDER_STATUS_TEXT',
  // Shopee Express
  'MILESTONE_NAME', 'CURRENT_STATUS', 'TRACKING_STATUS', 'STATUS_TEXT',
  // chung
  'DESCRIPTION', 'NOTE'
];

var SHIP_DATE_KEYS = [
  'ORDER_DATE', 'STATUS_DATE', 'ACTUAL_TIME', 'UPDATED_DATE',
  'CREATED_DATE', 'TIMESTAMP', 'DATE', 'TIME'
];

var SHIP_SCAN_MAX_DEPTH = 6;


/**
 * Lấy chuỗi trạng thái mới nhất từ payload tra cứu.
 *
 * Payload mỗi hãng một kiểu: VTP trả 1 object đơn hàng hoặc mảng hành trình
 * ngay dưới `data`, SPX chôn mảng hành trình sâu hơn (data.sls_tracking_info.records).
 * Nên quét đệ quy tìm mọi node có trường trạng thái, rồi:
 *   - có mốc thời gian  -> lấy node mới nhất
 *   - không có mốc nào  -> lấy node nông nhất (thường là trạng thái tổng của đơn)
 */
function _shipExtractStatusText(json) {
  if (!json) return '';

  function pickByKeys(obj, keys) {
    if (!obj || typeof obj !== 'object') return '';
    for (var i = 0; i < keys.length; i++) {
      for (var real in obj) {
        if (!obj.hasOwnProperty(real)) continue;
        var v = obj[real];
        if (String(real).toUpperCase() === keys[i] && v !== null && v !== '' && typeof v !== 'object') {
          return String(v);
        }
      }
    }
    return '';
  }

  /** Mốc thời gian so sánh được: unix timestamp thì so bằng số, còn lại so chuỗi */
  function dateRank(raw) {
    if (!raw) return null;
    var s = String(raw);
    if (/^[0-9]{9,}$/.test(s)) return { num: Number(s) };
    return { str: s };
  }

  function newer(a, b) {          // a mới hơn b?
    if (!b) return true;
    if (!a) return false;
    if (a.num !== undefined && b.num !== undefined) return a.num > b.num;
    if (a.num !== undefined) return true;    // có timestamp số thì ưu tiên
    if (b.num !== undefined) return false;
    return a.str > b.str;
  }

  var best = null;                // { text, rank, depth }
  var seen = [];                  // chặn vòng lặp tham chiếu

  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > SHIP_SCAN_MAX_DEPTH) return;
    if (seen.indexOf(node) >= 0) return;
    seen.push(node);

    if (!Array.isArray(node)) {
      var text = pickByKeys(node, SHIP_STATUS_KEYS);
      if (text) {
        var rank = dateRank(pickByKeys(node, SHIP_DATE_KEYS));
        var take = false;
        if (!best) take = true;
        else if (rank && best.rank) take = newer(rank, best.rank);
        else if (rank && !best.rank) take = true;             // có ngày thắng không ngày
        // Cùng không có ngày: node nông hơn (trạng thái tổng của đơn) thắng node sâu hơn;
        // cùng độ sâu thì lấy node gặp sau, vì mục cuối mảng hành trình là mục mới nhất.
        else if (!rank && !best.rank) take = depth <= best.depth;
        if (take) best = { text: text, rank: rank, depth: depth };
      }
    }

    var keys = Array.isArray(node) ? node.map(function (_, i) { return i; }) : Object.keys(node);
    keys.forEach(function (k) {
      var child = node[k];
      if (child && typeof child === 'object') walk(child, depth + 1);
    });
  }

  walk((json.data !== undefined && json.data !== null) ? json.data : json, 0);
  return best ? best.text : '';
}


// Vài endpoint chặn request không có User-Agent trình duyệt
var SHIP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';


/**
 * Thử lần lượt danh sách endpoint, cái nào ra chữ trạng thái thì dùng.
 * @param {Array} endpoints  [{ url, method, payload? }]
 * @return {{ok:boolean, statusText:string, message:string}}
 */
function _shipTryEndpoints(endpoints) {
  var lastErr = '';

  for (var i = 0; i < endpoints.length; i++) {
    var ep = endpoints[i];
    try {
      var opt = {
        method: ep.method,
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'Accept': 'application/json', 'User-Agent': SHIP_UA }
      };
      if (ep.payload) {
        opt.contentType = 'application/json';
        opt.payload = ep.payload;
      }

      var res = UrlFetchApp.fetch(ep.url, opt);
      var http = res.getResponseCode();
      if (http < 200 || http >= 300) { lastErr = 'HTTP ' + http; continue; }

      var json = null;
      try {
        json = JSON.parse(res.getContentText());
      } catch (e) {
        lastErr = 'Response không phải JSON';
        continue;
      }

      var st = _shipExtractStatusText(json);
      if (st) return { ok: true, statusText: st, message: '' };
      lastErr = 'Không tìm thấy trường trạng thái trong response';
    } catch (e) {
      lastErr = e.toString();
    }
  }
  return { ok: false, message: lastErr || 'Không tra được' };
}


/** Danh sách endpoint tra cứu của Viettel Post */
function _shipEndpointsVtp(c) {
  return [
    {
      url: 'https://partner.viettelpost.vn/v2/order/getOrderByOrderNumber?orderNumber=' + encodeURIComponent(c),
      method: 'get'
    },
    {
      url: 'https://partner.viettelpost.vn/v2/order/tracking',
      method: 'post',
      payload: JSON.stringify({ ORDER_NUMBER: c, TYPE: 0 })
    }
  ];
}


/** Danh sách endpoint tra cứu của Shopee Express */
function _shipEndpointsSpx(c) {
  return [
    {
      url: 'https://spx.vn/shipment/order/open/order/get_order_info?spx_tn=' + encodeURIComponent(c),
      method: 'get'
    },
    {
      url: 'https://spx.vn/api/v1/order/tracking/get_tracking_info?spx_tn=' + encodeURIComponent(c),
      method: 'get'
    }
  ];
}


/** Tra 1 mã vận đơn Viettel Post */
function shipFetchVtp(code) {
  var c = String(code || '').trim();
  if (!c) return { ok: false, message: 'Thiếu mã vận đơn' };
  return _shipTryEndpoints(_shipEndpointsVtp(c));
}


/** Tra 1 mã vận đơn Shopee Express */
function shipFetchSpx(code) {
  var c = String(code || '').trim();
  if (!c) return { ok: false, message: 'Thiếu mã vận đơn' };
  return _shipTryEndpoints(_shipEndpointsSpx(c));
}


/** Điều phối theo hãng. Hãng chưa hỗ trợ -> trả ok:false để bỏ qua, không ghi gì. */
function shipFetchStatus(code, nguon) {
  var carrier = shipDetectCarrier(code, nguon);
  if (carrier === 'vtp') return shipFetchVtp(code);
  if (carrier === 'shopee') return shipFetchSpx(code);
  return { ok: false, message: 'Chưa hỗ trợ tra tự động cho hãng: ' + carrier };
}


// =============================================
// ĐỒNG BỘ TRẠNG THÁI — hàm chạy theo lịch
// =============================================

function autoSyncShippingStatus() {
  var started = new Date();
  var summary = {
    ranAt: Utilities.formatDate(started, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss'),
    pending: 0, checked: 0, updated: 0,
    unmapped: [], failed: [], deferred: 0
  };

  try {
    var ss = _openSS();
    var sheet = ss.getSheetByName(TAB_GIAODICH);
    if (!sheet || sheet.getLastRow() < 2) {
      return _shipSaveRun(summary, 'Không có dữ liệu trong ' + TAB_GIAODICH);
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 18).getValues();

    var done = {};
    SHIP_DONE_STATUSES.forEach(function (s) { done[s] = true; });

    // Gom dòng chưa hoàn thành theo mã vận đơn
    var groups = {};
    data.forEach(function (row, i) {
      var maGD = String(row[SHIP_COL_MAGD - 1] || '');
      if (!maGD) return;

      var code = String(row[SHIP_COL_MAVANDON - 1] || '').trim();
      if (!code) return;                                  // chưa có mã -> không tra được

      var status = String(row[SHIP_COL_TRANGTHAI - 1] || '');
      if (done[status]) return;                           // đã xong -> bỏ qua

      if (!groups[code]) {
        groups[code] = { code: code, nguon: '', rows: [], lastUpdate: '' };
      }
      var g = groups[code];
      g.rows.push({ rowIndex: i + 2, maGD: maGD, status: status });
      if (!g.nguon && row[SHIP_COL_NGUON - 1]) g.nguon = String(row[SHIP_COL_NGUON - 1]);
      var u = _normVal(row[SHIP_COL_NGAY_TT - 1], 'ngay');
      if (u > g.lastUpdate) g.lastUpdate = u;
    });

    var pending = Object.keys(groups).map(function (k) { return groups[k]; });
    summary.pending = pending.length;
    if (!pending.length) return _shipSaveRun(summary, 'Không có đơn nào cần tra');

    // Đơn lâu chưa cập nhật nhất đi trước
    pending.sort(function (a, b) { return String(a.lastUpdate).localeCompare(String(b.lastUpdate)); });
    if (pending.length > SHIP_SYNC_MAX_PER_RUN) {
      summary.deferred = pending.length - SHIP_SYNC_MAX_PER_RUN;
      pending = pending.slice(0, SHIP_SYNC_MAX_PER_RUN);
    }

    var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    var pendingWrites = [];   // { rowIndex, newStatus }
    var logs = [];            // { maGD, oldStatus, newStatus, raw }

    for (var p = 0; p < pending.length; p++) {
      // Chừa thời gian ghi sheet trước khi Apps Script cắt ở phút thứ 6.
      // Phần chưa tra để lần chạy sau (đã sort nên chúng cũng được ưu tiên).
      if (new Date().getTime() - started.getTime() > SHIP_SYNC_TIME_BUDGET_MS) {
        summary.deferred += pending.length - p;
        break;
      }

      var g = pending[p];
      var r = shipFetchStatus(g.code, g.nguon);
      summary.checked++;

      if (!r.ok) {
        summary.failed.push(g.code + ': ' + r.message);
        continue;
      }

      var mapped = shipMapStatusText(r.statusText);
      if (!mapped) {
        summary.unmapped.push(g.code + ' → "' + r.statusText + '"');
        continue;
      }

      /* jshint loopfunc:true */
      (function (group, newStatus, rawText) {
        group.rows.forEach(function (row) {
          if (row.status === newStatus) return;   // không đổi thì thôi
          pendingWrites.push({ rowIndex: row.rowIndex, newStatus: newStatus });
          logs.push({ maGD: row.maGD, oldStatus: row.status, newStatus: newStatus, raw: rawText });
        });
      })(g, mapped, r.statusText);
    }

    if (pendingWrites.length) {
      // Ghi 1 lượt cho cột L (trạng thái) và Q (ngày cập nhật TT)
      var colL = sheet.getRange(2, SHIP_COL_TRANGTHAI, lastRow - 1, 1).getValues();
      var colQ = sheet.getRange(2, SHIP_COL_NGAY_TT, lastRow - 1, 1).getValues();
      pendingWrites.forEach(function (w) {
        colL[w.rowIndex - 2][0] = w.newStatus;
        colQ[w.rowIndex - 2][0] = today;
      });
      sheet.getRange(2, SHIP_COL_TRANGTHAI, lastRow - 1, 1).setValues(colL);
      sheet.getRange(2, SHIP_COL_NGAY_TT, lastRow - 1, 1).setValues(colQ);

      logs.forEach(function (l) {
        appendLog(ss, l.maGD, 'Cập nhật',
          'Tự động đồng bộ vận chuyển: Trạng thái đơn: ' + (l.oldStatus || '(trống)') + ' → ' + l.newStatus +
          ' (hãng báo: "' + l.raw + '")',
          [{
            field: 'trangThaiDon', label: 'Trạng thái đơn',
            old: String(l.oldStatus || ''), "new": l.newStatus, date: today
          }]);
      });

      summary.updated = logs.length;
      invalidateDashCache();
    }

    return _shipSaveRun(summary, 'Xong');
  } catch (e) {
    summary.failed.push('Lỗi chung: ' + e.toString());
    return _shipSaveRun(summary, 'Lỗi: ' + e.toString());
  }
}


/** Lưu kết quả lần chạy gần nhất vào Script Properties + ghi log */
function _shipSaveRun(summary, note) {
  summary.note = note;
  var msg = 'Đồng bộ vận chuyển [' + summary.ranAt + '] — ' + note +
    ' | cần tra: ' + summary.pending +
    ', đã tra: ' + summary.checked +
    ', cập nhật: ' + summary.updated +
    (summary.deferred ? ', để lần sau: ' + summary.deferred : '') +
    (summary.unmapped.length ? '\nChưa map được trạng thái: ' + summary.unmapped.join(' | ') : '') +
    (summary.failed.length ? '\nTra lỗi: ' + summary.failed.join(' | ') : '');

  Logger.log(msg);
  try {
    PropertiesService.getScriptProperties()
      .setProperty(SHIP_SYNC_LAST_RUN_KEY, JSON.stringify(summary).slice(0, 9000));
  } catch (e) {}

  summary.message = msg;
  return summary;
}


// =============================================
// QUẢN LÝ TRIGGER — chạy hằng ngày lúc 0h giờ VN
// =============================================

/** Chạy tay 1 lần từ editor để cài lịch */
function installShippingSyncTrigger() {
  removeShippingSyncTrigger();
  ScriptApp.newTrigger(SHIP_SYNC_TRIGGER_FN)
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .nearMinute(0)
    .inTimezone('Asia/Ho_Chi_Minh')
    .create();
  var msg = '✓ Đã cài lịch chạy "' + SHIP_SYNC_TRIGGER_FN + '" hằng ngày lúc 00:00 (giờ VN).';
  Logger.log(msg);
  return msg;
}


/** Gỡ lịch */
function removeShippingSyncTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === SHIP_SYNC_TRIGGER_FN) {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  if (n) Logger.log('Đã gỡ ' + n + ' trigger cũ.');
  return n;
}


/** Xem lịch đã cài chưa + kết quả lần chạy gần nhất */
function shippingSyncStatus() {
  var installed = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === SHIP_SYNC_TRIGGER_FN;
  }).length;

  var last = _prop(SHIP_SYNC_LAST_RUN_KEY);
  var out = (installed ? '✓ Đã cài lịch (' + installed + ' trigger)' : '✗ Chưa cài lịch — chạy installShippingSyncTrigger()') +
    '\nLần chạy gần nhất: ' + (last || '(chưa có)');
  Logger.log(out);
  return out;
}


// =============================================
// DEBUG — chạy tay trong editor để xem payload thật của hãng
// =============================================

/** In payload thô của từng endpoint + trạng thái đọc được, để chỉnh mapping */
function _shipDebug(code, endpoints, nguon) {
  var c = String(code || '').trim();
  var out = ['Mã: ' + c + ' — hãng nhận dạng: ' + shipDetectCarrier(c, nguon || '')];

  endpoints.forEach(function (ep) {
    try {
      var opt = {
        method: ep.method, muteHttpExceptions: true, followRedirects: true,
        headers: { 'Accept': 'application/json', 'User-Agent': SHIP_UA }
      };
      if (ep.payload) { opt.contentType = 'application/json'; opt.payload = ep.payload; }

      var res = UrlFetchApp.fetch(ep.url, opt);
      var body = res.getContentText();
      out.push('--- ' + ep.method.toUpperCase() + ' ' + ep.url +
        '\nHTTP ' + res.getResponseCode() +
        '\n' + body.slice(0, 3000));
      try {
        var st = _shipExtractStatusText(JSON.parse(body));
        out.push('→ trạng thái đọc được: "' + st + '" → map thành: "' + shipMapStatusText(st) + '"');
      } catch (e) {
        out.push('→ không parse được JSON');
      }
    } catch (e) {
      out.push('--- ' + ep.url + '\nLỗi: ' + e.toString());
    }
  });

  var msg = out.join('\n\n');
  Logger.log(msg);
  return msg;
}


function debugTrackingVtp(code) {
  var c = String(code || '149554355818').trim();
  return _shipDebug(c, _shipEndpointsVtp(c));
}


function debugTrackingSpx(code) {
  var c = String(code || '').trim();
  if (!c) return 'Truyền vào 1 mã SPX thật, vd: debugTrackingSpx("SPXVN...")';
  return _shipDebug(c, _shipEndpointsSpx(c), 'Shopee');
}
