// =============================================
// LEGO TRANSACTION MANAGER - Code.gs v5
// v4: + CacheService (giảm đọc Sheet), invalidate khi ghi
// v5: + PropertiesService — SHEET_ID và ANTHROPIC_API_KEY
//     không còn nằm trong source code
// =============================================
//
// CHUẨN BỊ: vào ⚙️ Project Settings > Script Properties, thêm:
//   SHEET_ID          = 11bWeMGaOb9cR9hFV78cYlUvybkgxAT1HxUoLrKcpOF4
//   ANTHROPIC_API_KEY = sk-ant-...
//   RB_API_KEY        = ...  (đã có sẵn, dùng cho Rebrickable.gs)
// =============================================


// =============================================
// CẤU HÌNH — đọc từ Script Properties
// _PROPS_CACHE giữ giá trị trong 1 lần chạy, nên dù SHEET_ID
// được dùng ở mấy chục chỗ vẫn chỉ đọc Properties đúng 1 lần.
// =============================================

var _PROPS_CACHE = {};

function _prop(key) {
  if (_PROPS_CACHE[key] === undefined) {
    _PROPS_CACHE[key] = PropertiesService.getScriptProperties().getProperty(key) || '';
  }
  return _PROPS_CACHE[key];
}

function _sheetId() {
  var v = _prop('SHEET_ID');
  if (!v) throw new Error('Thiếu Script Property: SHEET_ID');
  return v;
}


var TAB_GIAODICH  = 'DataGiaoDich';
var TAB_THANHTOAN = 'DataThanhToan';
var TAB_THONGKE   = 'ThongKe';
var TAB_NGUON     = 'TheoNguon';
var TAB_NGUOIGD   = 'TheoNguoiGD';
var TAB_THANG     = 'TheoThang';
var TAB_DATALOG   = 'DataLog';

var HEADERS_GIAODICH = [

  'Mã GD', 'Ngày tháng (Ngày mua)', 'Người giao dịch (Tên Shop)',
  'Link liên hệ', 'Loại GD', 'Mặt hàng (Sản phẩm ghi nhận)',
  'Số lượng', 'Đơn giá', 'Số tiền (VND)', 'Hình thức GD (Bank/Shopee/GDTT)',
  'Mã vận đơn', 'Trạng thái đơn hàng', 'Trạng thái thanh toán',
  'Rating (1-5 sao)', 'Ghi chú', 'Mã GD gốc (nếu là Hoàn)', 'Ngày cập nhật TT đơn',
  'Chiều trao đổi'
];


var HEADERS_THANHTOAN = [

  'Mã GD', 'Ngày thanh toán', 'Tên Shop',
  'Số tiền (VND)', 'Loại thanh toán', 'Hình thức GD (Bank/Shopee/GDTT)', 'Ghi chú'
];


var HEADERS_DATALOG = [
  'logId', 'Timestamp', 'Mã GD', 'Loại thao tác', 'Tóm tắt thay đổi', 'Chi tiết (JSON)'
];


// =============================================
// SERVE WEB APP
// =============================================

function doGet() {

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Lego Transaction Manager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// =============================================
// CACHE LAYER — giảm số lần đọc Sheet
// CacheService giới hạn 100KB/key, nên phải chia nhỏ chuỗi JSON.
// =============================================

var CACHE_KEY   = 'dash_v1';
var CACHE_CHUNK = 90000;   // ký tự / key
var CACHE_TTL   = 21600;   // 6 giờ


function _cacheGetDash() {
  try {
    var cache = CacheService.getScriptCache();
    var n = cache.get(CACHE_KEY + '_n');
    if (!n) return null;

    var keys = [];
    for (var i = 0; i < Number(n); i++) keys.push(CACHE_KEY + '_' + i);
    var parts = cache.getAll(keys);

    var str = '';
    for (var j = 0; j < Number(n); j++) {
      var p = parts[CACHE_KEY + '_' + j];
      if (p === null || p === undefined) return null; // mất 1 mảnh -> bỏ cache
      str += p;
    }
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}


function _cachePutDash(obj) {
  try {
    var str = JSON.stringify(obj);
    if (str.length > CACHE_CHUNK * 50) return; // quá lớn, bỏ qua cache
    var cache = CacheService.getScriptCache();
    var n = Math.ceil(str.length / CACHE_CHUNK);
    var payload = {};
    for (var i = 0; i < n; i++) {
      payload[CACHE_KEY + '_' + i] = str.substr(i * CACHE_CHUNK, CACHE_CHUNK);
    }
    payload[CACHE_KEY + '_n'] = String(n);
    cache.putAll(payload, CACHE_TTL);
  } catch (e) {
    // cache lỗi không được làm hỏng thao tác chính
  }
}


function invalidateDashCache() {
  try {
    var cache = CacheService.getScriptCache();
    var n = cache.get(CACHE_KEY + '_n');
    var keys = [CACHE_KEY + '_n'];
    if (n) {
      for (var i = 0; i < Number(n); i++) keys.push(CACHE_KEY + '_' + i);
    }
    cache.removeAll(keys);
  } catch (e) {}
}


// =============================================
// KHỞI TẠO SHEET LẦN ĐẦU
// =============================================

function setupSheets() {

  var ss = SpreadsheetApp.openById(_sheetId());

  var gdSheet = ss.getSheetByName(TAB_GIAODICH);
  if (!gdSheet) {
    gdSheet = ss.insertSheet(TAB_GIAODICH);
    gdSheet.appendRow(HEADERS_GIAODICH);
    formatHeaderRow(gdSheet);
  }

  var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
  if (!ttSheet) {
    ttSheet = ss.insertSheet(TAB_THANHTOAN);
    ttSheet.appendRow(HEADERS_THANHTOAN);
    formatHeaderRow(ttSheet);
  }

  var tkSheet = ss.getSheetByName(TAB_THONGKE);
  if (!tkSheet) {
    tkSheet = ss.insertSheet(TAB_THONGKE);
    setupThongKeSheet(tkSheet);
  }


  // Tab TheoNguon
  var nguonSheet = ss.getSheetByName(TAB_NGUON);
  if (!nguonSheet) {
    nguonSheet = ss.insertSheet(TAB_NGUON);
    setupTheoNguonSheet(nguonSheet);
  }

  // Tab TheoNguoiGD
  var nguoiSheet = ss.getSheetByName(TAB_NGUOIGD);
  if (!nguoiSheet) {
    nguoiSheet = ss.insertSheet(TAB_NGUOIGD);
    setupTheoNguoiSheet(nguoiSheet);
  }

  // Tab TheoThang
  var thangSheet = ss.getSheetByName(TAB_THANG);
  if (!thangSheet) {
    thangSheet = ss.insertSheet(TAB_THANG);
    setupTheoThangSheet(thangSheet);
  }

  // Tab DataLog (log lịch sử thay đổi)
  var logSheet = ss.getSheetByName(TAB_DATALOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(TAB_DATALOG);
    logSheet.appendRow(HEADERS_DATALOG);
    formatHeaderRow(logSheet);
  }

  // Đảm bảo có cột R "Chiều trao đổi"
  ensureSchemaV3();
  invalidateDashCache();

  return { success: true, message: 'Đã khởi tạo Sheet thành công!' };
}


// =============================================
// NÂNG CẤP SCHEMA: thêm cột R "Chiều trao đổi"
// CHẠY 1 LẦN sau khi dán code mới.
// =============================================

function ensureSchemaV3() {
  var ss = SpreadsheetApp.openById(_sheetId());
  var sh = ss.getSheetByName(TAB_GIAODICH);
  if (!sh) return { success: false, message: 'Chưa có tab DataGiaoDich' };

  if (sh.getMaxColumns() < 18) {
    sh.insertColumnsAfter(sh.getMaxColumns(), 18 - sh.getMaxColumns());
  }
  if (String(sh.getRange(1, 18).getValue() || '').trim() !== 'Chiều trao đổi') {
    sh.getRange(1, 18).setValue('Chiều trao đổi');
    formatHeaderRow(sh);
  }
  invalidateDashCache();
  return { success: true, message: 'OK — cột R "Chiều trao đổi" đã sẵn sàng' };
}


// =============================================
// CHẨN ĐOÁN: xem cột R đang lưu gì cho 1 mã GD
// Chạy trong editor, xem kết quả ở Execution log (Ctrl+Enter)
// =============================================

function debugChieu(maGD) {
  maGD = maGD || '';
  var ss = SpreadsheetApp.openById(_sheetId());
  var sh = ss.getSheetByName(TAB_GIAODICH);
  if (!sh) return 'Không tìm thấy tab DataGiaoDich';

  var out = [];
  out.push('Số cột tối đa của sheet: ' + sh.getMaxColumns());
  out.push('Tiêu đề cột R: "' + sh.getRange(1, 18).getValue() + '"');

  var last = sh.getLastRow();
  if (last < 2) { Logger.log(out.join('\n')); return out.join('\n'); }

  var data = sh.getRange(2, 1, last - 1, 18).getValues();
  var n = 0;
  data.forEach(function(r) {
    if (String(r[4] || '').toUpperCase().indexOf('TRAO') !== 0) return;
    if (maGD && String(r[0]) !== String(maGD)) return;
    n++;
    var v = String(r[17] || '');
    // in ra cả mã Unicode để phát hiện ký tự tổ hợp
    var codes = v.split('').map(function(c){ return c.charCodeAt(0); }).join(',');
    out.push(r[0] + ' | ' + r[5] + ' | chieu="' + v + '" | len=' + v.length + ' | unicode=[' + codes + ']');
  });
  if (!n) out.push('Không tìm thấy dòng TRAO ĐỔI nào' + (maGD ? ' cho mã ' + maGD : ''));

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}


function formatHeaderRow(sheet) {

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a1a2e');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  sheet.setFrozenRows(1);
}


// =============================================
// SETUP TAB THỐNG KÊ
// =============================================

function setupThongKeSheet(sheet) {

  sheet.getRange('A1').setValue('TỔNG QUAN').setFontWeight('bold').setFontSize(13);
  sheet.getRange('A2').setValue('Tổng số đơn hàng');
  sheet.getRange('B2').setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(DataGiaoDich!A2:A,DataGiaoDich!A2:A<>""))),0)');
  sheet.getRange('A3').setValue('Tổng tiền MUA vào (VND)');
  sheet.getRange('B3').setFormula('=IFERROR(SUMIF(DataGiaoDich!E:E,"MUA",DataGiaoDich!I:I),0)').setNumberFormat('#,##0');
  sheet.getRange('A4').setValue('Tổng tiền BÁN ra (VND)');
  sheet.getRange('B4').setFormula('=IFERROR(SUMIF(DataGiaoDich!E:E,"BÁN",DataGiaoDich!I:I),0)').setNumberFormat('#,##0');
  sheet.getRange('A5').setValue('Tổng đã thu (VND)');
  sheet.getRange('B5').setFormula('=IFERROR(SUM(DataThanhToan!D:D),0)').setNumberFormat('#,##0');
  sheet.getRange('A7').setValue('Xem chi tiết tại các tab: TheoNguon | TheoNguoiGD | TheoThang').setFontStyle('italic');
  formatHeaderRow(sheet);
}


