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
| `npm run deploy` | Tạo deployment mới |

> **Lưu ý:** `clasp pull` sẽ ghi đè file trong `src/` bằng bản trên server, kể cả `appsscript.json`. Commit trước khi pull để không mất thay đổi local.

## Cấu trúc

```
.clasp.json        # scriptId + rootDir (cấu hình clasp)
.claspignore       # file không đẩy lên Apps Script
src/
  appsscript.json  # manifest của Apps Script project
  Code.js          # logic chính + web app
  Rebrickable.js   # tra cứu Rebrickable
  Shipping.js      # tra trạng thái vận chuyển tự động
  Index.html       # giao diện web app
```

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
| `debugTrackingVtp('149554355818')` | Xem response thật của hãng để chỉnh lại mapping |

Lần chạy đầu sẽ hỏi quyền `UrlFetchApp` (gọi ra ngoài) và quyền tạo trigger — bấm cho phép.

### Nhận dạng hãng

| Dạng mã | Hãng |
|---|---|
| 12 chữ số bắt đầu bằng `1` (vd `149554355818`) | Viettel Post |
| `VTP…`, `VV…`, `VN<số>…` | Viettel Post |
| `SPX…`, hoặc ≥20 chữ số, hoặc nguồn là Shopee | Shopee Express |
| `GHN…`, `GHTK…`, `J&T…` | hiện chỉ hiện tên, **chưa tra tự động** |

Hãng chưa hỗ trợ thì đơn được bỏ qua, không ghi gì vào sheet.

### Mapping trạng thái

Đọc theo **tên trạng thái** (chữ) chứ không theo mã số, vì mã số của hãng hay đổi.
Quy về 4 trạng thái của app: `Chờ hàng`, `Đang vận chuyển`, `Đã nhận hàng`, `Hoàn trả`.

Vài chỗ dễ nhầm đã xử lý riêng:

- *"Lấy hàng thành công"* → **Đang vận chuyển** (không phải đã giao)
- *"Giao hàng không thành công"* → **Đang vận chuyển** (không phải hoàn)
- *"Đã hoàn thành"* → **Đã nhận hàng** (không phải hoàn trả)

Trạng thái lạ chưa map được thì **không ghi gì**, chỉ log lại để bổ sung sau —
xem bằng `shippingSyncStatus()` hoặc `npm run logs`.

Mỗi lần đổi trạng thái đều ghi 1 dòng vào `DataLog` kèm nguyên văn trạng thái hãng trả về.
