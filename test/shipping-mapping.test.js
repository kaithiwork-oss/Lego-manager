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
eq(shipDetectCarrier('SPXVN063728919538', ''), 'shopee', 'mã SPX thật: SPXVN + 12 số');
eq(shipDetectCarrier('SPXVN063728919538', 'Bank'), 'shopee', 'mã SPX thắng nguồn Bank');
eq(shipDetectCarrier(' spxvn063728919538 ', ''), 'shopee', 'mã SPX viết thường + khoảng trắng');
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

console.log('\n== shipMapStatusText: tiếng Anh (SPX) ==');
eq(shipMapStatusText('Delivered'), 'Đã nhận hàng', 'Delivered');
eq(shipMapStatusText('Parcel has been delivered'), 'Đã nhận hàng', 'has been delivered');
eq(shipMapStatusText('Order completed'), 'Đã nhận hàng', 'Order completed');
eq(shipMapStatusText('Delivery failed'), 'Đang vận chuyển', 'Delivery failed -> vẫn đang đi');
eq(shipMapStatusText('Delivery attempt unsuccessful'), 'Đang vận chuyển', 'attempt unsuccessful');
eq(shipMapStatusText('Out for delivery'), 'Đang vận chuyển', 'Out for delivery chưa phải đã giao');
eq(shipMapStatusText('In transit'), 'Đang vận chuyển', 'In transit');
eq(shipMapStatusText('Picked up'), 'Đang vận chuyển', 'Picked up');
eq(shipMapStatusText('Arrived at sorting center'), 'Đang vận chuyển', 'Arrived at');
eq(shipMapStatusText('Returned to sender'), 'Hoàn trả', 'Returned to sender');
eq(shipMapStatusText('Order cancelled'), 'Hoàn trả', 'cancelled (2 chữ l)');
eq(shipMapStatusText('Order canceled'), 'Hoàn trả', 'canceled (1 chữ l)');
eq(shipMapStatusText('Order created'), 'Chờ hàng', 'Order created');
eq(shipMapStatusText('Pending pickup'), 'Chờ hàng', 'Pending pickup');

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
eq(_shipExtractStatusText({ data: [
    { STATUS_NAME: 'Lấy hàng thành công' },
    { STATUS_NAME: 'Đang giao hàng' }
  ] }), 'Đang giao hàng', 'mảng không có ngày -> lấy mục cuối');
eq(_shipExtractStatusText({ data: {
    ORDER_STATUS_NAME: 'Đang giao hàng',
    JOURNEY: [{ DESCRIPTION: 'Nhập kho' }]
  } }), 'Đang giao hàng', 'trạng thái tổng (nông) thắng chi tiết (sâu) khi cả hai không ngày');

console.log('\n== _shipExtractStatusText: payload kiểu SPX ==');
eq(_shipExtractStatusText({
    retcode: 0, message: 'success',
    data: { sls_tracking_info: { records: [
      { actual_time: 1755000000, milestone_name: 'Picked up' },
      { actual_time: 1755200000, milestone_name: 'Delivered' },
      { actual_time: 1755100000, milestone_name: 'In transit' }
    ] } }
  }), 'Delivered', 'mảng lồng sâu + timestamp số -> lấy mốc lớn nhất');
eq(_shipExtractStatusText({
    retcode: 0, message: 'success',
    data: { sls_tracking_info: { current_status: 'In transit' } }
  }), 'In transit', 'current_status lồng 2 tầng');
eq(_shipExtractStatusText({ retcode: 0, message: 'success', data: {} }), '',
  '"message":"success" của lớp bọc KHÔNG bị đọc nhầm thành trạng thái');
eq(_shipExtractStatusText({
    data: { records: [
      { actual_time: 999999999, milestone_name: 'Picked up' },
      { actual_time: 1755200000, milestone_name: 'Delivered' }
    ] }
  }), 'Delivered', 'timestamp so bằng số chứ không so chuỗi (9 số vs 10 số)');

console.log('\n== payload SPX THẬT (mã SPXVN063728919538) ==');
// Rút gọn từ response thật: records sắp xếp mới nhất TRƯỚC, có current_location/next_location lồng bên trong
const SPX_THAT = {
  retcode: 0,
  data: {
    parcel_info: { customer_tracking_no: '' },
    order_info: {
      sls_tn: 'VN262530859209X', spx_tn: 'SPXVN063728919538',
      tracking_code_group_name: 'In Transit', tracking_code_subgroup_name: 'In Transit',
      order_id: 132758861181, order_max_update_limit: 3
    },
    sls_tracking_info: {
      sls_tn: 'VN262530859209X', client_order_id: '132758861181',
      receiver_name: '', receiver_type_name: '',
      records: [
        { tracking_code: 'F515', tracking_name: 'Packed in Domestic Sorting Centre',
          description: 'Parcel is packed in domestic sorting centre and is ready for transit to next station',
          actual_time: 1786780847, reason_code: 'R00', reason_desc: 'R00',
          current_location: { location_name: '', lng: '', lat: '', full_address: '' },
          next_location: { location_name: '', lng: '', lat: '', full_address: '' },
          milestone_code: 5, milestone_name: 'In transit' },
        { tracking_code: 'F510', tracking_name: 'Enter Domestic Sorting Center',
          description: 'Parcel has arrived at station :BN B Mega SOC',
          actual_time: 1786683128, reason_code: 'R00', reason_desc: 'R00',
          current_location: { location_name: 'BN B Mega SOC', lng: '105.976847', lat: '21.074560',
            full_address: 'VN Tỉnh Bắc Ninh Phường Từ Sơn ...' },
          next_location: { location_name: 'BN A Mega SOC', lng: '105.976847', lat: '21.074560',
            full_address: 'VN Tỉnh Bắc Ninh Phường Từ Sơn ...' },
          milestone_code: 5, milestone_name: 'In transit' },
        { tracking_code: 'F580', tracking_name: 'Domestic Line Haul End',
          description: 'System reminder: Not in use, no need edit yet.',
          actual_time: 1786677783, reason_code: 'R00', milestone_code: 5, milestone_name: 'In transit' }
      ]
    }
  }
};
eq(_shipExtractStatusText(SPX_THAT), 'In transit', 'đọc đúng milestone_name của mốc mới nhất');
eq(shipMapStatusText(_shipExtractStatusText(SPX_THAT)), 'Đang vận chuyển', 'map ra Đang vận chuyển');

// Nếu records rỗng thì rơi về trạng thái tổng của đơn
const SPX_RONG = JSON.parse(JSON.stringify(SPX_THAT));
SPX_RONG.data.sls_tracking_info.records = [];
eq(_shipExtractStatusText(SPX_RONG), 'In Transit', 'records rỗng -> dùng tracking_code_group_name');

// Mốc mới nhất là Delivered thì phải thắng, kể cả khi nó không nằm đầu mảng
const SPX_GIAO = JSON.parse(JSON.stringify(SPX_THAT));
SPX_GIAO.data.sls_tracking_info.records.push(
  { tracking_code: 'F900', actual_time: 1786999999, milestone_name: 'Delivered',
    description: 'Parcel has been delivered' });
eq(shipMapStatusText(_shipExtractStatusText(SPX_GIAO)), 'Đã nhận hàng',
  'mốc Delivered mới nhất nằm cuối mảng vẫn thắng');

console.log('\n' + (fail ? '✗ ' + fail + ' case sai' : '✓ Tất cả case đúng'));
process.exit(fail ? 1 : 0);