// =============================================
// TAB: THỐNG KÊ THEO NGUỒN
// =============================================

function setupTheoNguonSheet(sheet) {

  sheet.getRange('A1').setValue('THỐNG KÊ THEO NGUỒN TIỀN').setFontWeight('bold').setFontSize(14);

  // Tổng theo nguồn
  sheet.getRange('A3').setValue('Hình thức GD').setFontWeight('bold');
  sheet.getRange('B3').setValue('Tổng tiền (VND)').setFontWeight('bold');
  sheet.getRange('C3').setValue('Số lần GD').setFontWeight('bold');
  formatHeaderRow(sheet);

  sheet.getRange("A4").setFormula('=IFERROR(QUERY(DataThanhToan!A:G,"SELECT F, SUM(D), COUNT(A) WHERE F IS NOT NULL GROUP BY F ORDER BY SUM(D) DESC LABEL F \'Hình thức GD\', SUM(D) \'Tổng tiền (VND)\', COUNT(A) \'Số lần GD\'",0),"Chưa có dữ liệu")');

  // Tiêu đề bảng MUA vs BÁN theo nguồn
  sheet.getRange('A10').setValue('PHÂN TÍCH MUA / BÁN THEO NGUỒN').setFontWeight('bold').setFontSize(13);
  sheet.getRange("A11").setFormula('=IFERROR(QUERY(DataGiaoDich!A:M,"SELECT J, E, SUM(I) WHERE J IS NOT NULL GROUP BY J, E ORDER BY SUM(I) DESC LABEL J \'Hình thức GD\', E \'Loại GD\', SUM(I) \'Tổng tiền (VND)\'",0),"Chưa có dữ liệu")');

  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 120);
}


// =============================================
// TAB: THỐNG KÊ THEO NGƯỜI GIAO DỊCH
// =============================================

function setupTheoNguoiSheet(sheet) {

  sheet.getRange('A1').setValue('THỐNG KÊ THEO NGƯỜI GIAO DỊCH').setFontWeight('bold').setFontSize(14);

  sheet.getRange("A3").setFormula('=IFERROR(QUERY(DataGiaoDich!A:M,"SELECT C, E, SUM(I), COUNT(A), MAX(D) WHERE C IS NOT NULL GROUP BY C, E ORDER BY SUM(I) DESC LABEL C \'Tên Shop\', E \'Loại GD\', SUM(I) \'Tổng tiền (VND)\', COUNT(A) \'Số lần\', MAX(D) \'Liên hệ\'",0),"Chưa có dữ liệu")');

  // Thống kê theo người & nguồn
  sheet.getRange('F1').setValue('THEO NGƯỜI & NGUỒN').setFontWeight('bold').setFontSize(14);
  sheet.getRange("F3").setFormula('=IFERROR(QUERY(DataGiaoDich!A:M,"SELECT C, J, SUM(I) WHERE C IS NOT NULL GROUP BY C, J ORDER BY SUM(I) DESC LABEL C \'Tên Shop\', J \'Hình thức GD\', SUM(I) \'Tổng tiền (VND)\'",0),"Chưa có dữ liệu")');

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 220);
  sheet.setColumnWidth(6, 200);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 150);
  formatHeaderRow(sheet);
}


// =============================================
// TAB: THỐNG KÊ THEO THÁNG
// =============================================

function setupTheoThangSheet(sheet) {

  sheet.getRange('A1').setValue('THỐNG KÊ THEO THÁNG').setFontWeight('bold').setFontSize(14);

  // Tổng hợp theo tháng + loại GD
  sheet.getRange("A3").setFormula('=IFERROR(QUERY(DataGiaoDich!A:M,"SELECT MONTH(B)+1, E, SUM(I), COUNT(A) WHERE B IS NOT NULL GROUP BY MONTH(B)+1, E ORDER BY MONTH(B)+1 LABEL MONTH(B)+1 \'Tháng\', E \'Loại GD\', SUM(I) \'Tổng tiền (VND)\', COUNT(A) \'Số lần\'",1),"Chưa có dữ liệu")');

  // Tổng theo tháng (gộp cả mua lẫn bán)
  sheet.getRange('F1').setValue('TỔNG DÒNG TIỀN THEO THÁNG').setFontWeight('bold').setFontSize(14);
  sheet.getRange("F3").setFormula('=IFERROR(QUERY(DataThanhToan!A:G,"SELECT MONTH(B)+1, SUM(D), COUNT(A) WHERE B IS NOT NULL GROUP BY MONTH(B)+1 ORDER BY MONTH(B)+1 LABEL MONTH(B)+1 \'Tháng\', SUM(D) \'Tổng đã thu (VND)\', COUNT(A) \'Số lần TT\'",1),"Chưa có dữ liệu")');

  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(6, 80);
  sheet.setColumnWidth(7, 150);
  sheet.setColumnWidth(8, 120);
  formatHeaderRow(sheet);
}


// =============================================
// ĐỒNG BỘ LINK LIÊN HỆ CHO TẤT CẢ GIAO DỊCH CÙNG TÊN SHOP
// =============================================

function syncContactLinkForShop(ss, tenShop, linkLH) {

  tenShop = String(tenShop || '').trim();
  linkLH  = String(linkLH || '').trim();
  if (!tenShop || !linkLH) return 0;

  var gdSheet = ss.getSheetByName(TAB_GIAODICH);
  if (!gdSheet || gdSheet.getLastRow() < 2) return 0;

  var lastRow = gdSheet.getLastRow();
  var nameCol = gdSheet.getRange(2, 3, lastRow - 1, 1).getValues(); // cột C - Tên Shop
  var linkCol = gdSheet.getRange(2, 4, lastRow - 1, 1).getValues(); // cột D - Link liên hệ

  var count = 0;
  for (var i = 0; i < nameCol.length; i++) {
    if (String(nameCol[i][0]).trim() === tenShop && String(linkCol[i][0] || '').trim() !== linkLH) {
      linkCol[i][0] = linkLH;
      count++;
    }
  }
  if (count > 0) gdSheet.getRange(2, 4, lastRow - 1, 1).setValues(linkCol);
  return count;
}


