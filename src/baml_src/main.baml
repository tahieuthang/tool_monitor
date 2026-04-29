// 1. Định nghĩa các thực thể (Mô hình dữ liệu)

enum TicketAction {
  ENROLL
  UNCOMPLETE
  WITHDRAW
  OTHER
}

class Student {
  name string
  phone string
}

class CS_Person {
  id string
  name string
  email string
}

class SupportTicket {
  id string
  title string
  action TicketAction
  description string
  branch string
  class_id string
  student Student
  sender CS_Person
  priority string
  status string
  createdAt string
}

// 2. Định nghĩa hàm bóc tách
function ExtractMindXTicket(raw_text: string) -> SupportTicket {
  client "openai/gpt-4o" // Hoặc gemini-1.5-pro tùy ông giáo setup key
  prompt #"
    Phân tích đoạn chat/ticket hỗ trợ sau đây từ hệ thống Odoo của MindX.
    Trích xuất thông tin chính xác vào định dạng yêu cầu.
    
    LƯU Ý: 
    - Nếu tên/sđt/email khách hàng hiển thị ở cột bên trái, hãy gán vào phần 'sender' (CS).
    - Thông tin học viên trong nội dung chính hãy gán vào phần 'student'.

    TICKET RAW:
    ---
    {{ raw_text }}
    ---
  "#
}