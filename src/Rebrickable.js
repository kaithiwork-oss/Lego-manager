// =============================================
// REBRICKABLE.gs v3
// THAY TOÀN BỘ nội dung file Rebrickable.gs cũ.
// =============================================
//
// MỚI Ở v3:
//   - Chấm điểm theo TỪ NGUYÊN VẸN ("ash" không còn khớp "The Flash")
//   - Cột J "Duyệt": trống = chưa duyệt, ✓ = đạt, ✗ = không đạt
//   - timUngVien(): trả danh sách ứng viên cho sidebar chọn
//   - luuAnhSanPham(): dán URL Rebrickable -> tự tra lại tên chính thức
//   - resetDuyet(): xoá trắng cột J để duyệt lại từ đầu
//
// CHUẨN BỊ: Script Property RB_API_KEY
// =============================================

var TAB_ANH = 'AnhSanPham';
var HEADERS_ANH = [
  'Tên gốc', 'Loại', 'Từ khoá tra', 'Mã kết quả',
  'URL ảnh', 'Tên chính thức', 'Độ khớp', 'Ngày cache', 'Trạng thái', 'Duyệt'
];
var SO_COT_ANH = 10;

var RB_BASE = 'https://rebrickable.com/api/v3/lego';


// =============================================
// GỌI API
// =============================================

function _rbKey() {
  var v = PropertiesService.getScriptProperties().getProperty('RB_API_KEY');
  if (!v) throw new Error('Thiếu Script Property: RB_API_KEY');
  return v;
}

function _rbGet(path) {
  var url = RB_BASE + path;
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { 'Authorization': 'key ' + _rbKey(), 'Accept': 'application/json' },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 200) return { ok: true, data: JSON.parse(res.getContentText()) };
    if (code === 404) return { ok: false, code: 404, message: 'Không có trong CSDL' };
    if (code === 401 || code === 403) return { ok: false, code: code, message: 'API key sai' };
    if (code === 429) return { ok: false, code: 429, message: 'Bị giới hạn tốc độ' };
    return { ok: false, code: code, message: 'HTTP ' + code };
  } catch (e) {
    return { ok: false, code: 0, message: e.toString() };
  }
}


// =============================================
// CHUẨN HOÁ CHUỖI
// =============================================

/* Bỏ dấu tiếng Việt, về chữ thường */
function _boDau(s) {
  s = String(s || '').toLowerCase();
  if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s.replace(/\u0111/g, 'd');
}

