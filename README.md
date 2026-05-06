# 📄 Kế Hoạch Phát Triển Hệ Thống Giám Sát Xử Lý Ticket  
## (Support Ops Intelligence Center)

---

## 1. Tổng quan dự án

Hệ thống đóng vai trò là **Trung tâm điều khiển và giám sát (Monitoring & Control Center)** cho luồng tự động hóa xử lý ticket.  

Thay vì chỉ quản lý nghiệp vụ như Odoo, hệ thống này tập trung vào:
- Giám sát hiệu suất AI  
- Đối chiếu quy trình nội bộ (Wiki)  
- Quản trị rủi ro trong vận hành tự động

---

## 2. Kiến trúc kết nối (Integration Strategy)

- **Cơ chế:**
  - LangGraph checkpoint collection: KHÔNG đọc trực tiếp (format internal) => Cần collection monitoring riêng (`ticket_traces`) do automation tool chủ động ghi vào
  - Logger hiện tại (file-based) cần migrate sang MongoDB
- **Luồng dữ liệu:**
  - Tool Automation ghi dữ liệu monitoring vào collection `ticket_traces` trong MongoDB Atlas sau mỗi node quan trọng (analyze, sendMail, markNew)
  - Tool Monitoring đọc `ticket_traces` để hiển thị báo cáo thống kê

### Data Model (ticket_traces collection)

Tool Automation cần ghi vào MongoDB một document cho mỗi ticket với cấu trúc sau:

```json
{
  "ticketId": 3800,
  "ticketName": "Không enroll được",
  "timestamp": "2026-05-06T12:00:00Z",
  "stage": "classified | completed | failed | rejected | skipped",

  "agentRawOutput": "...(full stdout từ AI agent)...",
  "agentSummary": "Khách không enroll được do remaining > 0",
  "templateName": "allocation.html",
  "confidence": 85,
  "needsAllocation": true,
  "crmIds": ["665a..."],
  "trendTags": ["ENROLLMENT_ISSUE"],

  "failureType": "preflight_skip | low_confidence | no_template | human_reject | agent_error | send_mail_error",
  "rejectReason": "(nhập từ human khi reject — optional)",

  "agentLatencyMs": 45000,
  "approvalLatencyMs": 120000,
  "totalProcessingMs": 180000
}
```

---

## 3. Tính năng cốt lõi (Core Features)

---

### 🔹 Feature 1: AGENT REASONING TRACEABILITY (GIÁM SÁT CHUỖI SUY LUẬN AI)

#### Mô tả

- **What:** Cung cấp khả năng quan sát quá trình tư duy của AI khi xử lý một ticket cụ thể.
- **Why:** AI nghiên cứu Wiki trực tiếp trên Web nên dễ xảy ra sai sót. Tính năng này giúp người duyệt (Human Approver) có đủ cơ sở tin tưởng để bấm duyệt hoặc phát hiện sai lầm của AI ngay lập tức.

  - Định vị lỗi chính xác: Giúp phân biệt lỗi do thiếu dữ liệu trên Wiki hay do AI tư duy sai (Prompt Logic), từ đó biết chính xác cần sửa Wiki hay tối ưu lại Prompt.

  - Cải thiện chất lượng Prompt (Few-shot Learning): Thay vì dùng một Prompt cố định mang tính lý thuyết, việc đưa thêm 2-3 ví dụ thực tế (đã được lưu từ log và con người kiểm chứng) vào Prompt sẽ giúp AI hiểu ngữ cảnh tốt hơn và giảm tỷ lệ ảo giác.

  - Giải trình và báo cáo cải tiến: Cung cấp bằng chứng minh bạch để giải quyết khiếu nại khách hàng và đưa ra số liệu thuyết phục về tỷ lệ tự động hóa cũng như các lỗ hổng tri thức (wiki) cần bổ sung.

#### FRD (Functional Requirements Document)

