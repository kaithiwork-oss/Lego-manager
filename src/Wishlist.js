// =============================================
// WISHLIST — danh sách muốn mua
// Thẻ (card), gom nhóm theo Folder / Bộ sưu tập,
// thêm mục bằng cách tìm trên Rebrickable (dùng lại timUngVien).
//
// Lưu ở tab Sheet: DataWishlist
// Cột: ID | SetNo | Ten | Anh | Folder | GhiChu | Gia | NgayThem | DaCo | Nguon
//
// Mô hình 2 tầng:
//   - Folder RỖNG  => mục "Chưa vào bộ sưu tập" (mục lẻ)
//   - Folder có tên => thuộc một "bộ sưu tập" cùng tên
//   - DaCo (TRUE/FALSE) => đã sở hữu bộ đó hay chưa
//   - MaGD: mã giao dịch của mặt hàng gắn với mục này — có khi thêm từ tab Mặt hàng,
//     hoặc do tự dò ra đúng 1 mặt hàng dùng chung link ảnh lúc thêm mục mới.
//   - Nguon: 'mat_hang' = thêm từ tab Mặt hàng (đã sở hữu); '' = thêm thủ công
//     (tìm Rebrickable). Khi 2 mục cùng Folder + cùng link ảnh Rebrickable thì bản
//     'mat_hang' được ưu tiên, bản thủ công bị ẩn (xem gộp trùng ở phía giao diện).
// =============================================

var TAB_WISHLIST = 'DataWishlist';
var HEADERS_WISHLIST = ['ID', 'SetNo', 'Ten', 'Anh', 'Folder', 'GhiChu', 'Gia', 'NgayThem', 'DaCo', 'Nguon', 'MaGD'];

var WL_COL = { ID: 0, SETNO: 1, TEN: 2, ANH: 3, FOLDER: 4, GHICHU: 5, GIA: 6, NGAYTHEM: 7, DACO: 8, NGUON: 9, MAGD: 10 };
var WL_FOLDER_MAC_DINH = ''; // rỗng = mục lẻ (chưa vào bộ sưu tập)
var WL_NGUON_MAT_HANG = 'mat_hang';

/* Lấy (tạo nếu chưa có) tab DataWishlist, đảm bảo đủ cột */
function _wishlistSheet() {
  var ss = _openSS();
  var sh = ss.getSheetByName(TAB_WISHLIST);
  if (!sh) {
    sh = ss.insertSheet(TAB_WISHLIST);
    sh.appendRow(HEADERS_WISHLIST);
    if (typeof formatHeaderRow === 'function') formatHeaderRow(sh);
    return sh;
  }
  // Nâng cấp schema: bổ sung cột thiếu (DaCo, Nguon) cho tab cũ
  if (sh.getLastColumn() < HEADERS_WISHLIST.length) {
    sh.getRange(1, 1, 1, HEADERS_WISHLIST.length).setValues([HEADERS_WISHLIST]);
    if (typeof formatHeaderRow === 'function') formatHeaderRow(sh);
  }
  return sh;
}