/* Tách thành mảng từ, bỏ dấu câu */
function _tachTu(s) {
  return _boDau(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}


// =============================================
// PHÂN LOẠI MẶT HÀNG — dùng GMH_MODES của Index.html
// =============================================

var GMH_MODES = {
  mini: { hide: ['tủ', 'case', 'lego', 'lg', 'set', 'phụ kiện', 'gạch'], show: null },
  tu:   { hide: null, show: ['tủ', 'case'] },
  gach: { hide: null, show: ['phụ kiện', 'gạch'] },
  set:  { hide: null, show: ['set', 'lg', 'lego'] }
};

function _khopMode(tenSPLow, mode) {
  var m = GMH_MODES[mode];
  if (!m) return false;
  if (m.hide) {
    for (var i = 0; i < m.hide.length; i++) {
      if (tenSPLow.indexOf(m.hide[i]) >= 0) return false;
    }
    return true;
  }
  for (var j = 0; j < m.show.length; j++) {
    if (tenSPLow.indexOf(m.show[j]) >= 0) return true;
  }
  return false;
}

var TU_RAC = [
  'mua', 'ban', 'trao', 'doi', 'giao', 'dich', 'gd', 'ship', 'cod', 'freeship',
  'moi', 'cu', 'seal', 'fullbox', 'full', 'box',
  'du', 'day', 'thieu', 'tru', 'roi', 'le', 'dep', 'xau', 'like', 'new',
  'cai', 'con', 'chiec', 'bo', 'mon', 'chu', 'em', 'combo', 'don',
  'hang', 'do', 'loai', 'co', 'khong', 'va', 'voi', 'cua', 'gia',
  'minifig', 'minifigure', 'minifigs', 'fig', 'nhan', 'vat', 'nv',
  'lego', 'lg', 'set', 'sp', 'san', 'pham',
  'kem', 'win', 'bid', 'body', 'dau', 'chan', 'tay', 'toc'
];

function phanLoaiMatHang(tenSP) {
  var goc = String(tenSP || '').trim();
  if (!goc) return { loai: 'bo_qua', nhom: '', lyDo: 'Tên trống', tuKhoa: '', setNo: '' };

  var low = goc.toLowerCase();

  if (_khopMode(low, 'tu')) {
    return { loai: 'bo_qua', nhom: 'tu', setNo: '', tuKhoa: '', lyDo: 'Nhóm Tủ & Case' };
  }
  if (_khopMode(low, 'gach')) {
    return { loai: 'bo_qua', nhom: 'gach', setNo: '', tuKhoa: '', lyDo: 'Nhóm Gạch & PK' };
  }

  if (_khopMode(low, 'set')) {
    var setNo = extractSetNo(goc);
    if (setNo) {
      return { loai: 'set', nhom: 'set', setNo: setNo, tuKhoa: '', lyDo: 'Set có mã ' + setNo };
    }
    var kwSet = _lamSachTuKhoa(goc);
    return kwSet
      ? { loai: 'set', nhom: 'set', setNo: '', tuKhoa: kwSet, lyDo: 'Set, tìm theo tên' }
      : { loai: 'bo_qua', nhom: 'set', setNo: '', tuKhoa: '', lyDo: 'Set nhưng không còn từ khoá' };
  }

  var setNoMini = extractSetNo(goc);
  if (setNoMini) {
    return { loai: 'set', nhom: 'mini', setNo: setNoMini, tuKhoa: '', lyDo: 'Mini nhưng có mã ' + setNoMini };
  }

  var kw = _lamSachTuKhoa(goc);
  return kw
    ? { loai: 'mini', nhom: 'mini', setNo: '', tuKhoa: kw, lyDo: 'Nhóm Mini' }
    : { loai: 'bo_qua', nhom: 'mini', setNo: '', tuKhoa: '', lyDo: 'Mini nhưng không còn từ khoá' };
}

function _lamSachTuKhoa(tenSP) {
  var s = _boDau(tenSP);
  s = s.replace(/\d+[.,]?\d*\s*(k|tr|d|vnd|nghin|ngan|trieu)\b/g, ' ')
       .replace(/\bx\s*\d+\b/g, ' ')
       .replace(/\d+\s*%/g, ' ')
       .replace(/\b(19|20)\d{2}\b/g, ' ')
       .replace(/[^a-z0-9\s]/g, ' ');

  var racSet = {};
  TU_RAC.forEach(function(t) { racSet[t] = true; });

  var giu = s.split(/\s+/).filter(Boolean).filter(function(t) {
    if (racSet[t]) return false;
    if (t.length < 2) return false;
    if (/^\d+$/.test(t)) return false;
    return true;
  });

  return giu.slice(0, 6).join(' ');
}

function extractSetNo(tenSP) {
  var s = String(tenSP || '').trim();
  if (!s) return '';

  var full = s.match(/\b(\d{4,7}-\d{1,2})\b/);
  if (full) return full[1];

  var cleaned = s
    .replace(/\d+[.,]?\d*\s*(k|tr|đ|d|vnd|nghìn|ngàn|triệu)\b/gi, ' ')
    .replace(/\bx\s*\d+\b/gi, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\d+\s*%/g, ' ');

  var m = cleaned.match(/\b(\d{4,7})\b/);
  if (!m) return '';
  var num = m[1];
  if (num.charAt(0) === '0') return '';
  return num + '-1';
}


// =============================================
// CHẤM ĐIỂM — THEO TỪ NGUYÊN VẸN
// v2 dùng indexOf nên "ash" khớp "The Fl-ash-" = 100% (sai).
// v3 tách tên kết quả thành từ rồi so từng từ.
// =============================================

function _diemTokens(tokens, tenKetQua) {
  if (!tokens || !tokens.length) return 0;
  var tuKQ = {};
  _tachTu(tenKetQua).forEach(function(w) { tuKQ[w] = true; });
  var trung = tokens.filter(function(t) { return tuKQ[t] === true; }).length;
  return Math.round(trung / tokens.length * 100);
}


// =============================================
// TÌM KIẾM
// =============================================

function _rbTraSetTheoMa(setNo) {
  var r = _rbGet('/sets/' + encodeURIComponent(setNo) + '/');
  if (!r.ok) return r;
  return { ok: true, ma: r.data.set_num, url: r.data.set_img_url || '',
           ten: r.data.name || '', diem: 100 };
}

/* Rebrickable tìm theo CỤM TỪ. "nya kabuki" trượt vì tên thật là
   "Nya in Kabuki Outfit". Nên cụm trượt thì tra bằng 1 từ đặc trưng. */
function _rbTimTheoTen(loai, tuKhoa) {
  var tokens = _tachTu(tuKhoa);

  var kq = _rbTimMotLan(loai, tuKhoa, tokens, 5);
  if (kq.ok) return kq;
  if (tokens.length < 2) return kq;

  var dacTrung = tokens.slice().sort(function(a, b) { return b.length - a.length; })[0];
  Utilities.sleep(1100);
  var kq2 = _rbTimMotLan(loai, dacTrung, tokens, 100);
  if (kq2.ok) { kq2.rutGon = true; return kq2; }

  return kq.message ? kq : kq2;
}

function _rbTimMotLan(loai, tuKhoaTra, tokensChamDiem, pageSize) {
  var path = (loai === 'mini' ? '/minifigs/' : '/sets/')
           + '?search=' + encodeURIComponent(tuKhoaTra)
           + '&page_size=' + (pageSize || 5);
  var r = _rbGet(path);
  if (!r.ok) return r;

  var ds = (r.data && r.data.results) || [];
  if (!ds.length) return { ok: false, message: 'Không có kết quả cho "' + tuKhoaTra + '"' };

  var tot = null, diemTot = -1;
  ds.forEach(function(x) {
    var d = _diemTokens(tokensChamDiem, x.name || '');
    if (d > diemTot) { diemTot = d; tot = x; }
  });

  if (diemTot < 50) {
    return { ok: false, message: 'Khớp thấp (' + diemTot + '%): "' + ((tot && tot.name) || '') + '"' };
  }

  return { ok: true, ma: tot.set_num, url: tot.set_img_url || '',
           ten: tot.name || '', diem: diemTot };
}


// =============================================
// TÌM ỨNG VIÊN — cho sidebar duyệt ảnh
// =============================================

function timUngVien(loai, tuKhoa) {
  try {
    tuKhoa = String(tuKhoa || '').trim();
    if (!tuKhoa) return { success: false, message: 'Nhập từ khoá để tìm' };
    loai = (loai === 'set') ? 'set' : 'mini';

    var tokens = _tachTu(tuKhoa);
    var path = (loai === 'mini' ? '/minifigs/' : '/sets/')
             + '?search=' + encodeURIComponent(tuKhoa) + '&page_size=40';
    var r = _rbGet(path);

    // Cụm đầy đủ không ra gì -> thử từ đặc trưng nhất
    if (r.ok && (!r.data.results || !r.data.results.length) && tokens.length > 1) {
      var dacTrung = tokens.slice().sort(function(a, b) { return b.length - a.length; })[0];
      Utilities.sleep(1100);
      path = (loai === 'mini' ? '/minifigs/' : '/sets/')
           + '?search=' + encodeURIComponent(dacTrung) + '&page_size=100';
      r = _rbGet(path);
    }

    if (!r.ok) return { success: false, message: r.message };

    var ds = (r.data && r.data.results) || [];
    var ketQua = ds.map(function(x) {
      return {
        ma: x.set_num,
        ten: x.name || '',
        url: x.set_img_url || '',
        diem: _diemTokens(tokens, x.name || '')
      };
    }).filter(function(x) { return x.url; });

    ketQua.sort(function(a, b) { return b.diem - a.diem; });

    return { success: true, data: ketQua.slice(0, 24), tong: ds.length };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// TAB CACHE
// =============================================

function _getAnhSheet() {
  var ss = _openSS();
  var sh = ss.getSheetByName(TAB_ANH);
  if (!sh) {
    sh = ss.insertSheet(TAB_ANH);
    sh.appendRow(HEADERS_ANH);
    formatHeaderRow(sh);
    sh.setColumnWidth(1, 260);
    sh.setColumnWidth(5, 300);
    sh.setColumnWidth(6, 220);
    return sh;
  }
  // Nâng cấp: đảm bảo có cột J "Duyệt"
  if (sh.getMaxColumns() < SO_COT_ANH) {
    sh.insertColumnsAfter(sh.getMaxColumns(), SO_COT_ANH - sh.getMaxColumns());
  }
  if (String(sh.getRange(1, SO_COT_ANH).getValue() || '').trim() !== 'Duyệt') {
    sh.getRange(1, SO_COT_ANH).setValue('Duyệt');
    formatHeaderRow(sh);
  }
  return sh;
}

function _readAnhCache(sh) {
  var map = {};
  if (sh.getLastRow() < 2) return map;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, SO_COT_ANH).getValues();
  rows.forEach(function(r) {
    var k = _boDau(r[0]).trim();
    if (k) map[k] = { url: r[4] || '', ten: r[5] || '', trangThai: r[8] || '', duyet: r[9] || '' };
  });
  return map;
}

/* Tìm số dòng của 1 tên gốc, 0 nếu chưa có */
function _timDongAnh(sh, tenGoc) {
  if (sh.getLastRow() < 2) return 0;
  var key = _boDau(tenGoc).trim();
  var col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (_boDau(col[i][0]).trim() === key) return i + 2;
  }
  return 0;
}


// =============================================
// TÁCH MÃ TỪ URL REBRICKABLE
// .../media/sets/fig-000111/76821.jpg          -> fig-000111
// .../media/thumbs/sets/71819-1/1369.jpg/...   -> 71819-1
// =============================================

function _maTuUrl(url) {
  var m = String(url || '').match(/rebrickable\.com\/media\/(?:thumbs\/)?sets\/([^\/]+)\//i);
  return m ? m[1] : '';
}

/* Tra tên chính thức từ mã. Tự chọn endpoint theo tiền tố fig- */
function _traTenTheoMa(ma) {
  ma = String(ma || '').trim();
  if (!ma) return null;
  var path = (ma.indexOf('fig-') === 0)
    ? '/minifigs/' + encodeURIComponent(ma) + '/'
    : '/sets/' + encodeURIComponent(ma) + '/';
  var r = _rbGet(path);
  if (!r.ok) return null;
  return { ma: r.data.set_num, ten: r.data.name || '', url: r.data.set_img_url || '' };
}


// =============================================
// LƯU ẢNH (từ sidebar duyệt hoặc dán URL tay)
// - Có ma + tenChinhThuc  -> ghi thẳng (chọn từ lưới ứng viên)
// - Chỉ có url            -> nếu là URL Rebrickable thì tự tra lại tên
// - url rỗng              -> xoá ảnh
// =============================================

function luuAnhSanPham(tenGoc, url, ma, tenChinhThuc, duyet) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: 'Đang bận, thử lại' };

  try {
    tenGoc = String(tenGoc || '').trim();
    url = String(url || '').trim();
    ma = String(ma || '').trim();
    tenChinhThuc = String(tenChinhThuc || '').trim();

    if (!tenGoc) return { success: false, message: 'Thiếu tên sản phẩm' };
    if (url && !/^https?:\/\//i.test(url)) {
      return { success: false, message: 'URL phải bắt đầu bằng http:// hoặc https://' };
    }

    var trangThai, tuDong = false;

    if (!url) {
      trangThai = 'Đã xoá ảnh';
      ma = ''; tenChinhThuc = '';
    } else if (ma && tenChinhThuc) {
      trangThai = 'Chọn tay';
    } else {
      // Dán URL tay — nếu là link Rebrickable thì tự tra lại tên chính thức
      var maUrl = _maTuUrl(url);
      if (maUrl) {
        var tra = _traTenTheoMa(maUrl);
        if (tra) {
          ma = tra.ma; tenChinhThuc = tra.ten; tuDong = true;
          trangThai = 'Dán tay — đã tra tên';
        } else {
          ma = maUrl;
          trangThai = 'Dán tay — không tra được tên';
        }
      } else {
        trangThai = 'Dán tay — ảnh ngoài';
      }
    }

    var sh = _getAnhSheet();
    var dong = _timDongAnh(sh, tenGoc);
    var ngay = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    var dauDuyet = (duyet === false) ? '✗' : (url ? '✓' : '');

    if (dong) {
      sh.getRange(dong, 4).setValue(ma);
      sh.getRange(dong, 5).setValue(url);
      sh.getRange(dong, 6).setValue(tenChinhThuc);
      sh.getRange(dong, 8).setValue(ngay);
      sh.getRange(dong, 9).setValue(trangThai);
      sh.getRange(dong, 10).setValue(dauDuyet);
    } else {
      sh.appendRow([tenGoc, 'tay', '', ma, url, tenChinhThuc, '', ngay, trangThai, dauDuyet]);
    }

    invalidateDashCache();
    return {
      success: true,
      message: url ? (tuDong ? 'Đã lưu — tên: ' + tenChinhThuc : 'Đã lưu ảnh') : 'Đã xoá ảnh',
      url: url, ma: ma, tenChinhThuc: tenChinhThuc
    };

  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}


// =============================================
// ĐÁNH DẤU DUYỆT HÀNG LOẠT
// dat = true  -> ✓ (giữ nguyên ảnh)
// dat = false -> ✗ (xoá URL, để tra/dán lại)
// =============================================

function danhDauDuyet(danhSachTen, dat) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: 'Đang bận, thử lại' };

  try {
    if (!danhSachTen || !danhSachTen.length) {
      return { success: false, message: 'Chưa chọn sản phẩm nào' };
    }
    var sh = _getAnhSheet();
    if (sh.getLastRow() < 2) return { success: false, message: 'Chưa có dữ liệu ảnh' };

    var can = {};
    danhSachTen.forEach(function(t) { can[_boDau(t).trim()] = true; });

    var n = sh.getLastRow() - 1;
    var rows = sh.getRange(2, 1, n, SO_COT_ANH).getValues();
    var doi = 0;

    rows.forEach(function(r) {
      var k = _boDau(r[0]).trim();
      if (!can[k]) return;
      r[9] = dat ? '✓' : '✗';
      if (!dat) { r[4] = ''; r[8] = 'Đánh dấu không đạt'; }
      doi++;
    });

    if (doi) sh.getRange(2, 1, n, SO_COT_ANH).setValues(rows);

    invalidateDashCache();
    return {
      success: true,
      message: 'Đã đánh dấu ' + doi + ' sản phẩm ' + (dat ? 'ĐẠT' : 'KHÔNG ĐẠT'),
      soDoi: doi
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}


// =============================================
// RESET DUYỆT — xoá trắng cột J, mọi món về "chưa duyệt"
// =============================================

function resetDuyet() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: 'Đang bận, thử lại' };

  try {
    var sh = _getAnhSheet();
    if (sh.getLastRow() < 2) return { success: true, message: 'Chưa có dữ liệu', soDoi: 0 };
    var n = sh.getLastRow() - 1;
    sh.getRange(2, SO_COT_ANH, n, 1).clearContent();
    invalidateDashCache();
    var msg = 'Đã reset ' + n + ' sản phẩm về trạng thái chưa duyệt';
    Logger.log(msg);
    return { success: true, message: msg, soDoi: n };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}