// =============================================
// LƯU GIAO DỊCH ĐƠN LẺ
// =============================================

function saveTransaction(data) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!gdSheet) return { success: false, message: 'Không tìm thấy tab DataGiaoDich' };

    // ── 1. AUTO-FILL LINK nếu để trống (1 read từ bộ nhớ) ──
    if (!data.linkLH && data.tenShop && gdSheet.getLastRow() > 1) {
      var lookup = gdSheet.getRange(2, 3, gdSheet.getLastRow() - 1, 2).getValues();
      for (var i = 0; i < lookup.length; i++) {
        if (String(lookup[i][0]).trim().toLowerCase() === String(data.tenShop).trim().toLowerCase() && lookup[i][1]) {
          data.linkLH = lookup[i][1]; break;
        }
      }
    }

    // ── 2. GHI DataThanhToan ──
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    if (!ttSheet) return { success: false, message: 'Không tìm thấy tab DataThanhToan' };
    ttSheet.appendRow([data.maGD, data.ngay, data.tenShop, parseFloat(data.soTien) || 0, data.loaiTT, data.nguon, data.ghiChu || '']);

    // ── 3. GHI DataGiaoDich: batch setValues thay vì nhiều appendRow ──
    var products = data.products && data.products.length > 0 ? data.products : [{ tenSP: '', sl: 1, donGia: parseFloat(data.soTien) || 0 }];
    var _sttDate = data.trangThaiDon ? (data.ngay || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')) : '';
    var newRows = products.map(function(p) {
      var thanhTien = (parseFloat(p.sl) || 1) * (parseFloat(p.donGia) || 0);
      return [data.maGD, data.ngay, data.tenShop, data.linkLH, data.loaiGD,
        p.tenSP, parseFloat(p.sl) || 1, parseFloat(p.donGia) || 0, thanhTien,
        data.nguon, data.maVanDon, data.trangThaiDon, data.trangThaiTT,
        data.rating || '', data.ghiChuGD || '', data.maGDGoc || '', _sttDate,
        p.chieu || ''];
    });
    var startRow = gdSheet.getLastRow() + 1;
    gdSheet.getRange(startRow, 1, newRows.length, 18).setValues(newRows);

    // ── 4. SYNC LINK LIÊN HỆ (1 read + 1 write) ──
    if (data.linkLH && data.tenShop) {
      syncContactLinkForShop(ss, data.tenShop, data.linkLH);
    }

    // ── 5. GHI LOG: tạo đơn mới (kèm mốc trạng thái đầu tiên) ──
    var soDonMoi = (parseFloat(data.soTien) || 0);
    var _initDetails = [];
    if (data.trangThaiDon) {
      _initDetails.push({ field: 'trangThaiDon', label: 'Trạng thái đơn', old: '', "new": data.trangThaiDon, date: _sttDate });
    }
    appendLog(ss, data.maGD, 'Tạo đơn',
      'Tạo đơn mới' + (data.tenShop ? ' — ' + data.tenShop : '') + (soDonMoi ? ' (' + _fmtVnd(soDonMoi) + ')' : ''),
      _initDetails);

    invalidateDashCache();
    return { success: true, message: 'Đã lưu thành công!' };
  } catch (e) {
    return { success: false, message: 'Lỗi: ' + e.toString() };
  }
}


// =============================================
// BULK SAVE NHIỀU GIAO DỊCH TỪ BILL
// =============================================

function saveBulkTransactions(bills) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!ttSheet || !gdSheet) return { success: false, message: 'Không tìm thấy tab dữ liệu' };

    var ttRows = [], gdRows = [];

    bills.forEach(function(bill) {
      ttRows.push([bill.maGD, bill.ngay, bill.tenShop, parseFloat(bill.soTien) || 0, bill.loaiTT || '', bill.nguon || '', bill.ghiChu || '']);
      var products = bill.products || [];
      if (products.length === 0) {
        gdRows.push([bill.maGD, bill.ngay, bill.tenShop, '', bill.loaiGD || '', '', '', '', parseFloat(bill.soTien) || 0, bill.nguon || '', '', '', '', '', '', bill.maGDGoc || '', '', '']);
      } else {
        products.forEach(function(p) {
          var tt = (parseFloat(p.sl) || 1) * (parseFloat(p.donGia) || 0);
          gdRows.push([bill.maGD, bill.ngay, bill.tenShop, '', bill.loaiGD || '', p.tenSP, parseFloat(p.sl) || 1, parseFloat(p.donGia) || 0, tt, bill.nguon || '', '', '', '', '', '', bill.maGDGoc || '', '', p.chieu || '']);
        });
      }
    });

    // 2 Sheets API calls tổng cộng thay vì N*2 calls
    if (ttRows.length) ttSheet.getRange(ttSheet.getLastRow() + 1, 1, ttRows.length, 7).setValues(ttRows);
    if (gdRows.length) gdSheet.getRange(gdSheet.getLastRow() + 1, 1, gdRows.length, 18).setValues(gdRows);

    // GHI LOG: mỗi bill = 1 entry "Tạo đơn"
    bills.forEach(function(bill) {
      var so = parseFloat(bill.soTien) || 0;
      appendLog(ss, bill.maGD, 'Tạo đơn',
        'Tạo đơn mới' + (bill.tenShop ? ' — ' + bill.tenShop : '') + (so ? ' (' + _fmtVnd(so) + ')' : ''),
        []);
    });

    invalidateDashCache();
    return { success: true, message: 'Đã lưu ' + bills.length + ' giao dịch!' };
  } catch (e) {
    return { success: false, message: 'Lỗi: ' + e.toString() };
  }
}


// =============================================
// LẤY LỊCH SỬ GIAO DỊCH GẦN ĐÂY
// =============================================

function getHistory(limit) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    if (!ttSheet || ttSheet.getLastRow() < 2) return { success: true, data: [] };

    var lastRow = ttSheet.getLastRow();
    var numRows = Math.min(lastRow - 1, limit || 30);
    var startRow = lastRow - numRows + 1;
    var values = ttSheet.getRange(startRow, 1, numRows, 7).getValues();

    var result = [];
    values.forEach(function(row, i) {
      if (row[0]) {
        result.push({
          rowIndex: startRow + i, // row index thực trong sheet (1-based)
          maGD:    row[0],
          ngay:    row[1] ? Utilities.formatDate(new Date(row[1]), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') : '',
          tenShop: row[2],
          soTien:  row[3],
          loaiTT:  row[4],
          nguon:   row[5],
          ghiChu:  row[6]
        });
      }
    });

    return { success: true, data: result.reverse() };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// XÓA GIAO DỊCH THEO MÃ GD
// =============================================

function deleteTransaction(maGD) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var deleted = 0;

    [TAB_THANHTOAN, TAB_GIAODICH].forEach(function(tabName) {
      var sheet = ss.getSheetByName(tabName);
      if (!sheet || sheet.getLastRow() < 2) return;

      // Duyệt từ dưới lên để xóa không bị lệch index
      for (var i = sheet.getLastRow(); i >= 2; i--) {
        var cellVal = sheet.getRange(i, 1).getValue();
        if (cellVal == maGD) {
          sheet.deleteRow(i);
          deleted++;
        }
      }
    });

    invalidateDashCache();
    return { success: true, message: 'Đã xóa ' + deleted + ' dòng của mã ' + maGD };
  } catch (e) {
    return { success: false, message: 'Lỗi xóa: ' + e.toString() };
  }
}


// =============================================
// ĐỌC ẢNH BILL BẰNG CLAUDE API
// =============================================