- **Raw Agent Execution Log:** Hiển thị full text output (stdout) của agent session — bao gồm quá trình agent đọc Wiki, suy luận, và các command agent đã chạy (vd: `pnpm allocation`). Đây là dữ liệu dạng unstructured text, không phải structured JSON.
- **Parsed Classification Result:** Hiển thị JSON kết quả phân loại cuối cùng của AI (`needsAllocation`, `templateName`, `confidence`, `trendTags`).
- **Agent Summary:** Tóm tắt 1-2 câu mà AI tự viết về nội dung và context của ticket.

#### SRS (Software Requirements Specification)

- **Input (từ Automation Tool):** Field `agentRawOutput` (string — full stdout buffer từ headless agent CLI) được lưu vào `ticket_traces`.
- **UI:** Component "Reasoning View" chia 3 tab:
  1. **Raw Log** — hiển thị `agentRawOutput` dạng terminal/monospace, có syntax highlight cho JSON blocks
  2. **Classification** — hiển thị bảng: templateName, confidence, needsAllocation, trendTags
  3. **Summary** — hiển thị `agentSummary` dạng text

#### Workflow

- Tool Automation quét Ticket → Spawn Headless AI Agent → **Buffer toàn bộ stdout** → Lưu vào `ticket_traces.agentRawOutput`.
- Tool Monitoring quét `ticket_traces` → Hiển thị Reasoning View tương ứng với mã Ticket.
- Human Approver xem chi tiết luồng suy luận trên Monitor Tool → đối chiếu với template đề xuất → sang Slack/API để Approve hoặc Reject.

> **Lưu ý kỹ thuật cho Automation Tool:** Hiện tại `agent-cli.ts` stream stdout ra console (`child.stdout?.on("data", ...)`) nhưng KHÔNG buffer lại. Cần thêm buffer để lưu vào DB.

---

### 🔹 Feature 2: SKIP & REJECT ANALYTICS (PHÂN TÍCH LỖI & BỎ SÓT)

- **What:** Hệ thống quản lý và phân tích các Ticket bị thất bại — bao gồm ticket bị SKIP (không qua được analyze) và ticket bị con người Reject.
- **Why:** Tránh lãng phí dữ liệu từ các ca lỗi. Biến lỗi của AI thành tài liệu để cập nhật Wiki.

#### FRD (Functional Requirements Document)

- **Phân loại Root Cause (failure_type):** Automation Tool cần gán đúng loại lỗi dựa trên vị trí ticket dừng trong graph:

  | `failure_type` | Điều kiện trong code | Ý nghĩa |
  |---|---|---|
  | `preflight_skip` | `preflightSkipped = true` (stage ≠ New hoặc latest message ≠ OdooBot) | Ticket không phải đối tượng xử lý — **không phải lỗi AI** |
  | `low_confidence` | `confidence < 70` tại analyzeNode | AI không đủ tự tin — có thể do thiếu Wiki hoặc prompt yếu |
  | `no_template` | `templateName = ""` tại analyzeNode (confidence có thể ≥ 70) | AI nhận diện vấn đề nhưng không tìm được template phù hợp |
  | `human_reject` | `isApproved = false` tại humanCheck | Human đánh giá AI chọn sai template hoặc sai ngữ cảnh |
  | `agent_error` | `callAgentHeadless()` throw exception hoặc trả về JSON parse fail | Agent CLI bị lỗi kỹ thuật (timeout, crash, output không hợp lệ) |
  | `send_mail_error` | `sendMail` node throw exception | Gửi email thất bại (Odoo API lỗi, template không tìm thấy trên Wiki) |

- **Reject Analytics:** Thống kê tỷ lệ và xu hướng từng loại `failure_type` theo thời gian.

- **Reject Reason (cần bổ sung phía Automation Tool):** Hiện tại khi human reject, chỉ gửi `{approve: false}` — KHÔNG có lý do. Cần bổ sung field `reject_reason` (text input) vào approve route và Slack reject dialog để Monitor Tool có dữ liệu phân tích sâu hơn.

#### SRS (Software Requirements Specification)

