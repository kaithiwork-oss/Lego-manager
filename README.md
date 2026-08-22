# Lego Manager

Google Apps Script project, quản lý source bằng [`clasp`](https://github.com/google/clasp) v3.

## Kết nối với Apps Script có sẵn

### 1. Bật Apps Script API

Vào https://script.google.com/home/usersettings và bật **Google Apps Script API**.

### 2. Lấy Script ID

Mở project trong Apps Script editor → **Project Settings** (biểu tượng bánh răng) → copy **Script ID**.

Hoặc lấy từ URL: `https://script.google.com/.../projects/<SCRIPT_ID>/edit`

### 3. Điền Script ID

Sửa `.clasp.json`, thay `PASTE_YOUR_SCRIPT_ID_HERE` bằng Script ID thật:

```json
{
  "scriptId": "1AbC...xyz",
  "rootDir": "src"
}
```

### 4. Cài đặt và đăng nhập

```bash
npm install
npx clasp login
```

`clasp login` mở trình duyệt để authorize. Token được lưu ở `~/.clasprc.json` — **không commit file này**.

### 5. Kéo code về

```bash
npm run pull
```

Code trên Apps Script sẽ được tải về thư mục `src/`. Sau đó commit như bình thường.

## Workflow hằng ngày

| Lệnh | Việc |
|---|---|
| `npm test` | Chạy test logic vận chuyển (không cần mạng, không đụng sheet) |
| `npm run pull` | Kéo code từ Apps Script về `src/` |
| `npm run push` | Đẩy code từ `src/` lên Apps Script |
| `npm run watch` | Tự động push mỗi khi lưu file |
| `npm run status` | Xem file nào sẽ được push |
| `npm run open` | Mở project trong trình duyệt |
| `npm run logs` | Xem log thực thi |
| `npm run deploy` | Push + deploy, **giữ nguyên link URL** |
| `npm run deploy:url` | In ra link web app đang dùng |
| `npm run deploy:pin` | Ghim link `/exec` hiện tại để deploy không đổi link |
| `npm run deployments` | Liệt kê các deployment |

> **Lưu ý:** `clasp pull` sẽ ghi đè file trong `src/` bằng bản trên server, kể cả `appsscript.json`. Commit trước khi pull để không mất thay đổi local.

## Deploy không đổi link URL

Mặc định `clasp create-deployment` tạo một deployment **mới** mỗi lần chạy, nên URL `/exec` cũng đổi theo — ai đang dùng link cũ sẽ thấy code cũ. `npm run deploy` giải quyết việc đó: deployment ID được ghim trong `deployment.json` và mọi lần deploy đều redeploy đúng deployment đó (`clasp create-deployment -i <id>`), nên **link không bao giờ đổi**.

```bash
npm run deploy                       # push code + deploy, giữ nguyên URL
npm run deploy -- -d "Sửa bug ảnh"   # kèm mô tả cho version mới
npm run deploy -- --no-push          # chỉ deploy lại code đã push
npm run deploy:url                   # xem link web app hiện tại
```

### Giữ đúng link đang dùng

Cách chắc nhất: dán thẳng link `/exec` đang chia sẻ cho mọi người vào lệnh pin (chạy một lần duy nhất, chưa deploy gì cả):

```bash
npm run deploy:pin -- "https://script.google.com/macros/s/AKfycb.../exec"
```

Nhận cả link Workspace (`/a/macros/<domain>/s/<ID>/exec`) lẫn ID trần. Sau đó mọi lần `npm run deploy` đều bắn code mới vào đúng link đó.

Nếu không pin sẵn thì lần đầu chạy `npm run deploy`:

- Apps Script **đã có sẵn 1 deployment** → script tự nhận và ghi vào `deployment.json`.
- Có **nhiều deployment** → script dừng lại, liệt kê ra để chọn đúng cái đang dùng: `npm run deploy -- --id <link hoặc ID>`.
- **Chưa có deployment nào** → tạo mới rồi ghim lại cho các lần sau.

> Nhớ dùng link `/exec`, đừng dùng link `/dev`. Link `/dev` trỏ tới deployment `@HEAD` — Apps Script không cho phát hành vào đó, và script sẽ báo lỗi nếu bạn ghim nhầm.

Sau đó **commit `deployment.json`** để cả máy khác cũng deploy vào đúng URL đó. Có thể ghi đè bằng biến môi trường `CLASP_DEPLOYMENT_ID` nếu cần deploy sang bản khác (ví dụ bản staging).

> Nếu deployment đã ghim bị xoá trên Apps Script, script sẽ **dừng lại** thay vì âm thầm tạo URL mới. Muốn tạo deployment mới hẳn thì dùng `npm run deploy:new`.

> Khi sửa `appsscript.json` (đổi quyền, đổi scope, đổi `webapp.access`), Apps Script vẫn giữ URL cũ nhưng người dùng có thể phải authorize lại.

## Cấu trúc

```
.clasp.json        # scriptId + rootDir (cấu hình clasp)
.claspignore       # file không đẩy lên Apps Script
src/
  appsscript.json  # manifest của Apps Script project
  Code.js          # logic chính + web app
  Rebrickable.js   # tra cứu Rebrickable
  Shipping.js      # tra trạng thái vận chuyển tự động
  Wishlist.js      # backend tab Wishlist (bộ sưu tập + mục muốn mua)
  Index.html       # giao diện web app
```

## Wishlist (tab 💖)

Danh sách bộ Lego muốn mua, tổ chức **2 tầng kiểu Google Drive**.

### Luồng sử dụng

1. **Trang chính** hiện trước các **bộ sưu tập** (folder, hiển thị trơn: vệt màu +
   icon + thanh tiến độ *x/y đã có*), bên dưới là các mục **"Chưa vào bộ sưu tập"**
   (thẻ có ảnh set).
2. Bấm một bộ sưu tập → **mở trang con** xem các bộ bên trong (nút **← Bộ sưu tập**
   để quay lại, **✏️ Đổi tên** để đổi tên bộ).
3. Nút **＋ Thêm mục** → **mở trang riêng "Thêm vào wishlist"**: chọn Set/Minifig,
   gõ từ khoá → tra Rebrickable (dùng lại `timUngVien` trong `Rebrickable.js`),
   chọn **"Thêm vào bộ sưu tập"** nào (hoặc *Chưa vào bộ sưu tập* / *➕ Bộ mới…*),
   bấm kết quả để thêm. Thêm được nhiều bộ liên tục (đếm "Đã thêm N bộ"), xong bấm
   **← Wishlist**.
4. Mỗi thẻ đánh dấu **đã có / chưa có** (bấm là đổi ngay), và có nút ✏️ (sửa ghi
   chú/giá), 📁 (chuyển bộ sưu tập), 🗑️ (xoá). Thẻ nguồn **Mặt hàng** có thêm
   🔗 để nhảy sang tab Mặt hàng (lọc theo tên mặt hàng đó).
   Trong trang một bộ sưu tập có nút **✅ Cả bộ đã có / 🕒 Cả bộ chưa có** để đánh
   dấu hàng loạt (`setCollectionOwned`).
5. Ô **lọc** trên trang chính lọc nhanh toàn wishlist theo tên/mã.

### Thêm từ tab Mặt hàng

Mỗi mặt hàng trong tab **🏷️ Mặt hàng** (bảng + thẻ) có nút **💖** — bấm mở popup nhỏ
chọn bộ sưu tập (hoặc *Chưa vào bộ* / *➕ Bộ mới*) rồi thêm thẳng mặt hàng đó vào
wishlist (lấy luôn tên + ảnh đã duyệt của mặt hàng). Không cần tra lại Rebrickable.

### Dữ liệu

Lưu ở tab Sheet **`DataWishlist`** (tự tạo lần đầu mở tab). Cột:

```
ID | SetNo | Ten | Anh | Folder | GhiChu | Gia | NgayThem | DaCo | Nguon
```

- **Folder rỗng** = mục lẻ (chưa vào bộ sưu tập); **Folder có tên** = thuộc bộ sưu
  tập cùng tên. "Bộ sưu tập" chỉ là gom nhóm theo giá trị Folder, không có bảng riêng.
- **DaCo** (TRUE/FALSE) = đã sở hữu hay chưa.
- **Nguon**: `mat_hang` = thêm từ tab Mặt hàng (mặc định **đã có**); rỗng = thêm thủ
  công (tìm Rebrickable). Thêm từ Mặt hàng luôn `DaCo=TRUE` — nhưng vẫn bấm đổi lại *chưa có* được.
- Tab cũ thiếu cột `DaCo`/`Nguon` sẽ **tự bổ sung** khi mở lại (xem `_wishlistSheet`).

### Gộp trùng (dedup)

Trong **cùng một bộ sưu tập**, nếu 2 mục có **cùng link ảnh Rebrickable** (cùng bộ) thì
chỉ hiện **1** — ưu tiên bản thêm từ **Mặt hàng**, ẩn bản thêm thủ công. Gộp ở **phía
giao diện** (`wlCollapse` trong `Index.html`) nên **không xoá** dòng nào khỏi sheet; bỏ
bản Mặt hàng đi thì bản thủ công hiện lại. Ảnh phải **trùng URL** mới gộp (mặt hàng lấy
ảnh đã duyệt, bản thủ công lấy `set_img_url` — cùng bộ thì cùng URL Rebrickable).

### Hàm backend (`Wishlist.js`)

| Hàm | Việc |
|---|---|
| `getWishlist()` | Trả toàn bộ mục (mới thêm lên đầu) |
| `addWishlistItem(item)` | Thêm mục `{setNo,ten,anh,folder,ghiChu,gia,daCo}` |
| `updateWishlistItem(id, patch)` | Sửa `folder` (rỗng = đưa ra ngoài) / `ghiChu` / `gia` / `ten` / `daCo` |
| `setWishlistOwned(id, daCo)` | Đánh dấu đã có / chưa có |
| `deleteWishlistItem(id)` | Xoá mục |
| `renameWishlistFolder(cũ, mới)` | Đổi tên cả bộ sưu tập |

> Giá là **nhập tay** (Rebrickable không trả giá). Muốn giá thị trường tự động thì
> cần cắm BrickLink Price Guide API (OAuth) — chưa làm.

## Tự động cập nhật trạng thái vận chuyển

`src/Shipping.js` tra trạng thái theo mã vận đơn rồi ghi vào cột **Trạng thái đơn hàng**
của `DataGiaoDich`. Chạy hằng ngày lúc **00:00 (giờ VN)**.

Đơn được **bỏ qua** khi: chưa có mã vận đơn, hoặc trạng thái đã là *Đã nhận hàng* / *Hoàn trả*.

### Bật lịch chạy

Sau khi `npm run push`, mở Apps Script editor và chạy tay 1 lần:

| Hàm | Việc |
|---|---|
| `installShippingSyncTrigger()` | Cài lịch chạy hằng ngày lúc 0h (chạy 1 lần là xong) |
| `shippingSyncStatus()` | Xem đã cài lịch chưa + kết quả lần chạy gần nhất |
| `autoSyncShippingStatus()` | Chạy đồng bộ ngay, không đợi tới 0h |
| `removeShippingSyncTrigger()` | Gỡ lịch |
| `debugVtpLogin()` | Kiểm tra đăng nhập VTP + thử tra 1 mã kèm token |
| `debugTracking()` | Tra thử 1 mã VTP + 1 mã SPX, in payload thô ra Execution log |

> Dropdown chọn hàm trong Apps Script editor **không truyền được tham số**, nên hàm nào
> cần tham số (`debugTrackingVtp`, `debugTrackingSpx`) phải gọi từ trong code.
> Muốn bấm Run là chạy được thì chọn `debugTracking()` — đã gói sẵn mã mẫu bên trong.

Lần chạy đầu sẽ hỏi quyền `UrlFetchApp` (gọi ra ngoài) và quyền tạo trigger — bấm cho phép.

### Nhận dạng hãng

| Dạng mã | Hãng |
|---|---|
| 12 chữ số bắt đầu bằng `1` (vd `149554355818`) | Viettel Post |
| `VTP…`, `VV…`, `VN<số>…` | Viettel Post |
| `SPX…`, hoặc ≥20 chữ số, hoặc nguồn là Shopee | Shopee Express |
| `GHN…`, `GHTK…`, `J&T…` | hiện chỉ hiện tên, **chưa tra tự động** |

Hãng chưa hỗ trợ thì đơn được bỏ qua, không ghi gì vào sheet.

### Trạng thái hỗ trợ tra tự động

| Hãng | Tra tự động | Ghi chú |
|---|---|---|
| **Shopee Express** | ✅ chạy được | Đã kiểm bằng mã thật, không cần tài khoản |
| **Viettel Post** | ⚠️ cần tài khoản | Xem mục dưới |
| GHN / GHTK / J&T | ❌ chưa làm | Bỏ qua, cập nhật tay |

#### Viettel Post: không tra tự động được

**Kết luận: đơn VTP cập nhật tay.** Đã dò hết các đường, đây là ghi chép để sau
này khỏi mất công thử lại.

| Đường đã thử | Kết quả |
|---|---|
| `partner.viettelpost.vn/v2/order/*` gọi trần (9 tổ hợp method + tên tham số) | **405**, header `Allow: OPTIONS`, server `Cloudrity` — cổng API chặn request không xác thực |
| `viettelpost.com.vn/tra-cuu-hanh-trinh-don-hang/?billcode=…` | HTTP 200 nhưng HTML chỉ **177 ký tự**, không có trạng thái — trang render bằng JS, WAF chặn client không phải trình duyệt |
| `partner.viettelpost.vn/v2/user/Login` bằng tài khoản người mua | Endpoint chạy, nhưng trả `"Username or password is not valid!"` — tài khoản app VTP khác hệ thống Partner |

Cổng Partner hiện ở `partner2.viettelpost.vn`, và tài khoản API **không đăng ký
online được**: phải liên hệ bộ phận kinh doanh VTP, ký thoả thuận hợp tác rồi
nhân viên mới tạo tài khoản. Quy trình dành cho shop tích hợp hệ thống, không
đáng cho nhu cầu tra vài đơn.

Code đăng nhập vẫn còn trong `Shipping.js` (dùng Script Properties `VTP_USERNAME`
/ `VTP_PASSWORD`), để nằm im phòng khi sau này có tài khoản Partner thật. **Chưa
set thì đơn VTP bị bỏ qua và không gọi mạng** — không tốn request hỏng, không
đụng vào sheet, không ảnh hưởng đơn SPX. Lưu ý host login trong code đang trỏ
`partner.viettelpost.vn` (cổng cũ); có tài khoản thật thì phải đổi sang endpoint
trong tài liệu của `partner2`.

### Mapping trạng thái

Đọc theo **tên trạng thái** (chữ) chứ không theo mã số, vì mã số của hãng hay đổi.
Hiểu cả tiếng Việt (VTP) lẫn tiếng Anh (SPX), quy về 4 trạng thái của app:
`Chờ hàng`, `Đang vận chuyển`, `Đã nhận hàng`, `Hoàn trả`.

Vài chỗ dễ nhầm đã xử lý riêng:

- *"Lấy hàng thành công"* / *"Picked up"* → **Đang vận chuyển** (không phải đã giao)
- *"Giao hàng không thành công"* / *"Delivery failed"* → **Đang vận chuyển** (không phải hoàn)
- *"Out for delivery"* → **Đang vận chuyển** (chưa giao xong)
- *"Đã hoàn thành"* → **Đã nhận hàng** (không phải hoàn trả)

Payload mỗi hãng một kiểu — VTP để trạng thái ngay dưới `data`, SPX chôn sâu trong
`data.sls_tracking_info.records` — nên phần đọc quét đệ quy tìm mọi node có trường
trạng thái rồi lấy node có mốc thời gian mới nhất (timestamp số so bằng số, không so chuỗi).

Trạng thái lạ chưa map được thì **không ghi gì**, chỉ log lại để bổ sung sau —
xem bằng `shippingSyncStatus()` hoặc `npm run logs`.

Mỗi lần đổi trạng thái đều ghi 1 dòng vào `DataLog` kèm nguyên văn trạng thái hãng trả về.
