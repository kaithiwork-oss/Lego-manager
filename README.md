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
| `npm run deploy` | Tạo deployment mới |

> **Lưu ý:** `clasp pull` sẽ ghi đè file trong `src/` bằng bản trên server, kể cả `appsscript.json`. Commit trước khi pull để không mất thay đổi local.

## Cấu trúc

```
.clasp.json        # scriptId + rootDir (cấu hình clasp)
.claspignore       # file không đẩy lên Apps Script
src/
  appsscript.json  # manifest của Apps Script project
  *.js             # source code (.gs trên editor = .js ở local)
```