function readBillImage(base64Image, mimeType) {

  try {
    var apiKey = _prop('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return { success: false, message: 'Chưa cấu hình ANTHROPIC_API_KEY trong Script Properties' };
    }

    var payload = {
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: base64Image }
          },
          {
            type: 'text',
            text: 'Đây là ảnh bill chuyển khoản ngân hàng TPBank. Hãy đọc và trích xuất thông tin sau dưới dạng JSON thuần túy (không markdown, không backtick):\n{"ngay":"DD/MM/YYYY","soTien":500000,"tenNguoiNhan":"Tên người nhận hoặc tên shop","ghiChu":"Nội dung chuyển khoản nếu có"}\nNếu không đọc được trường nào thì để chuỗi rỗng hoặc 0.'
          }
        ]
      }]
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
    var result = JSON.parse(response.getContentText());

    if (result.content && result.content[0]) {
      var text = result.content[0].text.trim().replace(/```json|```/g, '').trim();
      return { success: true, data: JSON.parse(text) };
    }
    return { success: false, message: 'Không đọc được nội dung từ API' };
  } catch (e) {
    return { success: false, message: 'Lỗi đọc ảnh: ' + e.toString() };
  }
}


// =============================================
// IMPORT TỪ EXCEL (gọi từ frontend)
// =============================================

function importFromExcel(rows) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!ttSheet || !gdSheet) return { success: false, message: 'Không tìm thấy tab dữ liệu' };

    var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');

    // DataThanhToan: ghi riêng từng dòng theo từng mã GD để khớp đúng khi tính "đã thu"
    var ttRowsToAdd = rows.map(function(row) {
      return [
        row.maGD || '',
        row.ngay || today,
        row.tenShop || '',
        parseFloat(row.soTien) || 0,
        row.loaiTT || 'Thanh toán full 1 lần',
        row.nguon || '',
        'Import từ Excel'
      ];
    });
    if (ttRowsToAdd.length) {
      ttSheet.getRange(ttSheet.getLastRow() + 1, 1, ttRowsToAdd.length, 7).setValues(ttRowsToAdd);
    }

    // DataGiaoDich: ghi từng dòng chi tiết
    var gdRowsToAdd = rows.map(function(row) {
      return [
        row.maGD || '',
        row.ngay || '',
        row.tenShop || '',
        '',
        row.loaiGD || 'BÁN',
        row.matHang || '',
        1,
        parseFloat(row.soTien) || 0,
        parseFloat(row.soTien) || 0,
        row.nguon || '',
        '',
        '',
        row.loaiTT || '',
        '',
        '',
        '',
        '',
        ''
      ];
    });
    if (gdRowsToAdd.length) {
      gdSheet.getRange(gdSheet.getLastRow() + 1, 1, gdRowsToAdd.length, 18).setValues(gdRowsToAdd);
    }

    invalidateDashCache();
    return { success: true, message: 'Đã import ' + rows.length + ' giao dịch!' };
  } catch(e) {
    return { success: false, message: 'Lỗi: ' + e.toString() };
  }
}


// =============================================
// LẤY CHI TIẾT GIAO DỊCH THEO MÃ GD
// =============================================

function getTransactionByMaGD(maGD) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!gdSheet || gdSheet.getLastRow() < 2) return { success: false, message: 'Không tìm thấy dữ liệu' };

    var data = gdSheet.getRange(2, 1, gdSheet.getLastRow() - 1, 18).getValues();
    var rows = data.filter(function(row) { return String(row[0]) === String(maGD); });

    if (!rows.length) return { success: false, message: 'Không tìm thấy mã GD: ' + maGD };

    // Lấy thông tin chung từ dòng đầu
    var first = rows[0];
    var result = {
      maGD:        first[0],
      ngay:        first[1] ? Utilities.formatDate(new Date(first[1]), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : '',
      tenShop:     first[2],
      linkLH:      first[3],
      loaiGD:      first[4],
      nguon:       first[9],
      maVanDon:    first[10],
      trangThaiDon: first[11],
      trangThaiTT:  first[12],
      rating:      first[13],
      ghiChuGD:    first[14],
      maGDGoc:     first[15] || '',
      ngayTrangThai: first[16] ? _normVal(first[16], 'ngay') : '',
      products: rows.map(function(row) {
        return {
          tenSP:   row[5],
          sl:      row[6],
          donGia:  row[7],
          thanhTien: row[8],
          chieu:   row[17] || ''
        };
      })
    };
    return { success: true, data: result };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// CẬP NHẬT GIAO DỊCH - BATCH I/O
// =============================================

function updateTransaction(maGD, info, products, soTienLanNay) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!gdSheet) return { success: false, message: 'Không tìm thấy tab DataGiaoDich' };

    // ── 1. ĐỌC TRẠNG THÁI CŨ CỦA ĐƠN (để so sánh ghi log) ──────────────
    var lastRow = gdSheet.getLastRow();
    var allData = lastRow > 1 ? gdSheet.getRange(2, 1, lastRow - 1, 18).getValues() : [];
    var oldRows = allData.filter(function(r){ return String(r[0]) === String(maGD); });

    var _oldFirst = oldRows.length ? oldRows[0] : null;
    var _oldStatus = _oldFirst ? String(_oldFirst[11] || '') : '';
    var _oldStatusDate = _oldFirst ? _normVal(_oldFirst[16], 'ngay') : '';
    var _newStatus = String(info.trangThaiDon || '');
    info.ngayTrangThai = (_newStatus && _newStatus !== _oldStatus)
      ? Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')
      : _oldStatusDate;

    // ── 2. GHI LẠI TOÀN BỘ ĐƠN ─────────────────────────────────────────
    _rewriteGiaoDich(ss, gdSheet, maGD, info, products);

    // ── 3. GHI THANH TOÁN (chỉ khi có tiền mới) ────────────────────────
    var soTien = parseFloat(soTienLanNay) || 0;
    if (soTien > 0) {
      var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
      if (ttSheet) {
        var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
        ttSheet.appendRow([maGD, today, info.tenShop, soTien, info.trangThaiTT || '', info.nguon || '', '']);
      }
    }

    // ── 4. TÍNH DIFF + GHI 1 LOG "Cập nhật" (nếu có thay đổi) ───────────
    var diff = _computeDiff(oldRows, info, products, soTien);
    if (diff.changes.length > 0) {
      appendLog(ss, maGD, 'Cập nhật', diff.summary, diff.changes);
    }

    invalidateDashCache();
    return { success: true, message: 'Đã cập nhật ' + products.length + ' sản phẩm cho ' + maGD };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// HELPER: ghi lại toàn bộ dòng của 1 maGD (clear + rewrite)
// =============================================

function _rewriteGiaoDich(ss, gdSheet, maGD, info, products) {
  var lastRow = gdSheet.getLastRow();
  var allData = lastRow > 1 ? gdSheet.getRange(2, 1, lastRow - 1, 18).getValues() : [];

  // Giữ lại dòng KHÔNG thuộc maGD này
  var kept = allData.filter(function(r){ return String(r[0]) !== String(maGD); });

  // Dựng lại các dòng của maGD từ info + products
  var newRows = products.map(function(p) {
    var thanhTien = (parseFloat(p.sl) || 1) * (parseFloat(p.donGia) || 0);
    return [
      maGD, info.ngay, info.tenShop, info.linkLH || '',
      info.loaiGD, p.tenSP,
      parseFloat(p.sl) || 1, parseFloat(p.donGia) || 0, thanhTien,
      info.nguon || '', info.maVanDon || '',
      info.trangThaiDon || '', info.trangThaiTT || '',
      info.rating || '', info.ghiChuGD || '', info.maGDGoc || '', info.ngayTrangThai || '',
      p.chieu || ''
    ];
  });

  // Sync link liên hệ trong bộ nhớ (không thêm Sheets call)
  if (info.linkLH && info.tenShop) {
    var tenShopNorm = String(info.tenShop).trim();
    kept = kept.map(function(r) {
      if (String(r[2]).trim() === tenShopNorm && String(r[3] || '').trim() !== info.linkLH) {
        r[3] = info.linkLH;
      }
      return r;
    });
  }

  var finalRows = kept.concat(newRows);
  gdSheet.clearContents();
  gdSheet.appendRow(HEADERS_GIAODICH);
  if (finalRows.length > 0) {
    gdSheet.getRange(2, 1, finalRows.length, 18).setValues(finalRows);
  }
}


// =============================================
// HELPER: so sánh trạng thái cũ vs mới -> danh sách thay đổi + tóm tắt
// =============================================