// =============================================
// DANH SÁCH CHO TRANG DUYỆT ẢNH
// =============================================

function getDanhSachDuyet() {
  try {
    var ss = _openSS();
    var sh = ss.getSheetByName(TAB_ANH);
    if (!sh || sh.getLastRow() < 2) return { success: true, data: [] };

    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, SO_COT_ANH).getValues();
    var data = rows.map(function(r) {
      return {
        tenGoc: String(r[0] || ''),
        loai: String(r[1] || ''),
        tuKhoa: String(r[2] || ''),
        ma: String(r[3] || ''),
        url: String(r[4] || ''),
        tenChinhThuc: String(r[5] || ''),
        diem: String(r[6] || ''),
        trangThai: String(r[8] || ''),
        duyet: String(r[9] || '')
      };
    }).filter(function(x) { return x.tenGoc; });

    return { success: true, data: data };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/* Gợi ý phân loại + từ khoá cho 1 tên bất kỳ (sidebar dùng khi mở món mới) */
function goiYTraCuu(tenSP) {
  try {
    var pl = phanLoaiMatHang(tenSP);
    return {
      success: true,
      loai: (pl.loai === 'set') ? 'set' : 'mini',
      tuKhoa: pl.tuKhoa || pl.setNo || _lamSachTuKhoa(tenSP),
      setNo: pl.setNo || '',
      lyDo: pl.lyDo
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// BACKFILL
// =============================================

function backfillAnhThongMinh(gioiHan) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { success: false, message: 'Đang có tiến trình khác chạy' };

  try {
    var batDau = Date.now();
    var MAX_MS = 4.5 * 60 * 1000;
    gioiHan = gioiHan || 250;

    var ss = _openSS();
    var gdSheet = ss.getSheetByName(TAB_GIAODICH);
    if (!gdSheet || gdSheet.getLastRow() < 2) {
      return { success: true, message: 'Chưa có dữ liệu giao dịch', them: 0, conLai: 0 };
    }

    var anhSheet = _getAnhSheet();
    var cache = _readAnhCache(anhSheet);

    var rows = gdSheet.getRange(2, 6, gdSheet.getLastRow() - 1, 1).getValues();
    var danhSach = [], daThay = {};
    rows.forEach(function(r) {
      var ten = String(r[0] || '').trim();
      if (!ten) return;
      var key = _boDau(ten).trim();
      if (daThay[key] || cache[key]) return;
      daThay[key] = true;

      var pl = phanLoaiMatHang(ten);
      if (pl.loai === 'bo_qua') return;
      danhSach.push({ ten: ten, pl: pl });
    });

    if (!danhSach.length) {
      return { success: true, message: 'Không có mặt hàng mới cần tra', them: 0, conLai: 0 };
    }

    var hangMoi = [];
    var ok = 0, truot = 0, hetGio = false;

    for (var i = 0; i < danhSach.length && i < gioiHan; i++) {
      if (Date.now() - batDau > MAX_MS) { hetGio = true; break; }

      var item = danhSach[i];
      var pl = item.pl;
      var ngay = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var kq = pl.setNo ? _rbTraSetTheoMa(pl.setNo) : _rbTimTheoTen(pl.loai, pl.tuKhoa);

      if (kq.ok && kq.url) {
        var tt = kq.rutGon ? 'OK (rút gọn từ khoá)' : 'OK';
        if (kq.diem < 70) tt = 'CẦN KIỂM TRA — khớp thấp';
        hangMoi.push([item.ten, pl.loai, pl.tuKhoa || pl.setNo, kq.ma,
                      kq.url, kq.ten, kq.diem + '%', ngay, tt, '']);
        ok++;
      } else {
        hangMoi.push([item.ten, pl.loai, pl.tuKhoa || pl.setNo, '',
                      '', '', '', ngay, kq.message || 'Không có ảnh', '']);
        truot++;
      }

      Utilities.sleep(1100);
    }

    if (hangMoi.length) {
      anhSheet.getRange(anhSheet.getLastRow() + 1, 1, hangMoi.length, SO_COT_ANH).setValues(hangMoi);
    }

    invalidateDashCache();

    var conLai = danhSach.length - hangMoi.length;
    var msg = 'Tra ' + hangMoi.length + ' mặt hàng: ' + ok + ' có ảnh, ' + truot + ' không thấy';
    if (conLai > 0) msg += '. Còn ' + conLai + (hetGio ? ' (hết giờ, chạy lại để tiếp)' : '');

    return { success: true, message: msg, them: ok, conLai: conLai };

  } catch (e) {
    return { success: false, message: 'Lỗi: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/* Chạy từ editor: in kết quả ra Execution log */
function chayBackfill() {
  var r = backfillAnhThongMinh();
  var msg = (r.success ? '✓ ' : '✗ ') + r.message;
  if (r.conLai > 0) msg += '\n\n>>> CÒN ' + r.conLai + ' MÓN — CHẠY LẠI HÀM NÀY <<<';
  else if (r.success) msg += '\n\n>>> XONG HẾT <<<';
  Logger.log(msg);
  return msg;
}


// =============================================
// MAP ẢNH CHO FRONTEND
//   data      : CHỈ ảnh đã duyệt (cột J = ✓) — dùng để hiển thị ở mọi màn
//   dataTatCa : mọi ảnh có URL kể cả chưa duyệt — chỉ dùng cho sidebar sửa ảnh
// =============================================

function getAnhMap() {
  try {
    var ss = _openSS();
    var sh = ss.getSheetByName(TAB_ANH);
    if (!sh || sh.getLastRow() < 2) return { success: true, data: {}, dataTatCa: {} };

    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, SO_COT_ANH).getValues();
    var map = {}, tatCa = {};
    rows.forEach(function(r) {
      var k = _boDau(r[0]).trim();
      var u = String(r[4] || '').trim();
      if (!k || !u) return;
      tatCa[k] = u;
      if (String(r[9] || '').trim() === '✓') map[k] = u;
    });
    return { success: true, data: map, dataTatCa: tatCa };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


// =============================================
// DỌN DẸP / CHẨN ĐOÁN
// =============================================

/* Xoá dòng không có ảnh để tra lại (giữ dòng có ảnh và dòng sửa tay) */
function xoaCacheHong() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return 'Đang bận, thử lại';

  try {
    var sh = _getAnhSheet();
    if (sh.getLastRow() < 2) return 'Tab ' + TAB_ANH + ' rỗng';

    var n = sh.getLastRow() - 1;
    var rows = sh.getRange(2, 1, n, SO_COT_ANH).getValues();
    var giu = rows.filter(function(r) {
      var coUrl = String(r[4] || '').trim() !== '';
      var suaTay = String(r[8] || '').indexOf('tay') >= 0;
      return coUrl || suaTay;
    });

    var xoa = rows.length - giu.length;
    if (!xoa) return 'Không có dòng hỏng — tất cả ' + rows.length + ' dòng đều có ảnh';

    sh.getRange(2, 1, n, SO_COT_ANH).clearContent();
    if (giu.length) sh.getRange(2, 1, giu.length, SO_COT_ANH).setValues(giu);

    invalidateDashCache();
    var msg = 'Đã xoá ' + xoa + ' dòng không có ảnh, giữ ' + giu.length +
              '. Chạy chayBackfill() để tra lại.';
    Logger.log(msg);
    return msg;
  } catch (e) {
    return 'Lỗi: ' + e.toString();
  } finally {
    lock.releaseLock();
  }
}

function kiemTraAnh() {
  var out = [];
  var ss = _openSS();

  var sh = ss.getSheetByName(TAB_ANH);
  if (!sh) {
    out.push('✗ CHƯA CÓ tab "' + TAB_ANH + '" — backfill chưa chạy');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }
  out.push('✓ Tab "' + TAB_ANH + '": ' + (sh.getLastRow() - 1) + ' dòng');
  if (sh.getLastRow() < 2) { Logger.log(out.join('\n')); return out.join('\n'); }

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, SO_COT_ANH).getValues();
  var coUrl = 0, chuaDuyet = 0, dat = 0, khongDat = 0, trangThai = {};
  rows.forEach(function(r) {
    if (String(r[4] || '').trim()) coUrl++;
    var d = String(r[9] || '').trim();
    if (d === '✓') dat++; else if (d === '✗') khongDat++; else chuaDuyet++;
    var t = String(r[8] || '(trống)');
    trangThai[t] = (trangThai[t] || 0) + 1;
  });
  out.push('  Có URL ảnh : ' + coUrl + ' / ' + rows.length);
  out.push('  Đã duyệt ✓ : ' + dat);
  out.push('  Không đạt ✗: ' + khongDat);
  out.push('  Chưa duyệt : ' + chuaDuyet);
  out.push('');
  out.push('  Trạng thái:');
  Object.keys(trangThai).sort(function(a, b) { return trangThai[b] - trangThai[a]; })
    .slice(0, 8).forEach(function(k) { out.push('    ' + trangThai[k] + '  ' + k); });

  var m = getAnhMap();
  out.push('');
  out.push('✓ getAnhMap(): ' + (m.success ? Object.keys(m.data).length : 0) + ' khoá');

  var gd = ss.getSheetByName(TAB_GIAODICH);
  var tenGD = gd.getRange(2, 6, Math.min(gd.getLastRow() - 1, 400), 1).getValues();
  var khop = 0, daXet = {};
  tenGD.forEach(function(r) {
    var ten = String(r[0] || '').trim();
    if (!ten || daXet[ten]) return;
    daXet[ten] = true;
    if (m.data[_boDau(ten).trim()]) khop++;
  });
  out.push('✓ Khớp ' + khop + ' mặt hàng với ảnh');

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

function thongKePhanLoai() {
  var ss = _openSS();
  var gd = ss.getSheetByName(TAB_GIAODICH);
  if (!gd || gd.getLastRow() < 2) return 'Chưa có dữ liệu';

  var rows = gd.getRange(2, 6, gd.getLastRow() - 1, 1).getValues();
  var KEYS = ['set_ma', 'set_ten', 'mini', 'tu', 'gach'];
  var NHAN = {
    set_ma: 'SET có mã số', set_ten: 'SET tìm theo tên', mini: 'MINI tìm theo tên',
    tu: 'TỦ & CASE (bỏ qua)', gach: 'GẠCH & PK (bỏ qua)'
  };
  var dem = {}, mau = {};
  KEYS.forEach(function(k) { dem[k] = 0; mau[k] = []; });

  var duyNhat = {};
  rows.forEach(function(r) {
    var ten = String(r[0] || '').trim();
    if (!ten) return;
    var key = _boDau(ten).trim();
    if (duyNhat[key]) return;
    duyNhat[key] = true;

    var pl = phanLoaiMatHang(ten);
    var k;
    if (pl.nhom === 'tu' || pl.nhom === 'gach') k = pl.nhom;
    else if (pl.setNo) k = 'set_ma';
    else if (pl.loai === 'set') k = 'set_ten';
    else k = 'mini';

    dem[k]++;
    if (mau[k].length < 10) {
      mau[k].push('  "' + ten + '"' + (pl.setNo ? ' -> ' + pl.setNo
        : pl.tuKhoa ? ' -> tra: "' + pl.tuKhoa + '"' : ' -> ' + pl.lyDo));
    }
  });

  var canTra = dem.set_ma + dem.set_ten + dem.mini;
  var out = ['PHÂN LOẠI ' + Object.keys(duyNhat).length + ' MẶT HÀNG DUY NHẤT', ''];
  KEYS.forEach(function(k) { out.push('  ' + NHAN[k] + ' : ' + dem[k]); });
  out.push('');
  out.push('  => Cần gọi API : ' + canTra + ' lần, ~' + Math.ceil(canTra * 1.1 / 60) + ' phút');
  out.push('');
  KEYS.forEach(function(k) {
    if (!mau[k].length) return;
    out.push('--- ' + NHAN[k] + ' ---');
    mau[k].forEach(function(x) { out.push(x); });
    out.push('');
  });

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

function testRebrickable() {
  var out = [];
  try { _rbKey(); out.push('✓ Đã có RB_API_KEY'); }
  catch (e) { out.push('✗ ' + e.message); Logger.log(out.join('\n')); return out.join('\n'); }

  var r = _rbGet('/sets/71721-1/');
  out.push(r.ok ? ('✓ Kết nối OK — ' + r.data.name) : ('✗ ' + r.message));
  out.push('');
  out.push(thongKePhanLoai());

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}