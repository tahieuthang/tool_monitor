# ĐÁNH GIÁ GIẢI PHÁP KỸ THUẬT - AUTOMATION TOOL

## 1. Luồng thực tế của Automation Tool
**Luồng bạn mô tả:** *"phân tích + summary ticket -> lấy wiki -> đưa vào prompt để tìm root cause"*
**Đánh giá:** Đúng về mặt intent, nhưng sai về cơ chế thực thi. Dưới đây là sự thật chi tiết từ code:

**Luồng thực tế (đọc từ source):**
```
- **BƯỚC 1 - Build Prompt (prompt.ts, chạy trong Node.js)**
  + Đọc `runbook-auto.md` (rules phân loại)
  + Fetch Wiki page "template-description" -> lấy bảng MÔ TẢ các template (getWikiPage("template-description") -> Azure DevOps API -> Wiki section 5.5). Nội dung: bảng { tên file.html -> mô tả ngắn dùng khi nào }
  + Build skill manifest (chỉ tên + description của từng SKILL.md, không phải nội dung đầy đủ)
- **BƯỚC 2 - Assemble final prompt string (agent-cli.ts)**
  + = systemPrompt (runbook + template descriptions + skill manifest) + "...\nClassify the following ticket content...\n" + ticket content (ticketId, ticketName, crmIds, content) - cắt tối đa 4000 ký tự
- **BƯỚC 3 - Spawn headless agent CLI (execFile)**
  + Agent CLI (Cursor/Codex) NHẬN prompt này và TỰ:
    * ĐỌC `tags_registry.txt` từ filesystem
    * Có thể đọc thêm `SKILL.md` nếu cần (allocation skill...)
    * Chạy `pnpm allocation --lead-id <id>` nếu needsAllocation
    * Output JSON: `{needsAllocation, templateName, confidence, summary, trendTags}`
- **BƯỚC 4 - Parse JSON output** -> analyzeNode trả về newState
```

### Điểm sai trong hiểu của bạn
| Điều bạn nghĩ | Thực tế |
| :--- | :--- |
| "AI phân tích ticket -> lấy wiki -> đưa vào prompt" | Không phải. **Wiki (template-description) được fetch TRƯỚC** khi spawn agent, bởi `prompt.ts` chạy trong Node.js — không phải bởi AI. Nó được nhúng cứng vào system prompt |
| "AI tìm ra root cause rồi mới query wiki" | Không. AI nhận **toàn bộ bảng mô tả template** trong prompt từ đầu, rồi dùng nó để đối chiếu với nội dung ticket và chọn template |
| "AI nghiên cứu Wiki trực tiếp trên Web" | **Đúng một phần** — agent CLI có thể gọi `pnpm wiki query` để đọc thêm Wiki page, nhưng với headless mode, nó chủ yếu dùng dữ liệu đã có trong prompt. Đây là thiết kế "cung cấp trước, không tìm kiếm" |

---

## 2. Đánh giá ý tưởng "tool ngách" của bạn
**Ý tưởng:** Làm 1 tool nhỏ chạy **trước bước analyze**, dùng nội dung ticket để tìm ra **vùng Wiki phù hợp nhất** -> chỉ gửi đúng phần Wiki liên quan cho AI thay vì toàn bộ.
**Đánh giá:** Ý tưởng RẤT TỐT và có cơ sở kỹ thuật rõ ràng, nhưng cần hiểu đúng vấn đề cần giải quyết:

**Vấn đề thực sự cần giải quyết:**
Hiện tại AI nhận được **bảng mô tả template** (~13 entries, mỗi entry 1-2 câu). Đây là dữ liệu rất nhỏ, không phải toàn bộ Wiki. **Vấn đề không phải là quá nhiều thông tin template.**
Vấn đề thực sự là: khi ticket phức tạp, **mô tả template ngắn không đủ context để AI phân biệt** giữa các template gần nhau. Ví dụ:
- `allocation.html` vs `pay-not-full.html` — cả 2 đều liên quan đến enrollment, nhưng điều kiện khác nhau (`remaining <= 0` vs `remaining > 0`)
- `no-payment-date.html` vs `make-order-failed.html` — đều có từ "payment"

**Giải pháp đề xuất (phù hợp nhất với kiến trúc hiện tại):**
1. **Ticket content (raw)** -> **[TOOL NGÁCH - Pre-filter Layer]**
2. Tool ngách nhận ticket content.
3. Dùng embedding hoặc keyword matching để score từng template.
4. Chọn **top 3-5 template candidates** có score cao nhất.
5. **Fetch full Wiki page** của các template đó (không phải chỉ mô tả ngắn).
6. Gửi cho **analyzeNode**: Ticket content + Top N template candidates + full Wiki content của chúng.
7. Loại bỏ các template không liên quan khỏi prompt.

### Ưu điểm thực tế
- **Giảm noise trong prompt:** AI không bị xao nhãng bởi 13 template không liên quan khi ticket chỉ liên quan đến 1-2 loại.
- **Cung cấp đủ context:** Thay vì mô tả 1-2 câu, AI có full Wiki page với điều kiện chi tiết -> phân biệt chính xác hơn.
- **Tăng confidence:** Ít lựa chọn + context đầy đủ hơn -> AI ít hallucinate hơn, confidence cao hơn.
- **Không cần thay đổi lớn:** Tool ngách chỉ cần chèn vào giữa `crawlNode` và `analyzeNode`, không đụng đến kiến trúc LangGraph.

### Hạn chế cần lưu ý
- **Pre-filter sai -> miss đúng template:** Nếu tool ngách lọc nhầm, AI sẽ không bao giờ chọn được nó. Cần ngưỡng "safe" (top 5, không phải top 2).
- **Thêm latency:** Mỗi ticket cần thêm 1 bước fetch Wiki -> tăng thời gian xử lý.
- **Hiện tại dataset template nhỏ (13 entries):** Lợi ích lớn hơn khi số template tăng lên 30-50+.

---

## Kiến trúc đề xuất cho tool ngách
- **Input:** `ticket content (string)`
- **Output:** `{ relevantTemplates: [{name, description, wikiContent}], filteredOut: [...] }`

**Kỹ thuật có thể dùng:**
- **Option A (Đơn giản):** Keyword matching từ `runbook-auto.md`.
- **Option B (Tốt hơn):** Embedding similarity (Cosine similarity).
- **Option C (Mạnh nhất):** Dùng LLM nhẹ (gpt-4o-mini hoặc Gemini Flash). Gọi API trực tiếp (không spawn CLI): *"Từ ticket này, những template nào CÓ KHẢ NĂNG áp dụng? Trả về top 3 tên file."* -> Nhanh (<1s), rẻ, chính xác.

**Tóm lại:** Ý tưởng của bạn có cơ sở kỹ thuật tốt. Vấn đề không phải là "quá nhiều wiki" mà là **thiếu context chi tiết về từng template**. Tool ngách nên làm 2 việc: (1) lọc ra top N candidates và (2) fetch full Wiki content của chúng để enriched prompt.