- **Data Model:** Dữ liệu JSON từ Tool Automation ghi vào `ticket_traces` với field `failure_type` (enum 6 giá trị trên) và `reject_reason` (string, optional).
- **UI:**
  - Biểu đồ tròn (Pie Chart) phân tích tỷ lệ các loại `failure_type` (loại trừ `preflight_skip` vì đây không phải lỗi AI).
  - Bảng danh sách ticket bị reject kèm `reject_reason` để admin duyệt.
  - Biểu đồ đường (Line Chart) theo dõi xu hướng `low_confidence` theo tuần — giảm = prompt/wiki cải thiện.

#### Workflow

- Ticket bị SKIP hoặc bị Reject → Automation Tool ghi `failure_type` + `reject_reason` vào `ticket_traces`.
- Monitoring System query `ticket_traces` theo `failure_type` → tạo biểu đồ thống kê.
- Admin nhận báo cáo → Nắm bắt được các lý do skip phổ biến → Có hướng bổ sung Wiki hoặc tối ưu Prompt.

> **Lưu ý:** `preflight_skip` chiếm tỷ lệ lớn nhất (ticket đã xử lý, ticket nhân viên trả lời) nhưng KHÔNG phản ánh chất lượng AI. Nên tách riêng hoặc cho filter ẩn trong dashboard.

---

### 🔹 Feature 3: TREND TAGS HEATMAP (BẢN ĐỒ XU HƯỚNG VẤN ĐỀ KHÁCH HÀNG)

#### Mô tả

- **What:** Trực quan hóa các loại vấn đề khách hàng gặp phải theo thời gian, dựa trên `trendTags` mà AI gán cho mỗi ticket đã xử lý thành công.
- **Why:** Automation Tool đã có sẵn hệ thống `tags_registry.txt` với 40+ loại vấn đề (ENROLLMENT_ISSUE, PRICING_ISSUE, TMS_LOGIN_ISSUE...) và AI tự động gán tag cho mỗi ticket. Dữ liệu này đang ghi vào file `trend_analysis.jsonl` nhưng **không ai đọc** — đây là dữ liệu quý bị lãng phí hoàn toàn.

#### Tại sao feature này hữu ích?

1. **Phát hiện sự cố hệ thống sớm:** Nếu ENROLLMENT_ISSUE đột ngột tăng vọt trong 1 ngày → có thể hệ thống enrollment đang lỗi → cảnh báo kịp thời cho team tech.
2. **Định hướng đầu tư Wiki:** Tag nào xuất hiện nhiều nhất nhưng tỷ lệ skip cao → đó là lĩnh vực cần viết Wiki bổ sung.
3. **Báo cáo cho quản lý:** Cho biết khách hàng đang gặp vấn đề gì nhiều nhất → định hướng cải thiện sản phẩm.
4. **Đo lường hiệu quả cải tiến:** Sau khi viết Wiki mới cho PRICING_ISSUE, theo dõi xem tỷ lệ skip của tag này có giảm không.

#### FRD (Functional Requirements Document)

- **Trend Heatmap:** Biểu đồ heatmap hiển thị tần suất từng tag theo ngày/tuần. Trục X = thời gian, Trục Y = tên tag, màu sắc = số lượng ticket.
- **Top Tags Dashboard:** Bảng xếp hạng top 10 tags phổ biến nhất trong 7/30 ngày gần nhất.
- **Spike Alert:** Đánh dấu khi 1 tag tăng đột biến (>200% so với trung bình tuần trước) — gợi ý có sự cố hệ thống.
- **Tag × Outcome Cross-tab:** Bảng chéo tag vs kết quả (completed/rejected/skipped) — cho biết với mỗi loại vấn đề, AI xử lý tốt hay tệ.

#### SRS (Software Requirements Specification)

