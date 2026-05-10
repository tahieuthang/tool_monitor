# 📄 Kế Hoạch Thiết Kế Hệ Thống: Wiki-Lens (RAG Pre-filter)

## 1. Tổng quan dự án (Project Overview)

**Wiki-Lens** là một công cụ vệ tinh (microservice) độc lập, hoạt động như một lớp lọc trước (Pre-filter Layer) cho hệ thống Automation Tool hiện tại.
Thay vì Automation Tool phải nhồi toàn bộ danh sách mô tả Wiki ngắn gọn vào Prompt của AI Agent (khiến AI thiếu ngữ cảnh chi tiết và dễ nhầm lẫn), Automation Tool sẽ gửi nội dung Ticket qua API cho Wiki-Lens.
Wiki-Lens sẽ tìm ra Top N (ví dụ 3-5) tài liệu Wiki liên quan nhất, sau đó trả về cho Automation Tool để làm giàu (enrich) Prompt, giúp AI Agent ra quyết định chính xác, tự tin hơn.

## 2. Tech Stack & Technologies

*   **Runtime:** Node.js (v18+)
*   **Ngôn ngữ:** TypeScript
*   **Kiến trúc:** Hexagonal Architecture (Ports and Adapters)
*   **Web Framework:** Express.js (REST API)
*   **Nguồn dữ liệu (Data Source):** GitHub Wiki (Sử dụng Axios để để gọi Raw Content từ file Markdown trong repo Wiki của GitHub).

---

## 3. Workflow Logic & Input/Output

### Workflow Tổng Thể

1. **Luồng Đồng bộ (Sync Flow) - Mỗi 60 phút**
    *   Fetch: Gọi GitHub API lấy file https://github.com/QuanAnhDo/wiki-hub/blob/main/5.-Response-Templates/5.5-Template-Description.md (dùng Axios).
    *   Transform: Dùng Regex bóc tách Markdown → Mảng cases JSON (kèm tokens đã lọc stop-words).
    *   Refresh RAM: * Ghi đè mảng cases: historyMap.clear() (Xóa cache cũ), rebuildInvertedIndex() (Lập chỉ mục từ khóa mới).

2. **Luồng Truy vấn (Search Flow) - 2 Lớp**

* **Lớp 1: Exact Match (Phản xạ nhanh)**
    * Input: Ticket content.
    * Logic: MD5 Hash nội dung → Tra cứu trong historyMap.
    * Kết quả: Nếu thấy, trả về Top N ngay lập tức ($O(1)$).
* **Lớp 2: Inverted Index (Phân tích sâu) - Chỉ chạy khi Lớp 1 lỡ nhịp**
    * Tokenize: Tách ticket thành danh sách Keywords.
    * Scoring: Duyệt Keywords qua invertedIndex → Cộng dồn điểm cho các Case liên quan.
    * Rank & Cache: Sắp xếp điểm số → Lấy Top N → Lưu lại vào historyMap (để lần sau lớp 1 xử lý).
**Lưu ý**: 2 luồng chạy tuần tự từ lớp 1 → lớp 2. Nếu lớp 1 tìm thấy kết quả thì không chạy lớp 2, nếu lớp 2 tìm thấy kết quả thì ghi vào historyMap (để lần sau lớp 1 xử lý). Nếu lớp 2 khong tìm thấy kết quả thì sẽ chạy tới luồng 3.

### Dữ liệu Input / Output API

**Endpoint:** `POST /api/tickets/match-wiki`

**Request Body (Input):**
```json
{
  "tickets": [
    { "id": "TICKET-001", "message": "nội dung ticket 1" },
    { "id": "TICKET-002", "message": "nội dung ticket 2" }
  ]
}
```

**Response Body (Output):**
```json
{
  "total_tickets": 2,
  "results": [
    {
      "ticket_id": "TICKET-001",
      "status": "success",
      "matches": [
        {
          "rank": 1,
          "template_filename": "allocation.html",
          "markdown_content": "| **allocation.html** | Use this when... |"
        }
      ]
    },
    {
      "ticket_id": "TICKET-002",
      "status": "not_found",
      "matches": []
    }
  ]
}
```

---

## 4. Kiến Trúc Hexagonal (Cấu trúc thư mục)

Dự án sẽ được thiết kế theo kiến trúc Hexagonal (Ports & Adapters) để tách biệt Domain logic (RAG) khỏi các yếu tố kỹ thuật bên ngoài (Express, GitHub, LanceDB).

### Cấu trúc thư mục dự kiến

