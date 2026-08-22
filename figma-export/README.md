# Xuất design để import vào Figma

Bản xuất giao diện hiện tại của **Lego Transaction Manager** (web app Google Apps Script)
để đưa vào Figma. App vốn lấy dữ liệu động qua `google.script.run`, nên bản này đã được
dựng lại thành **HTML chạy offline** với dữ liệu mẫu, để render và chụp đầy đủ 5 màn hình.

## Nội dung

| File | Mô tả |
|------|-------|
| `lego-manager-design.html` | Bản HTML **standalone** (đã nhúng backend giả + dữ liệu mẫu), mở bằng trình duyệt là chạy — dùng cho plugin *html.to.design* để có layer chỉnh sửa được trong Figma |
| `screenshots/desktop-*.png` | Ảnh full-page từng màn hình bản **desktop** (1440px, @2x) |
| `screenshots/mobile-*.png` | Ảnh full-page từng màn hình bản **mobile** (390px, @3x) |

5 màn: `dashboard` (Giao dịch), `shipping` (Vận chuyển), `giamh` (Mặt hàng),
`nguoigd` (Người GD), `changelog` (Lịch sử thay đổi).

## Cách import vào Figma

### Cách 1 — html.to.design (giữ được layer, khuyến nghị)
1. Trong Figma: **Plugins → Browse plugins → “html.to.design”** rồi cài.
2. Chạy plugin → tab **Import** → chọn **From code / Paste HTML** (hoặc **From file**).
3. Dán toàn bộ nội dung `lego-manager-design.html` (hoặc chọn file đó).
4. Đặt độ rộng khung: **1440** cho desktop, **390** cho mobile, rồi Import.
   Plugin dựng lại thành frame có layer text/khung/màu chỉnh sửa được.

> Mẹo: chạy plugin 2 lần với 2 độ rộng để có cả artboard desktop và mobile.

### Cách 2 — Kéo ảnh PNG vào Figma (nhanh nhất)
- Kéo thẳng các file trong `screenshots/` vào canvas Figma. Mỗi ảnh thành 1 frame ảnh
  (không tách layer) — hợp để tham chiếu, ghi chú, redline.

### Cách 3 — Import từ URL (nếu đã deploy)
- Nếu app đã deploy công khai, dùng *html.to.design* với chế độ **From URL** dán link
  web app để lấy bản render thật (kèm cả dữ liệu thật). Cần app không chặn iframe/login.

## Lưu ý
- 2 biểu đồ ở Dashboard (“Dòng tiền theo tháng”, “Theo hình thức GD”) trống trong bản
  offline vì thư viện Chart.js tải từ CDN (bị chặn khi chạy offline). Khung chart vẫn còn,
  chỉ thiếu nét vẽ — không ảnh hưởng layout.
- Dữ liệu trong bản này là **mẫu**, không phải dữ liệu thật của bạn.
- Hệ màu / token thiết kế nằm trong `:root` ở đầu `src/Index.html` (vàng LEGO `#FFD500`,
  navy `#0C1F3F`, đỏ `#D8291C`…) — tiện khi dựng lại design system trong Figma.

## Dựng lại bản xuất
Script tạo bản này nằm trong scratchpad phiên làm việc (`mock.js` + `render.js`,
dùng `playwright-core` + Chromium). Chạy lại sẽ tạo mới HTML standalone và toàn bộ ảnh.