function _computeDiff(oldRows, info, products, soTien) {
  var changes = [];
  var parts = [];
  var fieldMap = [
    { key: 'ngay',         col: 1,  label: 'Ngày' },
    { key: 'tenShop',      col: 2,  label: 'Người GD' },
    { key: 'linkLH',       col: 3,  label: 'Link liên hệ' },
    { key: 'loaiGD',       col: 4,  label: 'Loại GD' },
    { key: 'nguon',        col: 9,  label: 'Hình thức GD' },
    { key: 'maVanDon',     col: 10, label: 'Mã vận đơn' },
    { key: 'trangThaiDon', col: 11, label: 'Trạng thái đơn' },
    { key: 'trangThaiTT',  col: 12, label: 'Trạng thái TT' },
    { key: 'rating',       col: 13, label: 'Rating' },
    { key: 'ghiChuGD',     col: 14, label: 'Ghi chú' },
    { key: 'maGDGoc',      col: 15, label: 'Mã GD gốc' }
  ];
  var oldFirst = oldRows.length ? oldRows[0] : null;
  fieldMap.forEach(function(f) {
    var oldVal = oldFirst ? _normVal(oldFirst[f.col], f.key) : '';
    var newVal = _normVal(info[f.key], f.key);
    if (oldVal !== newVal) {
      var ch = { field: f.key, label: f.label, old: oldVal, "new": newVal };
      if (f.key === 'trangThaiDon') ch.date = _normVal(info.ngayTrangThai, 'ngay');
      changes.push(ch);
      parts.push(f.label + ': ' + (oldVal || '(trống)') + ' → ' + (newVal || '(trống)'));
    }
  });

  // So sánh sản phẩm (kèm chiều trao đổi)
  var oldProducts = oldRows.map(function(r) {
    return { tenSP: String(r[5] || ''), sl: Number(r[6]) || 0, donGia: Number(r[7]) || 0, chieu: String(r[17] || '') };
  });
  var newProducts = products.map(function(p) {
    return { tenSP: String(p.tenSP || ''), sl: Number(p.sl) || 0, donGia: Number(p.donGia) || 0, chieu: String(p.chieu || '') };
  });
  if (JSON.stringify(oldProducts) !== JSON.stringify(newProducts)) {
    changes.push({
      field: 'products', label: 'Sản phẩm',
      old: oldProducts.length + ' mặt hàng', "new": newProducts.length + ' mặt hàng',
      oldProducts: oldProducts, newProducts: newProducts
    });
    parts.push('Sản phẩm: ' + oldProducts.length + ' → ' + newProducts.length + ' mặt hàng');
  }

  // Thanh toán mới (ghi nhận trong log, không hoàn tác được -> field bắt đầu bằng "_")
  if (soTien > 0) {
    changes.push({ field: '_thanhToan', label: 'Thanh toán', old: '', "new": '+' + soTien });
    parts.push('Thanh toán: +' + _fmtVnd(soTien));
  }

  return { changes: changes, summary: parts.join('; ') };
}


function _normVal(v, key) {
  if (v === null || v === undefined) return '';
  if (key === 'ngay') {
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    var s = String(v).trim();
    if (s.indexOf('-') >= 0 || s.indexOf('/') >= 0) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    }
    return s;
  }
  if (key === 'rating') return String(parseInt(v) || 0);
  return String(v).trim();
}


// =============================================
// HELPER: ghi 1 dòng vào DataLog (tự tạo tab nếu chưa có)
// =============================================

function appendLog(ss, maGD, loaiThaoTac, summary, details) {
  try {
    var sheet = ss.getSheetByName(TAB_DATALOG);
    if (!sheet) {
      sheet = ss.insertSheet(TAB_DATALOG);
      sheet.appendRow(HEADERS_DATALOG);
      formatHeaderRow(sheet);
    }
    var logId = 'LOG' + new Date().getTime() + Math.floor(Math.random() * 1000);
    var ts = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([logId, ts, maGD, loaiThaoTac, summary || '', JSON.stringify(details || [])]);
    return logId;
  } catch (e) {
    return null; // không để lỗi log làm hỏng thao tác chính
  }
}


function _fmtVnd(n) {
  n = Number(n) || 0;
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}


// =============================================
// LOAD TOÀN BỘ DATA CHO DASHBOARD (có cache)
// =============================================

function getDashboardData() {
  var cached = _cacheGetDash();
  if (cached) {
    cached.fromCache = true;
    return cached;
  }
  var result = _buildDashboardData();
  if (result && result.success) _cachePutDash(result);
  return result;
}