- **Input:** Field `trendTags` (string array) từ `ticket_traces`. Dữ liệu này Automation Tool đã có sẵn — chỉ cần migrate từ file `trend_analysis.jsonl` sang MongoDB.
- **UI:**
  - Heatmap component (có thể dùng thư viện như Chart.js hoặc D3.js)
  - Filter theo khoảng thời gian (7d / 30d / 90d)
  - Click vào 1 ô heatmap → drill-down hiển thị danh sách ticket cụ thể

#### Workflow

- Sau mỗi ticket có `confidence ≥ 70`, Automation Tool lưu `trendTags` vào `ticket_traces`.
- Monitor Tool query theo thời gian → aggregate count theo tag → render heatmap.
- Admin phát hiện spike → click drill-down → xem danh sách ticket → xác định nguyên nhân gốc.

---

### 🔹 Feature 4: APPROVAL QUEUE & RESPONSE TIME (HÀNG ĐỢI DUYỆT & THỜI GIAN PHẢN HỒI)

#### Mô tả

- **What:** Dashboard hiển thị danh sách ticket đang chờ human approve và đo thời gian từ lúc AI phân loại xong đến lúc human bấm Approve/Reject.
- **Why:** Đây là pain point thực tế lớn nhất của hệ thống hiện tại — ticket bị **"treo" vô thời hạn** tại bước `human_check` (interrupt) mà không ai biết. Hiện tại:
  - Không có cách nào xem "có bao nhiêu ticket đang chờ duyệt" ngoài việc kiểm tra từng checkpoint trong MongoDB
  - Human approver có thể quên hoặc bỏ sót Slack notification
  - Không đo được thời gian phản hồi → không biết bottleneck nằm ở AI hay ở người

#### Tại sao feature này hữu ích?

1. **Tránh ticket bị bỏ quên:** Nếu ticket chờ > 2 giờ mà chưa duyệt → cảnh báo escalation.
2. **Đo SLA thực tế:** Thời gian xử lý ticket = AI processing time + approval wait time. Nếu approval chiếm 80% thời gian → vấn đề không phải AI mà là quy trình duyệt.
3. **Quyết định mở rộng auto-approve:** Nếu tỷ lệ approve đạt >95% cho 1 loại template → có thể xem xét auto-approve template đó (bỏ human check).

#### FRD (Functional Requirements Document)

- **Pending Queue List:** Danh sách ticket đang chờ duyệt, sắp xếp theo thời gian chờ giảm dần. Hiển thị: ticketId, ticketName, templateName, confidence, agentSummary, thời gian đã chờ.
- **Approval Response Time:** Biểu đồ phân bổ thời gian từ `notify_slack` đến `human_check resolved` (approve/reject).
- **Approve Rate by Template:** Biểu đồ cột hiển thị tỷ lệ approve/reject cho từng loại template — template nào hay bị reject → cần review lại.
- **Overdue Alert:** Cảnh báo khi ticket chờ duyệt quá ngưỡng (configurable, mặc định 2 giờ).

#### SRS (Software Requirements Specification)

- **Input:** Cần 2 timestamp từ Automation Tool:
  - `classifiedAt` — thời điểm analyzeNode hoàn tất (ticket vào hàng đợi duyệt)
  - `resolvedAt` — thời điểm humanCheck nhận được approve/reject
  - `approvalLatencyMs` = `resolvedAt - classifiedAt`
- **UI:**
  - Bảng Pending Queue (real-time hoặc polling 30s)
  - Biểu đồ histogram thời gian phản hồi
  - Biểu đồ approve rate theo template

#### Workflow

- Ticket đạt `confidence ≥ 70` → Automation Tool ghi `classifiedAt` vào `ticket_traces`.
- Human approve/reject → Automation Tool ghi `resolvedAt` + tính `approvalLatencyMs`.
- Monitor Tool hiển thị danh sách ticket có `classifiedAt` nhưng chưa có `resolvedAt` = đang chờ duyệt.
- Admin theo dõi queue → push approver nếu ticket overdue → tối ưu quy trình.

---

### 🔹 Feature 5: AUTOMATION FUNNEL (PHỄU TỰ ĐỘNG HÓA)

#### Mô tả

