// =============================================
// WISHLIST — danh sách muốn mua
// Thẻ (card), gom nhóm theo Folder / Bộ sưu tập,
// thêm mục bằng cách tìm trên Rebrickable (dùng lại timUngVien).
//
// Lưu ở tab Sheet: DataWishlist
// Cột: ID | SetNo | Ten | Anh | Folder | GhiChu | Gia | NgayThem | DaCo
//
// Mô hình 2 tầng:
//   - Folder RỖNG  => mục "Chưa vào bộ sưu tập" (mục lẻ)
//   - Folder có tên => thuộc một "bộ sưu tập" cùng tên
//   - DaCo (TRUE/FALSE) => đã sở hữu bộ đó hay chưa
// =============================================

var TAB_WISHLIST = 'DataWishlist';
var HEADERS_WISHLIST = ['ID', 'SetNo', 'Ten', 'Anh', 'Folder', 'GhiChu', 'Gia', 'NgayThem', 'DaCo'];

var WL_COL = { ID: 0, SETNO: 1, TEN: 2, ANH: 3, FOLDER: 4, GHICHU: 5, GIA: 6, NGAYTHEM: 7, DACO: 8 };
var WL_FOLDER_MAC_DINH = ''; // rỗng = mục lẻ (chưa vào bộ sưu tập)

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
  // Nâng cấp schema: bổ sung cột DaCo nếu tab cũ chưa có
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
    daCo:     row[WL_COL.DACO] === true || row[WL_COL.DACO] === 'TRUE' || row[WL_COL.DACO] === 'x'
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

/* Thêm mục mới. item = { setNo, ten, anh, folder, ghiChu, gia } */
function addWishlistItem(item) {
  try {
    item = item || {};
    var ten = String(item.ten || '').trim();
    if (!ten) return { success: false, message: 'Thiếu tên sản phẩm' };

    var sh = _wishlistSheet();
    var id = _wlId();
    var folder = String(item.folder || '').trim();
    var daCo = item.daCo === true;

    sh.appendRow([
      id,
      String(item.setNo || '').trim(),
      ten,
      String(item.anh || '').trim(),
      folder,
      String(item.ghiChu || '').trim(),
      Number(item.gia) || 0,
      new Date(),
      daCo
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
        daCo: daCo
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

/* Cập nhật mục. patch có thể chứa: folder, ghiChu, gia, ten */
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