```text
wiki-lens/
├── src/
│   ├── domain/                      # (DOMAIN LAYER) Logic nghiệp vụ cốt lõi
│   │   ├── entities/                # Các thực thể dữ liệu
│   │   │   ├── Ticket.ts            # Chứa ID và nội dung ticket đầu vào
│   │   │   ├── WikiDocument.ts      # Chứa thông tin file Wiki sau khi parse
│   │   │   └── MatchResult.ts       # Kết quả khớp (ID + Markdown Content)
│   │   └── ports/                   # Giao diện giao tiếp
│   │       ├── in/                  # Use Cases
│   │       │   ├── IMatchWikiUseCase.ts
│   │       │   └── ISyncWikiUseCase.ts
│   │       └── out/                 # Output Ports
│   │           ├── IWikiSourcePort.ts      # Lấy dữ liệu từ Github
│   │           └── IKnowledgeCachePort.ts  # Cổng truy xuất Hash & Inverted Index
│   ├── application/                 # (APPLICATION LAYER) Cài đặt Use Cases
│   │   ├── MatchWikiService.ts      # Logic điều phối: Lớp 1 (Hash) -> Lớp 2 (Index)
│   │   └── SyncWikiService.ts       # Logic: Fetch Github -> Parse MD -> Rebuild RAM Cache
│   ├── adapters/                    # (ADAPTER LAYER) Cài đặt cụ thể các Port
│   │   ├── in/                      # Đầu vào (Driving Adapters)
│   │   │   └── web/
│   │   │       ├── controllers/     # Express Controllers
│   │   │       │   └── TicketController.ts
│   │   │       └── routes/          # Express Routes
│   │   │           └── api.ts
│   │   └── out/                     # Đầu ra (Driven Adapters)
│   │       ├── github/              # Lấy dữ liệu từ Github
│   │       │   └── GithubWikiAdapter.ts      # Dùng simple-git hoặc Axios gọi raw MD
│   │       └── cache/               # Bộ nhớ RAM (Trái tim của Lớp 1 & 2)
│   │           └── RamKnowledgeCacheAdapter.ts # Cài đặt Map (Hash) & Map<Set> (Index)
│   ├── infrastructure/              # (INFRASTRUCTURE LAYER) Cấu hình hệ thống
│   │   ├── config/                  # Quản lý .env (GITHUB_PAT, PORT)
│   │   ├── server.ts                # Khởi tạo Express App
│   │   └── di_container.ts          # Đăng ký các Singleton (Cache, Service)
│   └── index.ts                     # Điểm khởi chạy (Entry point)
├── package.json                     # Chỉ cần: express, simple-git, crypto, cors, dotenv
└── tsconfig.json
```

---

## 5. Chi Tiết Thành Phần (Thuyết Minh Kiến Trúc)

### 5.1. Domain Layer (`src/core/`)
Định nghĩa các entity thuần túy và interface.
*   **Entities:** `Ticket` (chứa content cần check), `WikiDocument` (chứa nội dung MD của github), `MatchResult` (kết quả trả về).
*   **Ports (Interfaces):** Đây là xương sống của Hexagonal.
    *   `IVectorStorePort`: Định nghĩa hàm `saveDocuments(docs)` và `search(vector, topK)`.
    *   `IEmbeddingPort`: Định nghĩa hàm `embedText(text: string): Promise<number[]>`.
    *   `IWikiSourcePort`: Định nghĩa hàm `fetchWikiPages(): Promise<WikiDocument[]>`.

### 5.2. Application Layer (`src/application/`)
Chứa Business Logic chính, kết nối các Port lại với nhau.
*   **`SyncWikiService`**:
    1.  Gọi `IWikiSourcePort` để lấy file markdown từ Github.
    2.  Dùng LlamaIndex.TS `SimpleNodeParser` để chia nhỏ file thành các chunks (Nodes).
    3.  Khởi tạo `VectorStoreIndex` với Custom Embedding và LanceDB VectorStore.
    4.  Đưa các Nodes vào index để lưu vào DB.
*   **`MatchWikiService`**:
    1.  Nhận `Ticket` text.
    2.  Dùng `VectorStoreIndex.asQueryEngine()` (hoặc `asRetriever()`) kết nối với LanceDB.
    3.  Tìm kiếm top K chunks gần nhất bằng nội dung của Ticket.
    4.  Xử lý logic (gộp các chunk cùng file) và trả về kết quả.

