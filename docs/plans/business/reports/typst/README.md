# Yoca business-model report — Typst

Bản báo cáo dành cho giảng viên và là nguồn nội dung duy nhất của phần mô hình kinh doanh. Báo cáo đọc dữ liệu biểu đồ từ `data/scenarios.json`; dữ liệu slide được giữ riêng để hai tài liệu có thể thay đổi bố cục độc lập.

## Cấu trúc

- `main.typ`: nội dung và bố cục báo cáo.
- `theme.typ`: khổ A4, font, heading, header/footer và màu Carbon.
- `components.typ`: bảng, callout, metric và biểu đồ tái sử dụng.
- `data/scenarios.json`: ba kịch bản tài chính và số đo cold/warm dùng trong báo cáo.
- `bibliography.bib`: nguồn giá và quota công khai.
- `build/`: PDF và ảnh preview sau khi compile.

Bảng thuật ngữ nằm trước tài liệu tham khảo và chỉ bao gồm các khái niệm xuất hiện trực tiếp trong báo cáo.

Donut chart sử dụng `CeTZ 0.5.2` và `CeTZ-Plot 0.1.4`; stacked bar tài chính dùng grid/shape native của Typst để giữ hai phần cùng chiều cao. Typst tải package từ Universe trong lần compile đầu tiên.

```sh
typst compile docs/plans/business/reports/typst/main.typ \
  docs/plans/business/reports/typst/build/yoca-business-model-report.pdf \
  --root .

typst compile docs/plans/business/reports/typst/main.typ \
  "docs/plans/business/reports/typst/build/page-{0p}.png" \
  --root . \
  --format png \
  --ppi 130
```

Sau khi giả định kinh doanh hoặc benchmark thay đổi, cập nhật `data/scenarios.json`, kiểm tra lại các bảng số tĩnh trong `main.typ`, rồi compile PDF và toàn bộ ảnh preview để phát hiện overflow.