function _wlId() {
  return 'WL' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

function _wlRowToItem(row) {
  return {
    id:       row[WL_COL.ID],
    setNo:    row[WL_COL.SETNO],
    ten:      row[WL_COL.TEN],
    anh:      row[WL_COL.ANH],
    folder:   String(row[WL_COL.FOLDER] || ''),
    ghiChu:   row[WL_COL.GHICHU] || '',
    gia:      Number(row[WL_COL.GIA]) || 0,
    ngayThem: row[WL_COL.NGAYTHEM]
      ? Utilities.formatDate(new Date(row[WL_COL.NGAYTHEM]), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')
      : '',
    daCo:     row[WL_COL.DACO] === true || row[WL_COL.DACO] === 'TRUE' || row[WL_COL.DACO] === 'x',
    nguon:    String(row[WL_COL.NGUON] || ''),
    maGD:     String(row[WL_COL.MAGD] || '')
  };
}

/* Đọc toàn bộ wishlist -> mảng item (mới thêm lên đầu) */
function getWishlist() {
  try {
    var sh = _wishlistSheet();
    if (sh.getLastRow() < 2) return { success: true, data: [] };

    var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS_WISHLIST.length).getValues();
    var data = [];
    values.forEach(function (row) {
      if (row[WL_COL.ID]) data.push(_wlRowToItem(row));
    });
    data.reverse(); // mục thêm sau hiện trước
    return { success: true, data: data };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/* Thêm mục mới. item = { setNo, ten, anh, folder, ghiChu, gia, daCo, nguon } */
function addWishlistItem(item) {
  try {
    item = item || {};
    var ten = String(item.ten || '').trim();
    if (!ten) return { success: false, message: 'Thiếu tên sản phẩm' };

    var sh = _wishlistSheet();
    var id = _wlId();
    var folder = String(item.folder || '').trim();
    var daCo = item.daCo === true;
    var nguon = String(item.nguon || '').trim();
    var maGD = String(item.maGD || '').trim();

    sh.appendRow([
      id,
      String(item.setNo || '').trim(),
      ten,
      String(item.anh || '').trim(),
      folder,
      String(item.ghiChu || '').trim(),
      Number(item.gia) || 0,
      new Date(),
      daCo,
      nguon,
      maGD
    ]);

    return {
      success: true,
      message: 'Đã thêm vào wishlist',
      item: {
        id: id,
        setNo: String(item.setNo || '').trim(),
        ten: ten,
        anh: String(item.anh || '').trim(),
        folder: folder,
        ghiChu: String(item.ghiChu || '').trim(),
        gia: Number(item.gia) || 0,
        ngayThem: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy'),
        daCo: daCo,
        nguon: nguon,
        maGD: maGD
      }
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/* Tìm dòng (1-based) theo ID, trả 0 nếu không thấy */
function _wlTimDong(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  var ids = sh.getRange(2, WL_COL.ID + 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return 0;
}

/* Cập nhật mục. patch có thể chứa: folder, ghiChu, gia, ten, daCo, maGD */
function updateWishlistItem(id, patch) {
  try {
    if (!id) return { success: false, message: 'Thiếu ID' };
    patch = patch || {};
    var sh = _wishlistSheet();
    var row = _wlTimDong(sh, id);
    if (!row) return { success: false, message: 'Không tìm thấy mục' };

    if (patch.hasOwnProperty('folder')) {
      // Cho phép rỗng = đưa mục ra "Chưa vào bộ sưu tập"
      sh.getRange(row, WL_COL.FOLDER + 1).setValue(String(patch.folder || '').trim());
    }
    if (patch.hasOwnProperty('ghiChu')) {
      sh.getRange(row, WL_COL.GHICHU + 1).setValue(String(patch.ghiChu || '').trim());
    }
    if (patch.hasOwnProperty('gia')) {
      sh.getRange(row, WL_COL.GIA + 1).setValue(Number(patch.gia) || 0);
    }
    if (patch.hasOwnProperty('ten')) {
      var t = String(patch.ten || '').trim();
      if (t) sh.getRange(row, WL_COL.TEN + 1).setValue(t);
    }
    if (patch.hasOwnProperty('daCo')) {
      sh.getRange(row, WL_COL.DACO + 1).setValue(patch.daCo === true);
    }
    // maGD: lưu liên kết tới mặt hàng (giao dịch) trùng ảnh, dò tự động khi thêm mục
    if (patch.hasOwnProperty('maGD')) {
      sh.getRange(row, WL_COL.MAGD + 1).setValue(String(patch.maGD || '').trim());
    }

    var updated = sh.getRange(row, 1, 1, HEADERS_WISHLIST.length).getValues()[0];
    return { success: true, message: 'Đã cập nhật', item: _wlRowToItem(updated) };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/* Đánh dấu đã có / chưa có */
function setWishlistOwned(id, daCo) {
  try {
    if (!id) return { success: false, message: 'Thiếu ID' };
    var sh = _wishlistSheet();
    var row = _wlTimDong(sh, id);
    if (!row) return { success: false, message: 'Không tìm thấy mục' };
    sh.getRange(row, WL_COL.DACO + 1).setValue(daCo === true);
    return { success: true, message: daCo ? 'Đã đánh dấu đã có' : 'Đã bỏ đánh dấu', daCo: daCo === true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/* Xoá mục theo ID */
function deleteWishlistItem(id) {
  try {
    if (!id) return { success: false, message: 'Thiếu ID' };
    var sh = _wishlistSheet();
    var row = _wlTimDong(sh, id);
    if (!row) return { success: false, message: 'Không tìm thấy mục' };
    sh.deleteRow(row);
    return { success: true, message: 'Đã xoá khỏi wishlist' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/* =============================================
   DÒ LIÊN KẾT MẶT HÀNG THEO ẢNH (chạy cho toàn bộ wishlist)
   Dùng để cập nhật các mục đã có sẵn từ trước — mục nào trùng ảnh với đúng 1
   mặt hàng thì gắn MaGD, nút 🔗 ở giao diện mở thẳng giao dịch đó.
   Chạy lại bao nhiêu lần cũng được (chỉ ghi khi MaGD thực sự đổi).
   ============================================= */

/* Khoá so khớp 2 link ảnh — phải khớp anhKey() bên Index.html */
function _wlAnhKey(u) {
  u = String(u || '').trim();
  if (!u) return '';
  return u.replace(/^https?:\/\//i, '//').replace(/\/+$/, '').toLowerCase();
}

/* Chỉ mục: khoá ảnh -> [{maGD, tenSP}] của các mặt hàng ở tab Giá mặt hàng
   (dòng có tên sản phẩm + đơn giá, bỏ giao dịch HOÀN — giống hệt trang đó) */
function _wlChiMucAnhMatHang() {
  var idx = {};
  var anh = (typeof getAnhMap === 'function') ? getAnhMap() : null;
  var mapAnh = (anh && anh.success) ? (anh.data || {}) : {};   // chỉ ảnh ĐÃ DUYỆT

  var sh = _openSS().getSheetByName(TAB_GIAODICH);
  if (!sh || sh.getLastRow() < 2) return idx;

  var soCot = Math.max(8, sh.getLastColumn());
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, soCot).getValues();
  rows.forEach(function (r) {
    var ten = String(r[5] || '').trim();
    if (!ten) return;
    if (!(Number(r[7]) || 0)) return;                 // không có đơn giá
    if (String(r[4] || '').trim() === 'HOÀN') return; // giao dịch hoàn

    var k = _wlAnhKey(mapAnh[_boDau(ten).trim()]);
    if (!k) return;
    (idx[k] = idx[k] || []).push({ maGD: String(r[0] || ''), tenSP: ten });
  });
  return idx;
}

/* Quét cả wishlist, gắn MaGD cho mục trùng ảnh với ĐÚNG 1 mặt hàng */
function dongBoLienKetWishlist() {
  try {
    var sh = _wishlistSheet();
    var n = sh.getLastRow() - 1;
    if (n < 1) return { success: true, tong: 0, ganMoi: 0, giuNguyen: 0, nhieuTrung: 0, khongTrung: 0, message: 'Wishlist trống' };

    var vals = sh.getRange(2, 1, n, HEADERS_WISHLIST.length).getValues();
    var idx = _wlChiMucAnhMatHang();

    var cot = sh.getRange(2, WL_COL.MAGD + 1, n, 1);
    var maGDs = cot.getValues();
    var ganMoi = 0, giuNguyen = 0, nhieuTrung = 0, khongTrung = 0, tong = 0;

    for (var i = 0; i < vals.length; i++) {
      if (!vals[i][WL_COL.ID]) continue;
      tong++;
      var k = _wlAnhKey(vals[i][WL_COL.ANH]);
      var ds = (k && idx[k]) || [];
      if (ds.length === 1) {
        if (String(maGDs[i][0] || '').trim() === ds[0].maGD) giuNguyen++;
        else { maGDs[i][0] = ds[0].maGD; ganMoi++; }
      } else if (ds.length > 1) {
        nhieuTrung++;   // nhiều mặt hàng trùng ảnh -> để giao diện mở màn lọc theo ảnh
      } else {
        khongTrung++;
      }
    }

    if (ganMoi) cot.setValues(maGDs);

    return {
      success: true,
      tong: tong, ganMoi: ganMoi, giuNguyen: giuNguyen,
      nhieuTrung: nhieuTrung, khongTrung: khongTrung,
      message: 'Dò ' + tong + ' mục: gắn mới ' + ganMoi + ' · sẵn đúng ' + giuNguyen +
               ' · trùng nhiều ' + nhieuTrung + ' · không trùng ' + khongTrung
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/* Soi vì sao 2 ảnh "nhìn giống nhau" mà không khớp: trả về mục wishlist và mặt
   hàng khớp từ khoá, kèm URL ảnh + trạng thái duyệt để so bằng mắt. */
function chanDoanTrungAnh(tuKhoa) {
  try {
    var kw = _boDau(String(tuKhoa || '')).trim();
    if (!kw) return { success: false, message: 'Nhập từ khoá (tên mục hoặc tên mặt hàng)' };

    var anh = (typeof getAnhMap === 'function') ? getAnhMap() : null;
    var mapDuyet = (anh && anh.success) ? (anh.data || {}) : {};
    var mapTatCa = (anh && anh.success) ? (anh.dataTatCa || {}) : {};

    var wl = [];
    var sh = _wishlistSheet();
    if (sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS_WISHLIST.length).getValues().forEach(function (r) {
        if (!r[WL_COL.ID]) return;
        var ten = String(r[WL_COL.TEN] || ''), ma = String(r[WL_COL.SETNO] || '');
        if (_boDau(ten).indexOf(kw) < 0 && _boDau(ma).indexOf(kw) < 0) return;
        wl.push({
          ten: ten, setNo: ma,
          anh: String(r[WL_COL.ANH] || ''), khoa: _wlAnhKey(r[WL_COL.ANH]),
          maGD: String(r[WL_COL.MAGD] || '')
        });
      });
    }

    var mh = [];
    var gsh = _openSS().getSheetByName(TAB_GIAODICH);
    if (gsh && gsh.getLastRow() > 1) {
      var soCot = Math.max(8, gsh.getLastColumn());
      gsh.getRange(2, 1, gsh.getLastRow() - 1, soCot).getValues().forEach(function (r) {
        var ten = String(r[5] || '');
        if (!ten || _boDau(ten).indexOf(kw) < 0) return;
        var k = _boDau(ten).trim();
        var urlDuyet = String(mapDuyet[k] || '');
        var url = urlDuyet || String(mapTatCa[k] || '');
        mh.push({
          maGD: String(r[0] || ''), tenSP: ten, loaiGD: String(r[4] || ''),
          donGia: Number(r[7]) || 0,
          anh: url, daDuyet: !!urlDuyet, khoa: _wlAnhKey(urlDuyet)
        });
      });
    }

    return { success: true, tuKhoa: String(tuKhoa || ''), wishlist: wl, matHang: mh };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/* Đổi tên folder: dời mọi mục từ folderCu sang folderMoi */
function renameWishlistFolder(folderCu, folderMoi) {
  try {
    folderMoi = String(folderMoi || '').trim();
    if (!folderMoi) return { success: false, message: 'Thiếu tên nhóm mới' };
    var sh = _wishlistSheet();
    if (sh.getLastRow() < 2) return { success: true, message: 'Không có mục nào', doi: 0 };

    var n = sh.getLastRow() - 1;
    var rng = sh.getRange(2, WL_COL.FOLDER + 1, n, 1);
    var vals = rng.getValues();
    var doi = 0;
    for (var i = 0; i < vals.length; i++) {
      var cur = vals[i][0] || WL_FOLDER_MAC_DINH;
      if (cur === folderCu) { vals[i][0] = folderMoi; doi++; }
    }
    if (doi) rng.setValues(vals);
    return { success: true, message: 'Đã đổi ' + doi + ' mục', doi: doi };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}
