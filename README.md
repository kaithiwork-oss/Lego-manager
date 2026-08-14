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
| `npm run pull` | Kéo code từ Apps Script về `src/` |
| `npm run push` | Đẩy code từ `src/` lên Apps Script |
| `npm run watch` | Tự động push mỗi khi lưu file |
| `npm run status` | Xem file nào sẽ được push |
| `npm run open` | Mở project trong trình duyệt |
| `npm run logs` | Xem log thực thi |
| `npm run deploy` | Push + deploy, **giữ nguyên link URL** |
| `npm run deploy:url` | In ra link web app đang dùng |
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

### Lần đầu chạy

- Nếu Apps Script **đã có sẵn 1 deployment**, script tự nhận nó và ghi vào `deployment.json`.
- Nếu có **nhiều deployment**, script dừng lại và liệt kê ra; chọn đúng cái đang dùng (chính là phần `<ID>` trong link `https://script.google.com/macros/s/<ID>/exec`) rồi chạy một lần:

  ```bash
  npm run deploy -- --id AKfycb...
  ```

- Nếu **chưa có deployment nào**, script tạo mới rồi ghim lại cho các lần sau.

Sau đó **commit `deployment.json`** để cả máy khác cũng deploy vào đúng URL đó. Có thể ghi đè bằng biến môi trường `CLASP_DEPLOYMENT_ID` nếu cần deploy sang bản khác (ví dụ bản staging).

> Nếu deployment đã ghim bị xoá trên Apps Script, script sẽ **dừng lại** thay vì âm thầm tạo URL mới. Muốn tạo deployment mới hẳn thì dùng `npm run deploy:new`.

> Khi sửa `appsscript.json` (đổi quyền, đổi scope, đổi `webapp.access`), Apps Script vẫn giữ URL cũ nhưng người dùng có thể phải authorize lại.

## Cấu trúc

```
.clasp.json        # scriptId + rootDir (cấu hình clasp)
.claspignore       # file không đẩy lên Apps Script
src/
  appsscript.json  # manifest của Apps Script project
  *.js             # source code (.gs trên editor = .js ở local)
```