- **What:** Biểu đồ phễu (funnel chart) hiển thị số lượng ticket đi qua từng bước của pipeline xử lý, từ đó xác định **tỷ lệ tự động hóa thực tế** (bao nhiêu % ticket từ lúc vào đến lúc xử lý xong hoàn toàn mà không cần can thiệp tay ngoài approve).
- **Why:** Đây là **chỉ số quan trọng nhất** để báo cáo giá trị của hệ thống cho management. Hiện tại không có cách nào trả lời câu hỏi: "Hệ thống đã tự động xử lý được bao nhiêu % ticket?".

#### Các bước trong phễu

| Bước | Mô tả | Dữ liệu từ |
|---|---|---|
| **Total Incoming** | Tổng ticket Watcher quét được | `ticket_traces` (tất cả records) |
| **Passed Preflight** | Ticket thực sự cần xử lý (stage=New, msg=OdooBot) | `failure_type ≠ preflight_skip` |
| **AI Classified** | AI phân loại thành công (confidence ≥ 70 + có template) | `stage = classified/completed/rejected` |
| **Human Approved** | Human bấm Approve | `stage = completed` |
| **Email Sent & Solved** | Email gửi thành công + ticket chuyển Solved | `stage = completed` |

#### FRD (Functional Requirements Document)

- **Funnel Chart:** Biểu đồ phễu 5 bước với số lượng ticket và tỷ lệ % conversion giữa mỗi bước.
- **Automation Rate KPI:** Chỉ số lớn hiển thị nổi bật: `Tỷ lệ tự động hóa = (Email Sent & Solved) / (Passed Preflight) × 100%`
- **Filter theo thời gian:** Ngày / Tuần / Tháng.
- **Trend chart:** Biểu đồ đường hiển thị Automation Rate theo tuần → thấy được sự cải thiện theo thời gian.

#### SRS (Software Requirements Specification)

- **Input:** Dữ liệu từ `ticket_traces.stage` và `ticket_traces.failure_type` — Automation Tool đã ghi đủ thông tin, chỉ cần aggregate.
- **UI:** Funnel chart + KPI card + line chart.

#### Workflow

- Monitor Tool query `ticket_traces` → group by stage/failure_type → tính phễu.
- Admin/Manager xem dashboard → thấy tỷ lệ tự động hóa + xác định bottleneck (bước nào rụng nhiều nhất).
- Quyết định hành động: rụng ở AI Classified → cải thiện Wiki/Prompt. Rụng ở Human Approved → review quy trình duyệt.

---

## 4. Communication Checklist

Để triển khai, cần thống nhất với team Tool Automation:

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Tạo collection `ticket_traces` trong MongoDB | ⬜ Chưa | Schema như mục 2 |
| Buffer agent stdout trong `agent-cli.ts` | ⬜ Chưa | Cần sửa code automation |
| Thêm `reject_reason` vào approve route + Slack | ⬜ Chưa | Cần thêm modal/input |
| Track `agentLatencyMs` trong analyzeNode | ⬜ Chưa | `Date.now()` trước/sau `callAgentHeadless` |
| Track `classifiedAt` / `resolvedAt` timestamps | ⬜ Chưa | Ghi tại analyzeNode và humanCheck |
| Migrate file-based logger → MongoDB writer | ⬜ Chưa | Thay `fs.writeFile` bằng `collection.insertOne` |
| Gán `failure_type` enum tại các điểm exit | ⬜ Chưa | preflight, analyze, humanCheck, sendMail |
| Migrate `trend_analysis.jsonl` → MongoDB | ⬜ Chưa | Đã có data, chỉ cần đổi destination |


<!-- ### 🔹 Feature 3: AI CONFIDENCE & HUMAN AGREEMENT METRICS

Thống kê các chỉ số Độ chính xác và Hiệu quả AI.

#### Mô tả
- **What:** Bộ chỉ số đo lường độ tin cậy của AI và mức độ đồng thuận của con người đối với các quyết định của AI.
- **Why:** Để thấy được hệ thống có khả năng tự đánh giá và đo lường khoảng cách giữa "Tool" và "Người dùng".

