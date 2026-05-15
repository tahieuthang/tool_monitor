**[Bước 1] Nhận & Xác thực Request (Adapter Web Layer)**

Automation Tool gửi HTTP POST đến /api/tickets/match-wiki kèm theo Header Authorization: Bearer <API_KEY> và Body JSON chứa mảng tickets.
File api.ts sẽ chạy Middleware kiểm tra API_KEY. Nếu đúng, nó đẩy request cho TicketController.
TicketController dùng Zod để validate (kiểm tra) dữ liệu đầu vào. Nếu dữ liệu bị thiếu hoặc sai kiểu, Global Error Handler lập tức bắt lỗi và trả về HTTP 400 Bad Request. Nếu chuẩn, nó biến Data thành các đối tượng Ticket (Entity) và chuyển xuống cho Use Case.
**[Bước 2] Logic Xử Lý Trọng Tâm (Application Layer - MatchWikiService) MatchWikiService nhận danh sách Ticket và lặp qua từng cái để xử lý luồng 2 Lớp (2 Layers):

Lớp 1 (Phản xạ cực nhanh - Exact Match):

Service dùng thuật toán MD5 băm nội dung ticket thành chuỗi Hash.
Sau đó gọi sang Cache Adapter (RamKnowledgeCacheAdapter.findExactMatch) để tìm xem hash này đã từng xuất hiện chưa.
Bên trong Adapter: Sẽ check Hash trong historyMap, lấy ra mảng các case_id, rồi nhặt nội dung từ caseMap để trả về ngay lập tức với tốc độ $O(1)$.
Nếu tìm thấy, ghi nhận kết quả và chuyển sang ticket tiếp theo.
Lớp 2 (Tìm kiếm phân tích - Inverted Index):

Nếu Lớp 1 không thấy, Service tiến hành Tokenize: Xóa dấu câu, viết thường, cắt chữ theo dấu cách, loại bỏ các từ quá ngắn (Stop words cơ bản).
Gửi mảng Token này sang Cache Adapter (searchByTokens).
Bên trong Adapter: Duyệt từng Token qua invertedIndex để tìm các case_id có chứa Token đó. Chấm điểm cộng dồn cho mỗi ID (id nào xuất hiện nhiều lần thì điểm cao). Sắp xếp mảng điểm và lấy ra Top 3 ID cao nhất, sau đó nhặt Data từ caseMap trả về.
Lưu lại cho lần sau: Service lấy kết quả của Lớp 2 vừa tìm được, nạp ngược lại vào historyMap thông qua hàm saveMatch(hash, ...) để lần sau gặp lại nội dung này thì Lớp 1 sẽ bắt được ngay.
[Bước 3] Format Output & Trả Kết Quả (Adapter Web Layer)

MatchWikiService trả mảng kết quả MatchResult[] ra cho TicketController.
Controller sẽ định dạng lại Data (loại bỏ các class methods, chỉ giữ raw JSON) thành cấu trúc chuẩn gồm total_tickets và danh sách results (có ticket_id, status, matches).
Gửi response HTTP 200 OK về cho Automation Tool.
(💡 Luồng Đồng Bộ Ngầm - Sync Flow: Diễn ra hoàn toàn độc lập ở một quá trình khác. File index.ts sẽ thiết lập một setInterval chạy mỗi 60 phút, gọi Github API, sinh Index mới và gán đè (Atomic update) bộ RAM Cache một cách chớp nhoáng mà không làm gián đoạn các Request ở trên).