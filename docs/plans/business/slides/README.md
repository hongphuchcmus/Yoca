# Yoca business-model slides

Deck tám trang cho phần Business Model, gồm sáu slide thuyết trình và hai slide phụ lục. Deck được viết bằng Typst 0.15.1 và Touying 0.7.4, sử dụng IBM Plex Sans, nền trung tính phân lớp và Carbon Blue làm màu nhấn chính. Slide dùng `breakable: false`, grid hai chiều và vùng nội dung cố định để giữ đúng một trang và phát hiện overflow khi compile.

Các icon SVG trong `assets/` sử dụng hình học từ Carbon Icons, lấy từ package `@carbon/icons-react` đã cài trong workspace.

Cấu trúc source được chia theo vai trò: `theme.typ` chứa design tokens và cấu hình Touying; `components.typ` chứa các thành phần trình bày tái sử dụng; `main.typ` chỉ giữ nội dung và layout của từng slide. Icon xanh dùng trên nền sáng, còn biến thể `-white.svg` dùng trực tiếp trên panel inverse mà không có background hoặc border riêng.

Sáu slide chính lần lượt trình bày giá trị và nguồn doanh thu, cách chi phí hình thành, cơ cấu chi phí tại 3.000 và 30.000 MAU, phương án Qwen, lợi nhuận tại ba mốc và kế hoạch mở rộng. Hai slide cuối giữ bảng provider/quota cùng giả định và nguồn số liệu để sử dụng khi phản biện. Speaker notes nằm trực tiếp trong `main.typ`.

Các icon trong `assets/` dùng hình học Carbon. Hai donut chart được vẽ bằng CeTZ và CeTZ-Plot; nhãn, tỷ lệ và màu lấy từ `data/scenarios.json`.

Máy build cần cài IBM Plex Sans. Có thể kiểm tra bằng `typst fonts | rg "^IBM Plex Sans"`; mã nguồn vẫn khai báo Noto Sans và Liberation Sans làm font dự phòng.

```sh
typst compile docs/plans/business/slides/main.typ \
  docs/plans/business/slides/build/business-model-slides.pdf \
  --root .

typst compile docs/plans/business/slides/main.typ \
  "docs/plans/business/slides/build/business-model-slide-{0p}.png" \
  --root . \
  --format png \
  --ppi 160
```

`data/scenarios.json` chứa benchmark cold/warm, ba kịch bản MAU, hai cơ cấu chi phí và quota provider được hiển thị trên slide. Khi giả định kinh doanh hoặc benchmark thay đổi, cần đồng bộ file JSON trước khi build lại.

Các khoảng cách và kích thước component được chỉnh trong `components.typ`. Sau mỗi thay đổi layout, nên xuất toàn bộ slide thành PNG để kiểm tra clipping, nhãn donut và khoảng trống giữa các khối.
