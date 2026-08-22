# Xuất design để import vào Figma

Bản xuất giao diện hiện tại của **Lego Transaction Manager** (web app Google Apps Script)
để đưa vào Figma. App vốn lấy dữ liệu động qua `google.script.run`, nên bản này đã được
dựng lại thành **HTML chạy offline** với dữ liệu mẫu, để render và chụp đầy đủ 5 màn hình.

## Nội dung

| File | Mô tả |
|------|-------|
| `svg/desktop-*.svg` | **⭐ Bản chính** — 5 màn desktop (1440px) dạng **SVG vector**, import thẳng vào Figma thành layer text/khung/màu chỉnh sửa được |
| `svg/mobile-*.svg` | 5 màn mobile (390px) dạng SVG vector |
| `lego-manager-design.html` | Bản HTML standalone (nhúng dữ liệu mẫu) — dự phòng, dùng cho plugin *html.to.design* |
| `screenshots/*.png` | Ảnh PNG tĩnh từng màn — chỉ để xem nhanh / redline |

5 màn: `dashboard` (Giao dịch), `shipping` (Vận chuyển), `giamh` (Mặt hàng),
`nguoigd` (Người GD), `changelog` (Lịch sử thay đổi) → tổng **10 file SVG**.

## Cách import vào Figma (khuyến nghị: SVG)

SVG là định dạng Figma **import native, không cần plugin**, và giữ được layer.

1. Mở Figma → **kéo thả** thẳng các file trong `svg/` vào canvas
   (hoặc menu **File → Place image / Import**, chọn nhiều file cùng lúc).
2. Mỗi file SVG thành **một frame** đúng kích thước (1440 hoặc 390), bên trong là
   các layer vector: text vẫn là **text sửa được**, khung/nút/badge là **shape**,
   màu và bo góc giữ nguyên.
3. Sắp 10 frame cạnh nhau để có nguyên bộ desktop + mobile của 5 trang.

> Nếu Figma hỏi "Flatten SVG?" → chọn **Keep layers** để giữ cấu trúc.

### Cách khác — html.to.design (nếu muốn dựng lại từ HTML sống)
Cài plugin *html.to.design* → Import → *From code*, dán nội dung
`lego-manager-design.html`, đặt width 1440 / 390. Cho kết quả tương tự nhưng cần plugin.

## Lưu ý
- 2 biểu đồ ở Dashboard (“Dòng tiền theo tháng”, “Theo hình thức GD”) trống trong bản
  offline vì thư viện Chart.js tải từ CDN (bị chặn khi chạy offline). Khung chart vẫn còn,
  chỉ thiếu nét vẽ — không ảnh hưởng layout.
- SVG được sinh bằng `dom-to-svg` từ DOM đã render thật, nên bố cục/độ rộng khớp pixel.
- Dữ liệu trong bản này là **mẫu**, không phải dữ liệu thật của bạn.
- Hệ màu / token thiết kế nằm trong `:root` ở đầu `src/Index.html` (vàng LEGO `#FFD500`,
  navy `#0C1F3F`, đỏ `#D8291C`…) — tiện khi dựng lại design system trong Figma.

## Dựng lại bản xuất
Script tạo bản này nằm trong scratchpad phiên làm việc (`mock.js` + `render.js`,
dùng `playwright-core` + Chromium). Chạy lại sẽ tạo mới HTML standalone và toàn bộ ảnh.
