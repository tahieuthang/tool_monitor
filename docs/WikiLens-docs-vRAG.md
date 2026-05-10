# 📄 Kế Hoạch Thiết Kế Hệ Thống: Wiki-Lens (RAG Pre-filter)

## 1. Tổng quan dự án (Project Overview)

**Wiki-Lens** là một công cụ vệ tinh (microservice) độc lập, hoạt động như một lớp lọc trước (Pre-filter Layer) cho hệ thống Automation Tool hiện tại.
Thay vì Automation Tool phải nhồi toàn bộ danh sách mô tả Wiki ngắn gọn vào Prompt của AI Agent (khiến AI thiếu ngữ cảnh chi tiết và dễ nhầm lẫn), Automation Tool sẽ gửi nội dung Ticket qua API cho Wiki-Lens.
Wiki-Lens sử dụng kỹ thuật **RAG (Retrieval-Augmented Generation)** để tìm ra Top N (ví dụ 3-5) tài liệu Wiki liên quan và chi tiết nhất, sau đó trả về cho Automation Tool để làm giàu (enrich) Prompt, giúp AI Agent ra quyết định chính xác hơn.

## 2. Tech Stack & Technologies

*   **Runtime:** Node.js (v18+)
*   **Ngôn ngữ:** TypeScript
*   **Kiến trúc:** Hexagonal Architecture (Ports and Adapters)
*   **Web Framework:** Express.js (REST API)
*   **RAG Framework:** LlamaIndex.TS
*   **Vector Database:** LanceDB (Local, Serverless Vector DB, package `@lancedb/lancedb`)
*   **Embedding Model:** `Xenova/all-MiniLM-L6-v2` (chạy local qua `@huggingface/transformers` hoặc có thể wrap trong một Custom Embedding Class của LlamaIndex).
*   **Nguồn dữ liệu (Data Source):** GitHub Wiki (Sử dụng Git client để clone/pull nội dung markdown thay vì REST API vì thẻ Wiki của Github không có REST API riêng, nó là một git repo ẩn).

---

## 3. Workflow Logic & Input/Output

### Workflow Tổng Thể

1. **Luồng Đồng bộ (Sync Flow) - Mỗi 60 phút**
    *   Fetch: Gọi GitHub API lấy file .md (dùng PAT).
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

3.  **Ingestion Phase (Đồng bộ Wiki vào Vector DB) Luồng 3:**
    *   Hệ thống có một cronjob hoặc endpoint trigger thủ công `/api/wiki/sync`.
    *   Sử dụng thư viện `simple-git` để clone repository Wiki dạng `https://github.com/org/repo.wiki.git` về thư mục local tạm thời.
    *   Tải nội dung thô (raw content) của từng file `.md`.
    *   Sử dụng `SimpleNodeParser` của LlamaIndex.TS để chia (chunking) file `.md` thành các đoạn nhỏ (`Document` -> `Nodes`).
    *   Dùng Custom Embedding Class bọc model `Xenova/all-MiniLM-L6-v2` để biến đổi các đoạn text này thành vectors (embeddings).
    *   Lưu các vector và metadata (tên file, URL, đoạn text gốc) vào **LanceDB** thông qua `LanceDBVectorStore`.
4.  **Retrieval Phase (Khi Automation Tool gọi):**
    *   Automation Tool gửi HTTP POST request tới endpoint `/api/tickets/match-wiki` của Wiki-Lens.
    *   **Input:** Nội dung raw của Ticket (string).
    *   Wiki-Lens sử dụng Custom Embedding Class để tạo vector (embedding) cho nội dung Ticket này.
    *   Wiki-Lens thực hiện **Vector Search** trên LanceDB thông qua LlamaIndex `VectorStoreIndex` để tìm ra Top K (vd: 3) chunks (Nodes) có độ tương đồng (Cosine Similarity) cao nhất.
    *   Gom nhóm các chunks thuộc về cùng một file Wiki (để tránh trả về các đoạn rời rạc).
    *   **Output:** Trả về danh sách các Wiki templates phù hợp nhất cùng với full nội dung Markdown của chúng (hoặc tóm tắt nội dung tùy cấu hình).

### Dữ liệu Input / Output API

**Endpoint:** `POST /api/tickets/match-wiki`

**Request Body (Input):**
```json
{
  "tickets": [
    { "id": "uuid_1", "message": "nội dung ticket 1" },
    { "id": "uuid_2", "message": "nội dung ticket 2" }
  ]
}
```

**Response Body (Output):**
```json
{
  "ticketId": "12345",
  "matches": [
    {
      "templateName": "pay-not-full.html",
      "score": 0.89,
      "wikiUrl": "https://github.com/org/repo/wiki/pay-not-full",
      "content": "## Pay Not Full Template\n\nDùng khi khách chưa đóng đủ tiền (remaining > 0)..."
    },
    {
      "templateName": "allocation.html",
      "score": 0.75,
      "wikiUrl": "https://github.com/org/repo/wiki/allocation",
      "content": "## Allocation Template\n\nDùng khi không thể enroll và remaining <= 0..."
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
│   ├── domain/
│   │   ├── entities/                       # Các đối tượng thực thể (Ticket, WikiDocument, MatchResult)
│   │   │   ├── Ticket.ts
│   │   │   ├── WikiDocument.ts
│   │   │   └── MatchResult.ts
│   │   └── ports/
│   │       ├── in/
│   │       │   ├── IMatchWikiUseCase.ts
│   │       │   └── ISyncWikiUseCase.ts
│   │       └── out/
│   │           ├── IVectorStorePort.ts     # Interface lưu/tìm kiếm vector
│   │           ├── IEmbeddingPort.ts       # Interface tạo embedding từ text
│   │           ├── IWikiSourcePort.ts      # Interface lấy dữ liệu từ Github
│   │           └── IKnowledgeCachePort.ts    # Port để truy xuất Hash & Inverted Index
│   ├── application/                         
│   │   ├── MatchWikiService.ts              # Logic check: Cache -> Inverted Index -> RAG
│   │   └── SyncWikiService.ts               # Thêm bước nạp data vào Cache sau khi Sync
│   ├── adapters/
│   │   ├── in/
│   │   │   └── web/
│   │   │       ├── controllers/
│   │   │       │   └── TicketController.ts
│   │   │       └── routes/
│   │   │           └── api.ts
│   │   └── out/
│   │       ├── ai/
│   │       │   ├── XenovaEmbeddingAdapter.ts          # Cài đặt IEmbeddingPort
│   │       │   └── CustomTransformerEmbedding.ts      # Kế thừa BaseEmbedding của LlamaIndex.TS
│   │       ├── db/
│   │       │   └── LanceDBAdapter.ts                  # Cài đặt IVectorStorePort dùng LlamaIndex/LanceDB
│   │       ├── github/
│   │       │   └── GithubWikiAdapter.ts               # Cài đặt IWikiSourcePort dùng simple-git clone repo
│   │       └── cache/                                # Folder chứa cài đặt cho Lớp 1 & 2
│   │           └── RamKnowledgeCacheAdapter.ts        # Cài đặt Hash Map & Inverted Index trên RAM
│   ├── infrastructure/
│   │   ├── config/
│   │   ├── server.ts
│   │   └── di_container.ts                  # Đăng ký RamKnowledgeCacheAdapter
│   └── index.ts
├── package.json
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
