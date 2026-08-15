// Kiểm tra shipDetectCarrier + shipMapStatusText ngoài Apps Script
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'Shipping.js');
const src = fs.readFileSync(SRC, 'utf8');
// stub các global của Apps Script để eval được
const stub = 'var Utilities={},PropertiesService={},ScriptApp={},UrlFetchApp={},Logger={log(){}},SpreadsheetApp={};';
eval(stub + src);

let fail = 0;
function eq(actual, expected, label) {
  const ok = actual === expected;
  if (!ok) fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + ' => ' + JSON.stringify(actual) +
    (ok ? '' : ' (mong đợi ' + JSON.stringify(expected) + ')'));
}

console.log('== shipDetectCarrier ==');
eq(shipDetectCarrier('149554355818', ''), 'vtp', 'mã 12 số bắt đầu bằng 1');
eq(shipDetectCarrier('149554355818', 'Shopee'), 'vtp', 'mã VTP thắng nguồn Shopee');
eq(shipDetectCarrier(' 149554355818 ', ''), 'vtp', 'có khoảng trắng thừa');
eq(shipDetectCarrier(149554355818, ''), 'vtp', 'truyền vào dạng số');
eq(shipDetectCarrier('249554355818', ''), 'unknown', '12 số nhưng bắt đầu bằng 2');
eq(shipDetectCarrier('14955435581', ''), 'unknown', 'chỉ 11 số');
eq(shipDetectCarrier('1495543558123', ''), 'unknown', '13 số');
eq(shipDetectCarrier('VTP123456', ''), 'vtp', 'tiền tố VTP');
eq(shipDetectCarrier('SPXVN123', ''), 'shopee', 'tiền tố SPX');
eq(shipDetectCarrier('12345678901234567890', ''), 'shopee', 'mã 20 số vẫn là Shopee');
eq(shipDetectCarrier('GHN999', ''), 'other', 'GHN');
eq(shipDetectCarrier('', 'Shopee'), 'unknown', 'không có mã');

console.log('\n== shipMapStatusText ==');
eq(shipMapStatusText('Giao hàng thành công'), 'Đã nhận hàng', 'giao thành công');
eq(shipMapStatusText('Phát thành công'), 'Đã nhận hàng', 'phát thành công');
eq(shipMapStatusText('Lấy hàng thành công'), 'Đang vận chuyển', 'lấy hàng thành công KHÔNG phải đã giao');
eq(shipMapStatusText('Giao hàng không thành công'), 'Đang vận chuyển', 'giao không thành công');
eq(shipMapStatusText('Đang giao hàng'), 'Đang vận chuyển', 'đang giao');
eq(shipMapStatusText('Đang luân chuyển'), 'Đang vận chuyển', 'luân chuyển');
eq(shipMapStatusText('Chuyển hoàn'), 'Hoàn trả', 'chuyển hoàn');
eq(shipMapStatusText('Đã hoàn'), 'Hoàn trả', 'đã hoàn');
eq(shipMapStatusText('Đã hoàn thành'), 'Đã nhận hàng', '"đã hoàn thành" KHÔNG phải hoàn trả');
eq(shipMapStatusText('Đơn hàng đã hủy'), 'Hoàn trả', 'đã hủy');
eq(shipMapStatusText('Chờ lấy hàng'), 'Chờ hàng', 'chờ lấy hàng');
eq(shipMapStatusText('Đã tiếp nhận'), 'Chờ hàng', 'đã tiếp nhận');
eq(shipMapStatusText('DANG GIAO HANG'), 'Đang vận chuyển', 'không dấu, viết hoa');
eq(shipMapStatusText('Xyz linh tinh'), '', 'không map được -> chuỗi rỗng');
eq(shipMapStatusText(''), '', 'rỗng');
eq(shipMapStatusText(null), '', 'null');

console.log('\n== _shipExtractStatusText ==');
eq(_shipExtractStatusText({ data: { ORDER_NUMBER: '1', ORDER_STATUS_NAME: 'Đang giao hàng' } }),
  'Đang giao hàng', 'object đơn lẻ');
eq(_shipExtractStatusText({ data: [
    { ORDER_DATE: '2026-08-10 09:00:00', STATUS_NAME: 'Lấy hàng thành công' },
    { ORDER_DATE: '2026-08-12 15:00:00', STATUS_NAME: 'Giao hàng thành công' }
  ] }), 'Giao hàng thành công', 'mảng hành trình -> lấy mốc mới nhất');
eq(_shipExtractStatusText({ data: [
    { ORDER_DATE: '2026-08-12 15:00:00', STATUS_NAME: 'Giao hàng thành công' },
    { ORDER_DATE: '2026-08-10 09:00:00', STATUS_NAME: 'Lấy hàng thành công' }
  ] }), 'Giao hàng thành công', 'mảng đảo ngược vẫn đúng');
eq(_shipExtractStatusText({ data: { ORDER_NUMBER: '1', TRACKING: [{ STATUS_NAME: 'Đang giao hàng' }] } }),
  'Đang giao hàng', 'hành trình lồng trong mảng con');
eq(_shipExtractStatusText({ data: [] }), '', 'mảng rỗng');
eq(_shipExtractStatusText(null), '', 'null');
eq(_shipExtractStatusText({ data: { ORDER_NUMBER: '1' } }), '', 'không có trường trạng thái');

console.log('\n' + (fail ? '✗ ' + fail + ' case sai' : '✓ Tất cả case đúng'));
process.exit(fail ? 1 : 0);