#### FRD (Functional Requirements Document)

- **Confidence Calculation:** Hiển thị điểm tự tin (1-100%) của AI dựa trên độ khớp thông tin giữa Ticket và Wiki cào được.
- **Agreement Tracking:** Tính toán tỷ lệ: Số ca Approve / Tổng số ca xử lý.
- **Discrepancy Alert:** Cảnh báo nếu Confidence > 90% nhưng tỷ lệ Reject > 30% (Dấu hiệu Prompt bị ảo giác hoặc sai logic).

#### SRS (Software Requirements Specification)

- **Logic:** So sánh trường confidence_score (từ AI) và approval_status (từ con người) trong DB.
- **UI:** Biểu đồ đường (Line Chart) so sánh hai chỉ số này theo thời gian.

#### Workflow

- Monitoring tính toán điểm tự tin trung bình của AI trong ngày.
- Hệ thống đối chiếu với kết quả Approve/Reject thực tế từ người dùng.
- Xuất báo cáo hiệu quả: "AI đang làm tốt ở mảng A nhưng thường bị Reject ở mảng B".

--- -->

<!-- ## 🔹 FEATURE 4: TOKEN ECONOMICS & PERFORMANCE TRACKING

#### Mô tả

- **What:** Báo cáo chi phí và tốc độ xử lý của hệ thống Agent.
- **Why:** AI research Web tiêu tốn rất nhiều Token. Cần chứng minh tính kinh tế để thuyết phục sếp duy trì dự án.

#### FRD (Functional Requirements Document)

- **Cost Tracking:** Quy đổi Token sang tiền tệ (USD/VNĐ) dựa trên giá API OpenAI/Gemini.
- **Latency Monitoring:** Đo thời gian từ lúc quét Ticket đến lúc hoàn thành Research (thời gian Agent "ngâm" web).
- **Efficiency Report:** Thống kê chi phí trung bình để xử lý thành công 1 Ticket.

#### SRS (Software Requirements Specification)

- **Field:** Dữ liệu JSON từ Tool Automation cần gửi lưu thêm vào MongoDB `input_tokens`, `output_tokens`, `latency_ms` cho mỗi lần xử lý ticket.
- **UI:** Dashboard hiển thị "Tổng chi phí tiêu thụ" và "Thời gian xử lý trung bình" cho từng ticket và 1 biểu đồ chỉ số trung bình theo ngày/tuần.

#### Workflow

- Sau mỗi lần Agent chạy, Tool Automation đẩy dữ liệu Token vào MongoDB.
- Monitoring System tổng hợp theo ngày/tuần.
- Người quản lý theo dõi để điều chỉnh độ dài Prompt hoặc giới hạn phạm vi Research Web nhằm tiết kiệm chi phí.

--- -->

## 5. Communication Checklist
Để triển khai, cần thống nhất với team Tool Automation:

1. **Về Database: "Dùng DB gì? Có thể dùng chung một con MongoDB Atlas trên Cloud để tool của tôi có thể đọc log và thống kê realtime được không?"**

2. **Về Cấu trúc Log: "Trong Schema Ticket, có thể tạo thêm một mảng logs hoặc steps để ghi lại trạng thái xử lý của tool ở từng bước (Input -> Extract -> Wiki -> Email) không?"**
   ```json
   [
     { "step": "extract", "status": "success", "duration": 120 }
   ]

3. **Về Metadata LLM: "Khi nhận kết quả từ LLM, có lưu lại số lượng Token tiêu tốn và kết quả thô (raw response) của AI vào DB không? Tôi cần để làm báo cáo hiệu suất."**

4. **Về Prompt: "Ông đang để Prompt cứng trong code hay lưu trong DB? Nếu tôi muốn thử nghiệm các bộ Prompt khác nhau để tối ưu độ chính xác thì ông có chỗ nào để tôi cấu hình không?"**