function _buildDashboardData() {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);

    var gdData = [];
    var ttData = [];

    if (gdSheet && gdSheet.getLastRow() > 1) {
      var gdRaw = gdSheet.getRange(2, 1, gdSheet.getLastRow() - 1, 18).getValues();
      gdRaw.forEach(function(row) {
        if (!row[0]) return;
        gdData.push({
          maGD:      row[0],
          ngay:      row[1] ? Utilities.formatDate(new Date(row[1]), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : '',
          tenShop:   row[2],
          linkLH:    row[3] || '',
          loaiGD:    row[4],
          tenSP:     row[5],
          sl:        row[6],
          donGia:    row[7],
          soTien:    parseFloat(row[8]) || 0,
          nguon:     row[9],
          maVanDon:  row[10] || '',
          trangThaiDon: row[11],
          trangThaiTT:  row[12],
          rating:    parseInt(row[13]) || 0,
          ghiChuGD:  row[14] || '',
          maGDGoc:   row[15] || '',
          ngayTrangThai: row[16] ? _normVal(row[16], 'ngay') : '',
          chieu:     row[17] || ''
        });
      });
    }

    if (ttSheet && ttSheet.getLastRow() > 1) {
      var ttRaw = ttSheet.getRange(2, 1, ttSheet.getLastRow() - 1, 7).getValues();
      ttRaw.forEach(function(row) {
        if (!row[0]) return;
        ttData.push({
          maGD:    row[0],
          ngay:    row[1] ? Utilities.formatDate(new Date(row[1]), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : '',
          tenShop: row[2],
          soTien:  parseFloat(row[3]) || 0,
          loaiTT:  row[4],
          nguon:   row[5]
        });
      });
    }

    // Tính tổng đã thu theo từng mã GD (cộng dồn các lần thanh toán)
    var daThuByMaGD = {};
    ttData.forEach(function(t) {
      if (!t.maGD) return;
      daThuByMaGD[t.maGD] = (daThuByMaGD[t.maGD] || 0) + t.soTien;
    });
    gdData.forEach(function(g) {
      g.daThu = daThuByMaGD[g.maGD] || 0;
    });

    // Vá tạm Link liên hệ còn thiếu
    var linkByShop = {};
    gdData.forEach(function(g) {
      var key = String(g.tenShop || '').trim();
      if (key && g.linkLH && !linkByShop[key]) linkByShop[key] = g.linkLH;
    });
    gdData.forEach(function(g) {
      var key = String(g.tenShop || '').trim();
      if (!g.linkLH && key && linkByShop[key]) g.linkLH = linkByShop[key];
    });

    return { success: true, gdData: gdData, ttData: ttData };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// TỰ SINH MÃ GD TĂNG DẦN (fallback — frontend tự tính từ cache)
// =============================================

function getNextMaGD() {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!gdSheet || gdSheet.getLastRow() < 2) return { success: true, maGD: 'GD001' };

    var data = gdSheet.getRange(2, 1, gdSheet.getLastRow() - 1, 1).getValues();
    var maxNum = 0;
    data.forEach(function(row) {
      var val = String(row[0]);
      var match = val.match(/GD(\d+)/i);
      if (match) {
        var num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });

    // Check DataThanhToan cũng
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    if (ttSheet && ttSheet.getLastRow() > 1) {
      var ttData = ttSheet.getRange(2, 1, ttSheet.getLastRow() - 1, 1).getValues();
      ttData.forEach(function(row) {
        var val = String(row[0]);
        var match = val.match(/GD(\d+)/i);
        if (match) {
          var num = parseInt(match[1]);
          if (num > maxNum) maxNum = num;
        }
      });
    }

    var next = 'GD' + String(maxNum + 1).padStart(3, '0');
    return { success: true, maGD: next };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// SỬA NHANH: ghi đè vĩnh viễn Link liên hệ còn thiếu
// =============================================

function repairContactLinks() {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!gdSheet || gdSheet.getLastRow() < 2) return { success: true, message: 'Không có dữ liệu để sửa' };

    var lastRow = gdSheet.getLastRow();
    var nameCol = gdSheet.getRange(2, 3, lastRow - 1, 1).getValues(); // cột C
    var linkCol = gdSheet.getRange(2, 4, lastRow - 1, 1).getValues(); // cột D

    // Gom link đã biết theo Tên Shop
    var linkByShop = {};
    for (var i = 0; i < nameCol.length; i++) {
      var key = String(nameCol[i][0] || '').trim();
      var link = String(linkCol[i][0] || '').trim();
      if (key && link && !linkByShop[key]) linkByShop[key] = link;
    }

    // Điền lại cho các dòng còn thiếu
    var updated = 0;
    for (var j = 0; j < nameCol.length; j++) {
      var key2 = String(nameCol[j][0] || '').trim();
      var cur = String(linkCol[j][0] || '').trim();
      if (!cur && key2 && linkByShop[key2]) {
        linkCol[j][0] = linkByShop[key2];
        updated++;
      }
    }

    if (updated > 0) {
      gdSheet.getRange(2, 4, lastRow - 1, 1).setValues(linkCol);
      invalidateDashCache();
    }

    return { success: true, message: updated > 0 ? ('Đã bổ sung Link liên hệ cho ' + updated + ' giao dịch!') : 'Không có Link liên hệ nào cần bổ sung — dữ liệu đã đồng bộ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// SỬA NHANH: backfill DataThanhToan cho các mã GD thiếu dòng thanh toán
// (bỏ qua đơn TRAO ĐỔI vì không có tiền)
// =============================================

function repairMissingPayments() {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    if (!gdSheet || !ttSheet) return { success: false, message: 'Không tìm thấy tab dữ liệu' };

    var gdLast = gdSheet.getLastRow();
    var ttLast = ttSheet.getLastRow();
    if (gdLast < 2) return { success: true, message: 'Không có dữ liệu để sửa' };

    var gdData = gdSheet.getRange(2, 1, gdLast - 1, 13).getValues();
    var ttMaGDSet = {};
    if (ttLast > 1) {
      var ttData = ttSheet.getRange(2, 1, ttLast - 1, 1).getValues();
      ttData.forEach(function(row) {
        var v = String(row[0] || '').trim();
        if (v) ttMaGDSet[v] = true;
      });
    }

    // Gom tổng tiền theo mã GD cho những mã GD CHƯA có trong DataThanhToan
    var missing = {}; // maGD -> {tongTien, ngay, tenShop, nguon, loaiTT}
    gdData.forEach(function(row) {
      var maGD = String(row[0] || '').trim();
      if (!maGD || ttMaGDSet[maGD]) return; // đã có rồi, bỏ qua
      if (String(row[4] || '').toUpperCase() === 'TRAO ĐỔI') return; // đơn trao đổi: không có tiền
      if (!missing[maGD]) {
        missing[maGD] = {
          tongTien: 0,
          ngay: row[1] || '',
          tenShop: row[2] || '',
          nguon: row[9] || '',
          loaiTT: 'Thanh toán full 1 lần'
        };
      }
      missing[maGD].tongTien += parseFloat(row[8]) || 0;
    });

    var maGDs = Object.keys(missing);
    if (!maGDs.length) return { success: true, message: 'Không có giao dịch nào bị thiếu — dữ liệu đã đầy đủ!' };

    var rowsToAdd = maGDs.map(function(maGD) {
      var m = missing[maGD];
      return [maGD, m.ngay, m.tenShop, m.tongTien, m.loaiTT, m.nguon, 'Tự động bổ sung (sửa lỗi import)'];
    });
    ttSheet.getRange(ttSheet.getLastRow() + 1, 1, rowsToAdd.length, 7).setValues(rowsToAdd);

    invalidateDashCache();
    return { success: true, message: 'Đã bổ sung ' + maGDs.length + ' giao dịch thiếu thanh toán!' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// LẤY DANH SÁCH NGƯỜI GIAO DỊCH CŨ (fallback — frontend tự tính từ cache)
// =============================================

function getKnownContacts() {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!gdSheet || gdSheet.getLastRow() < 2) return { success: true, data: [] };

    var data = gdSheet.getRange(2, 1, gdSheet.getLastRow() - 1, 10).getValues();
    var map = {};
    data.forEach(function(row) {
      var name = String(row[2] || '').trim();
      if (!name) return;
      if (!map[name]) map[name] = { tenShop: name, linkLH: '', nguon: '' };
      if (row[3] && !map[name].linkLH) map[name].linkLH = row[3];
      if (row[9] && !map[name].nguon) map[name].nguon = row[9];
    });

    return { success: true, data: Object.values(map) };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// CẬP NHẬT TÊN / LIÊN HỆ NGƯỜI GIAO DỊCH
// =============================================

function updateContactInfo(oldTenShop, newTenShop, newLinkLH) {

  try {
    oldTenShop = String(oldTenShop || '').trim();
    newTenShop = String(newTenShop || '').trim();
    newLinkLH  = String(newLinkLH || '').trim();

    if (!oldTenShop) return { success: false, message: 'Thiếu tên người giao dịch cũ' };
    if (!newTenShop) return { success: false, message: 'Tên người giao dịch không được để trống' };

    var ss = SpreadsheetApp.openById(_sheetId());
    var updatedGD = 0;
    var updatedTT = 0;

    // --- Cập nhật DataGiaoDich: cột C = Tên Shop, cột D = Link liên hệ ---
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (gdSheet && gdSheet.getLastRow() > 1) {
      var gdLast = gdSheet.getLastRow();
      var nameCol = gdSheet.getRange(2, 3, gdLast - 1, 1).getValues();    // cột C
      var linkCol = gdSheet.getRange(2, 4, gdLast - 1, 1).getValues();    // cột D
      for (var i = 0; i < nameCol.length; i++) {
        if (String(nameCol[i][0]).trim() === oldTenShop) {
          nameCol[i][0] = newTenShop;
          linkCol[i][0] = newLinkLH;
          updatedGD++;
        }
      }
      if (updatedGD > 0) {
        gdSheet.getRange(2, 3, gdLast - 1, 1).setValues(nameCol);
        gdSheet.getRange(2, 4, gdLast - 1, 1).setValues(linkCol);
      }
    }

    // --- Cập nhật DataThanhToan: cột C = Tên Shop ---
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    if (ttSheet && ttSheet.getLastRow() > 1) {
      var ttLast = ttSheet.getLastRow();
      var ttNameCol = ttSheet.getRange(2, 3, ttLast - 1, 1).getValues();
      for (var k = 0; k < ttNameCol.length; k++) {
        if (String(ttNameCol[k][0]).trim() === oldTenShop) {
          ttNameCol[k][0] = newTenShop;
          updatedTT++;
        }
      }
      if (updatedTT > 0) {
        ttSheet.getRange(2, 3, ttLast - 1, 1).setValues(ttNameCol);
      }
    }

    if (updatedGD === 0 && updatedTT === 0) {
      return { success: false, message: 'Không tìm thấy giao dịch nào của "' + oldTenShop + '"' };
    }

    invalidateDashCache();
    return {
      success: true,
      message: 'Đã cập nhật ' + updatedGD + ' dòng giao dịch và ' + updatedTT + ' dòng thanh toán!',
      tenShop: newTenShop,
      linkLH: newLinkLH
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// CHẠY 1 LẦN: cập nhật lại công thức tab TheoNguoiGD
// =============================================

function refreshTheoNguoiGD() {

  var ss = SpreadsheetApp.openById(_sheetId());
  var sheet = ss.getSheetByName(TAB_NGUOIGD);
  if (!sheet) { sheet = ss.insertSheet(TAB_NGUOIGD); }
  setupTheoNguoiSheet(sheet);
  return { success: true, message: 'Đã cập nhật cột Liên hệ vào tab TheoNguoiGD!' };
}


// =============================================
// VẬN CHUYỂN: gom DataGiaoDich theo Mã vận đơn
// =============================================

function getShippingData() {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!gdSheet || gdSheet.getLastRow() < 2) return { success: true, data: [] };

    var rows = gdSheet.getRange(2, 1, gdSheet.getLastRow() - 1, 16).getValues();

    // Timestamp lần đổi trạng thái đơn gần nhất theo từng mã GD (đọc từ DataLog)
    var statusTsByMaGD = {};
    var logSheet = ss.getSheetByName(TAB_DATALOG);
    if (logSheet && logSheet.getLastRow() > 1) {
      var logs = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 6).getValues();
      logs.forEach(function(l) {
        var maGD = String(l[2] || '');
        if (!maGD) return;
        var details = [];
        try { details = JSON.parse(l[5] || '[]'); } catch (e) {}
        var hasStatus = details.some(function(d){ return d.field === 'trangThaiDon'; });
        if (!hasStatus) return;
        var ts = l[1];
        var tsStr = (ts instanceof Date)
          ? Utilities.formatDate(ts, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss')
          : String(ts);
        if (!statusTsByMaGD[maGD] || tsStr > statusTsByMaGD[maGD]) statusTsByMaGD[maGD] = tsStr;
      });
    }

    var groups = {};
    var order = [];
    rows.forEach(function(r) {
      var maGD = String(r[0] || '');
      if (!maGD) return;
      var maVanDon = String(r[10] || '').trim();
      var key = maVanDon ? ('VD::' + maVanDon) : ('GD::' + maGD);
      if (!groups[key]) {
        groups[key] = {
          maVanDon: maVanDon,
          nguon: String(r[9] || ''),
          nguoiGD: {},
          maGDs: {},
          matHang: [],
          trangThai: String(r[11] || ''),
          ngayGD: ''
        };
        order.push(key);
      }
      var g = groups[key];
      var tenShop = String(r[2] || '');
      if (tenShop) g.nguoiGD[tenShop] = true;
      g.maGDs[maGD] = true;
      var sp = String(r[5] || '').trim();
      if (sp) g.matHang.push(sp);
      if (r[11]) g.trangThai = String(r[11]);
      if (!g.nguon && r[9]) g.nguon = String(r[9]);
      var ds = _normVal(r[1], 'ngay');
      if (ds && ds > g.ngayGD) g.ngayGD = ds;
    });

    var result = order.map(function(key) {
      var g = groups[key];
      var maGDList = Object.keys(g.maGDs);
      var ngay = '';
      maGDList.forEach(function(m) {
        if (statusTsByMaGD[m] && statusTsByMaGD[m] > ngay) ngay = statusTsByMaGD[m];
      });
      // gọn mặt hàng: bỏ trùng, giữ thứ tự
      var seen = {}, mh = [];
      g.matHang.forEach(function(x){ if(x && !seen[x]){ seen[x]=1; mh.push(x); } });
      return {
        maVanDon: g.maVanDon,
        nguon: g.nguon,
        nguoiGD: Object.keys(g.nguoiGD).join(', '),
        matHang: mh.join(', '),
        maGDs: maGDList,
        soDon: maGDList.length,
        trangThai: g.trangThai,
        ngayGD: g.ngayGD,
        ngayGDHienThi: g.ngayGD ? g.ngayGD.split('-').reverse().join('/') : '',
        ngayCapNhat: ngay ? ngay.split(' ')[0].split('-').reverse().join('/') : ''
      };
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// CẬP NHẬT VẬN CHUYỂN HÀNG LOẠT theo nhóm mã vận đơn
// =============================================

function updateShippingBulk(maGDList, newMaVanDon, newTrangThaiDon, ngayTrangThai) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!gdSheet) return { success: false, message: 'Không tìm thấy tab DataGiaoDich' };

    var lastRow = gdSheet.getLastRow();
    if (lastRow < 2) return { success: false, message: 'Không có dữ liệu' };
    if (!maGDList || !maGDList.length) return { success: false, message: 'Không có đơn để cập nhật' };

    var set = {};
    maGDList.forEach(function(m){ set[String(m)] = true; });
    newMaVanDon = (newMaVanDon === undefined || newMaVanDon === null) ? '' : String(newMaVanDon).trim();
    newTrangThaiDon = (newTrangThaiDon === undefined || newTrangThaiDon === null) ? '' : String(newTrangThaiDon);
    ngayTrangThai = ngayTrangThai ? String(ngayTrangThai) : Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');

    var data = gdSheet.getRange(2, 1, lastRow - 1, 18).getValues();
    var kl = [];        // cột K (11) + L (12)
    var qCol = [];      // cột Q (17) - ngày cập nhật TT đơn
    var changed = {};   // maGD -> { oldVD, oldStatus }
    data.forEach(function(row) {
      var isTarget = set[String(row[0])];
      var oldVD = row[10], oldStatus = row[11];
      if (isTarget) {
        var diffVD = String(oldVD || '') !== String(newMaVanDon || '');
        var diffSt = String(oldStatus || '') !== String(newTrangThaiDon || '');
        row[10] = newMaVanDon;
        row[11] = newTrangThaiDon;
        if (diffSt) row[16] = ngayTrangThai; // chỉ ghi ngày khi trạng thái thực sự đổi
        if ((diffVD || diffSt) && !changed[row[0]]) {
          changed[row[0]] = { oldVD: oldVD, oldStatus: oldStatus };
        }
      }
      kl.push([row[10], row[11]]);
      qCol.push([row[16]]);
    });
    gdSheet.getRange(2, 11, lastRow - 1, 2).setValues(kl);
    gdSheet.getRange(2, 17, lastRow - 1, 1).setValues(qCol);

    var nChanged = 0;
    Object.keys(changed).forEach(function(m) {
      var c = changed[m];
      var changes = [], parts = [];
      if (String(c.oldVD || '') !== String(newMaVanDon || '')) {
        changes.push({ field: 'maVanDon', label: 'Mã vận đơn', old: String(c.oldVD || ''), "new": newMaVanDon });
        parts.push('Mã vận đơn: ' + (c.oldVD || '(trống)') + ' → ' + (newMaVanDon || '(trống)'));
      }
      if (String(c.oldStatus || '') !== String(newTrangThaiDon || '')) {
        changes.push({ field: 'trangThaiDon', label: 'Trạng thái đơn', old: String(c.oldStatus || ''), "new": newTrangThaiDon, date: _normVal(ngayTrangThai, 'ngay') });
        parts.push('Trạng thái đơn: ' + (c.oldStatus || '(trống)') + ' → ' + (newTrangThaiDon || '(trống)'));
      }
      if (changes.length) { appendLog(ss, m, 'Cập nhật', parts.join('; '), changes); nChanged++; }
    });

    invalidateDashCache();
    return { success: true, message: 'Đã cập nhật vận chuyển cho ' + Object.keys(set).length + ' đơn (' + nChanged + ' đơn thay đổi)' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// LOG THAY ĐỔI CỦA 1 ĐƠN (mới nhất trước)
// =============================================

function getTransactionLog(maGD) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var logSheet = ss.getSheetByName(TAB_DATALOG);
    if (!logSheet || logSheet.getLastRow() < 2) return { success: true, data: [] };

    var rows = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 6).getValues();
    var result = [];
    rows.forEach(function(r) {
      if (String(r[2]) !== String(maGD)) return;
      var ts = r[1];
      var tsStr = (ts instanceof Date)
        ? Utilities.formatDate(ts, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm')
        : String(ts);
      var details = [];
      try { details = JSON.parse(r[5] || '[]'); } catch (e) {}
      var canRevert = (r[3] === 'Cập nhật') && details.some(function(d) {
        return d.field === 'products' || (d.field && String(d.field).charAt(0) !== '_');
      });
      result.push({
        logId: r[0], timestamp: tsStr, maGD: r[2],
        loai: r[3], summary: r[4], canRevert: canRevert
      });
    });

    return { success: true, data: result.reverse() };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// TOÀN BỘ LOG THAY ĐỔI (mọi đơn) - cho trang Lịch sử thay đổi
// =============================================

function getAllLogs() {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var logSheet = ss.getSheetByName(TAB_DATALOG);
    if (!logSheet || logSheet.getLastRow() < 2) return { success: true, data: [] };

    var rows = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 6).getValues();
    var result = rows.map(function(r) {
      var ts = r[1];
      var tsStr = (ts instanceof Date)
        ? Utilities.formatDate(ts, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm')
        : String(ts);
      var dateKey = (ts instanceof Date)
        ? Utilities.formatDate(ts, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')
        : String(ts).slice(0, 10);
      var details = [];
      try { details = JSON.parse(r[5] || '[]'); } catch (e) {}
      var canRevert = (r[3] === 'Cập nhật') && details.some(function(d) {
        return d.field === 'products' || (d.field && String(d.field).charAt(0) !== '_');
      });
      return {
        logId: r[0], timestamp: tsStr, dateKey: dateKey, maGD: r[2],
        loai: r[3], summary: r[4], canRevert: canRevert
      };
    });

    return { success: true, data: result.reverse() };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// LỊCH SỬ CHUYỂN TRẠNG THÁI ĐƠN của 1 đơn (cũ -> mới nhất)
// =============================================

function getStatusHistory(maGD) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var logSheet = ss.getSheetByName(TAB_DATALOG);
    if (!logSheet || logSheet.getLastRow() < 2) return { success: true, data: [] };

    var rows = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 6).getValues();
    var result = [];
    rows.forEach(function(r) {
      if (String(r[2]) !== String(maGD)) return;
      var details = [];
      try { details = JSON.parse(r[5] || '[]'); } catch (e) {}
      details.forEach(function(d) {
        if (d.field !== 'trangThaiDon') return;
        var ts = r[1];
        var logDate = (ts instanceof Date)
          ? Utilities.formatDate(ts, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')
          : String(ts).slice(0, 10).split('-').reverse().join('/');
        var dispDate = d.date ? String(d.date).split('-').reverse().join('/') : logDate;
        result.push({ date: dispDate, old: d.old || '', "new": d["new"] || '', loai: r[3] });
      });
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// GỘP DỮ LIỆU SIDEBAR SỬA ĐƠN (1 lần gọi)
// =============================================

function getOrderSidebarData(maGD) {

  try {
    var pay = getPaymentsByMaGD(maGD);
    var st = getStatusHistory(maGD);
    return {
      success: true,
      payments: pay.success ? pay.data : [],
      statusHistory: st.success ? st.data : []
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// HOÀN TÁC 1 THAY ĐỔI
// =============================================

function revertChange(logId) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var logSheet = ss.getSheetByName(TAB_DATALOG);
    if (!logSheet || logSheet.getLastRow() < 2) return { success: false, message: 'Không tìm thấy log' };

    var data = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 6).getValues();
    var entry = null;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(logId)) { entry = data[i]; break; }
    }
    if (!entry) return { success: false, message: 'Không tìm thấy log ' + logId };

    var maGD = entry[2];
    var details = [];
    try { details = JSON.parse(entry[5] || '[]'); } catch (e) {}
    if (!details.length) return { success: false, message: 'Log này không có chi tiết để hoàn tác' };

    // Trạng thái hiện tại của đơn
    var cur = getTransactionByMaGD(maGD);
    if (!cur.success) return { success: false, message: 'Không tìm thấy đơn ' + maGD + ' để hoàn tác' };

    var info = {
      ngay: cur.data.ngay, tenShop: cur.data.tenShop, linkLH: cur.data.linkLH,
      loaiGD: cur.data.loaiGD, nguon: cur.data.nguon, maVanDon: cur.data.maVanDon,
      trangThaiDon: cur.data.trangThaiDon, trangThaiTT: cur.data.trangThaiTT,
      rating: cur.data.rating, ghiChuGD: cur.data.ghiChuGD, maGDGoc: cur.data.maGDGoc,
      ngayTrangThai: cur.data.ngayTrangThai || ''
    };
    var products = cur.data.products.map(function(p) {
      return { tenSP: p.tenSP, sl: p.sl, donGia: p.donGia, chieu: p.chieu || '' };
    });

    var INFO_FIELDS = ['ngay','tenShop','linkLH','loaiGD','nguon','maVanDon',
                       'trangThaiDon','trangThaiTT','rating','ghiChuGD','maGDGoc'];
    var reverted = [];
    details.forEach(function(d) {
      if (d.field === 'products') {
        if (d.oldProducts && d.oldProducts.length >= 0) {
          products = d.oldProducts;
          reverted.push('Sản phẩm');
        }
      } else if (INFO_FIELDS.indexOf(d.field) >= 0) {
        info[d.field] = d.old;
        reverted.push(d.label || d.field);
      }
    });

    if (!reverted.length) return { success: false, message: 'Không có field nào có thể hoàn tác trong log này' };
    if (!products.length) products = [{ tenSP: '', sl: 1, donGia: 0, chieu: '' }];

    // Nếu hoàn tác cả trạng thái đơn -> ghi ngày cập nhật TT = hôm nay
    if (reverted.indexOf('Trạng thái đơn') >= 0) {
      info.ngayTrangThai = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    }

    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    _rewriteGiaoDich(ss, gdSheet, maGD, info, products);

    appendLog(ss, maGD, 'Hoàn tác', 'Hoàn tác: ' + reverted.join(', '), []);

    invalidateDashCache();
    return { success: true, message: 'Đã hoàn tác (' + reverted.join(', ') + ') cho ' + maGD };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// LỊCH SỬ THANH TOÁN CỦA 1 ĐƠN
// =============================================

function getPaymentsByMaGD(maGD) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    if (!ttSheet || ttSheet.getLastRow() < 2) return { success: true, data: [] };

    var rows = ttSheet.getRange(2, 1, ttSheet.getLastRow() - 1, 7).getValues();
    var result = [];
    rows.forEach(function(r, idx) {
      if (String(r[0]) !== String(maGD)) return;
      result.push({
        rowIndex: idx + 2, // dòng thật trên sheet (1-based)
        maGD: r[0],
        ngay: r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : '',
        tenShop: r[2],
        soTien: parseFloat(r[3]) || 0,
        loaiTT: r[4],
        nguon: r[5],
        ghiChu: r[6] || ''
      });
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// SỬA 1 LẦN THANH TOÁN
// =============================================

function updatePayment(rowIndex, maGD, fields) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    if (!ttSheet) return { success: false, message: 'Không tìm thấy tab DataThanhToan' };

    rowIndex = parseInt(rowIndex);
    if (!(rowIndex >= 2 && rowIndex <= ttSheet.getLastRow())) {
      return { success: false, message: 'Dòng không hợp lệ' };
    }
    var cur = ttSheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
    if (String(cur[0]) !== String(maGD)) {
      return { success: false, message: 'Dữ liệu đã thay đổi, hãy tải lại rồi thử lại' };
    }

    fields = fields || {};
    var oldTien = parseFloat(cur[3]) || 0;
    var soTien = (fields.soTien !== undefined && fields.soTien !== '') ? (parseFloat(fields.soTien) || 0) : oldTien;
    var ngay = fields.ngay || cur[1];
    var loaiTT = (fields.loaiTT !== undefined && fields.loaiTT !== '') ? fields.loaiTT : cur[4];

    // Ghi lại cột B..E: Ngày, Tên Shop (giữ nguyên), Số tiền, Loại thanh toán
    ttSheet.getRange(rowIndex, 2, 1, 4).setValues([[ngay, cur[2], soTien, loaiTT]]);

    appendLog(ss, maGD, 'Cập nhật',
      'Sửa thanh toán: ' + _fmtVnd(oldTien) + ' → ' + _fmtVnd(soTien), []);

    invalidateDashCache();
    return { success: true, message: 'Đã cập nhật thanh toán' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// XÓA 1 LẦN THANH TOÁN
// =============================================

function deletePayment(rowIndex, maGD) {

  try {
    var ss = SpreadsheetApp.openById(_sheetId());
    var ttSheet = ss.getSheetByName(TAB_THANHTOAN);
    if (!ttSheet) return { success: false, message: 'Không tìm thấy tab DataThanhToan' };

    rowIndex = parseInt(rowIndex);
    if (!(rowIndex >= 2 && rowIndex <= ttSheet.getLastRow())) {
      return { success: false, message: 'Dòng không hợp lệ' };
    }
    var cur = ttSheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
    if (String(cur[0]) !== String(maGD)) {
      return { success: false, message: 'Dữ liệu đã thay đổi, hãy tải lại rồi thử lại' };
    }

    var amt = parseFloat(cur[3]) || 0;
    ttSheet.deleteRow(rowIndex);

    appendLog(ss, maGD, 'Cập nhật', 'Xóa 1 lần thanh toán: ' + _fmtVnd(amt), []);

    invalidateDashCache();
    return { success: true, message: 'Đã xóa lần thanh toán' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// DỌN DẸP THỦ CÔNG (gọi từ nút "Kiểm tra dữ liệu")
// Gộp 2 lệnh repair vào 1 round-trip.
// =============================================

function runDataRepair() {
  try {
    var r1 = repairMissingPayments();
    var r2 = repairContactLinks();
    var changed = (r1 && r1.success && /Đã bổ sung/.test(r1.message)) ||
                  (r2 && r2.success && /Đã bổ sung/.test(r2.message));
    var msgs = [];
    if (r1 && r1.message) msgs.push(r1.message);
    if (r2 && r2.message) msgs.push(r2.message);
    return { success: true, changed: changed, message: msgs.join(' · ') };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}