### 5.3. Adapter Layer (`src/adapters/`)
Nơi implement các công nghệ thực tế.
*   **`CustomTransformerEmbedding`**: Tạo một class kế thừa `BaseEmbedding` của LlamaIndex.TS.
    *   Bên trong sử dụng thư viện `@huggingface/transformers` để khởi tạo pipeline `feature-extraction` với model `Xenova/all-MiniLM-L6-v2`. Sử dụng pooling `'mean'` và `normalize: true` để lấy ra vector cuối cùng (thường là 384 dimensions). Override các hàm `getTextEmbedding` và `getQueryEmbedding`.
*   **`LanceDBAdapter`**: Tích hợp với `@lancedb/lancedb` và có thể dùng thông qua wrapper `LanceDBVectorStore` của LlamaIndex.TS.
    *   Sẽ lưu file LanceDB ở dạng thư mục local (ví dụ: `./data/lancedb_store`). Truyền `LanceDBVectorStore` vào `StorageContext` của LlamaIndex.
*   **`GithubWikiAdapter`**: Sử dụng thư viện `simple-git`.
    *   Github không có API REST riêng biệt cho thẻ Wiki, mà mỗi Wiki là một Git repo có URL dạng `https://github.com/owner/repo.wiki.git`.
    *   Adapter sẽ clone repo này vào một thư mục tạm, dùng hàm `fs` để đọc tất cả nội dung `.md` trong đó rồi map ra cấu trúc `WikiDocument`.
*   **Web (Express)**: Khởi tạo server Express, nhận request, map payload JSON thành Entity và gọi vào Service.

---

## 6. Các Điểm Chú Ý Kỹ Thuật (Technical Considerations)

1.  **Chạy Local Model (Xenova):**
    *   Vì chạy Node.js, `transformers.js` sẽ tải trọng số (weights) của model `all-MiniLM-L6-v2` về cache local trong lần chạy đầu tiên. Quá trình này có thể tốn một chút thời gian lúc start server, nhưng về sau inference sẽ chạy hoàn toàn offline và rất nhanh.
    *   Lưu ý: Bạn phải bọc thư viện này vào `BaseEmbedding` của LlamaIndex.TS vì LlamaIndex.TS không hỗ trợ sẵn transformers.js ra khỏi hộp (out-of-the-box).
2.  **Chiến lược Chunking:**
    *   Vì Wiki thường chứa cấu trúc Markdown (`## Header`), nên cấu hình `SimpleNodeParser` với kích thước chunk vừa phải (ví dụ 512 tokens, overlap 50 tokens) để bảo toàn context.
3.  **Cách tiếp cận Github Wiki:**
    *   Phải đảm bảo repo Wiki có ít nhất 1 file được tạo trên Github Web UI trước đó, nếu không URL `.wiki.git` sẽ báo lỗi 404. Phải cấu hình PAT (Personal Access Token) cho url clone nếu là private repo (`https://user:token@github.com/...`).

## 7. Các Bước Triển Khai (Roadmap)

1.  **Giai đoạn 1: Khởi tạo dự án & Cấu trúc Hexagonal**
    *   Khởi tạo `package.json`, cài đặt TypeScript, Express, các thư viện cần thiết (`@lancedb/lancedb`, `@huggingface/transformers`, `llamaindex`, `simple-git`).
    *   Tạo các thư mục theo chuẩn cấu trúc trên.
2.  **Giai đoạn 2: Xây dựng Adapters Cốt lõi (Out Ports)**
    *   Code `GithubWikiAdapter` (clone repo và đọc markdown bằng simple-git và fs).
    *   Code `CustomTransformerEmbedding` (chạy model Xenova lấy vector array).
    *   Code `LanceDBAdapter` (kết nối LanceDB, tạo LanceDBVectorStore của LlamaIndex).
3.  **Giai đoạn 3: Application & LlamaIndex RAG Pipeline**
    *   Cài đặt `SyncWikiService`: Kết nối luồng Github -> Parser -> Embed -> LanceDB.
    *   Cài đặt `MatchWikiService`: Kết nối luồng Ticket Input -> LlamaIndex Retriever -> LanceDB Search -> Format Result.
4.  **Giai đoạn 4: Express API & Tích hợp (In Ports)**
    *   Xây dựng Express Routes.
    *   Config Dependency Injection (có thể dùng manual injection hoặc thư viện như tsyringe).
    *   Test toàn bộ luồng bằng Postman.
5.  **Giai đoạn 5: Cập nhật Automation Tool**
    *   Quay lại dự án `ticket-automation` (Automation Tool), sửa code ở bước trước khi gọi Agent CLI. Gửi call qua Wiki-Lens để lấy context Wiki, sau đó nhúng context đó vào System Prompt thay vì ném toàn bộ bảng mô tả.
