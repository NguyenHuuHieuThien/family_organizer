# Flow: Kết nối Google Drive + Chọn thư mục bằng Google Picker API

## Mục tiêu

Cho phép người dùng:

* Kết nối tài khoản Google Drive chỉ một lần.
* Tự chọn thư mục lưu dữ liệu trong Google Drive.
* Website ghi nhớ thư mục đã chọn.
* Mọi lần upload sau đều tự động lưu vào đúng thư mục đó.
* Người dùng có thể đổi thư mục bất cứ lúc nào.

---

# Kiến trúc

```text
Frontend
    │
    ├──────── OAuth ────────► Backend
    │                           │
    │                           ▼
    │                     Google OAuth
    │                           │
    │◄──────── Access Token ─────┘
    │
    ├──────── Google Picker API
    │
    ▼
Người dùng chọn thư mục
    │
    ▼
Frontend nhận Folder ID
    │
    ▼
Backend lưu Folder ID
    │
    ▼
Google Drive API
```

---

# Bước 1 - Người dùng nhấn "Connect Google Drive"

Trang Settings hiển thị:

```text
Google Drive

Chưa kết nối

[ Connect Google Drive ]
```

Frontend gọi:

```http
GET /api/google/connect
```

---

# Bước 2 - Backend tạo OAuth URL

Backend đọc cấu hình:

* GOOGLE_CLIENT_ID
* GOOGLE_CLIENT_SECRET
* GOOGLE_REDIRECT_URI

Backend khai báo scope:

```text
openid
email
profile
https://www.googleapis.com/auth/drive.file
```

Backend sinh:

* state
* PKCE (nếu áp dụng)

Tạo OAuth URL.

Trả về:

```json
{
    "url":"https://accounts.google.com/..."
}
```

---

# Bước 3 - Người dùng đăng nhập Google

Google hiển thị:

* Đăng nhập
* Chọn tài khoản
* Xin quyền

Người dùng nhấn:

Allow

---

# Bước 4 - Google Callback

Google redirect:

```http
GET /api/google/callback
```

Backend nhận:

* authorization code
* state

---

# Bước 5 - Backend đổi Token

Google trả:

```text
Access Token

Refresh Token

Expires In

ID Token
```

Backend:

* xác thực state
* lưu Refresh Token (đã mã hóa)
* lưu Access Token
* lấy thông tin tài khoản Google

Lưu vào database:

```text
GoogleIntegration

userId

googleUserId

email

displayName

picture

accessToken

refreshToken

expiresAt
```

Sau đó backend redirect:

```text
/settings/integrations/google-drive
```

---

# Bước 6 - Frontend hiển thị

```text
Google Drive

Đã kết nối

Email

abc@gmail.com

Chưa chọn thư mục

[ Chọn thư mục ]
```

---

# Bước 7 - Người dùng nhấn "Chọn thư mục"

Frontend gọi backend:

```http
GET /api/google/picker-token
```

Backend:

* kiểm tra Access Token
* nếu hết hạn

↓

dùng Refresh Token

↓

lấy Access Token mới

↓

trả về:

```json
{
    "accessToken":"...",
    "clientId":"..."
}
```

---

# Bước 8 - Mở Google Picker

Frontend khởi tạo Google Picker.

Picker sử dụng:

* OAuth Access Token
* Google API Key (Browser key)
* OAuth Client ID

Picker mở cửa sổ Google Drive.

Người dùng có thể:

* mở thư mục
* tìm kiếm
* tạo thư mục mới (nếu bật)
* chọn thư mục muốn lưu

---

# Bước 9 - Người dùng chọn thư mục

Google Picker trả về:

```json
{
    "id":"1AbCdEfGhIjKlMn",
    "name":"Invoices",
    "mimeType":"application/vnd.google-apps.folder"
}
```

Frontend gửi backend:

```http
POST /api/google/folder
```

Body:

```json
{
    "folderId":"1AbCdEfGhIjKlMn",
    "folderName":"Invoices"
}
```

---

# Bước 10 - Backend xác minh Folder

Để tránh giả mạo Folder ID:

Backend gọi:

Drive API

```text
files.get(folderId)
```

Kiểm tra:

* tồn tại
* là Folder
* user có quyền ghi

Nếu hợp lệ

↓

lưu database.

```text
folderId

folderName

selectedAt
```

---

# Bước 11 - Hoàn tất

Frontend hiển thị

```text
Google Drive

Đã kết nối

abc@gmail.com

📁 Invoices

Đã chọn

[ Đổi thư mục ]

[ Đồng bộ ]

[ Ngắt kết nối ]
```

---

# Upload File

Người dùng upload ảnh.

Frontend:

```http
POST /api/upload
```

Backend:

đọc

```text
folderId
```

Upload:

```text
Drive API

parents:

[
    folderId
]
```

↓

File xuất hiện trong đúng thư mục người dùng đã chọn.

---

# Đổi thư mục

Người dùng nhấn

```text
Đổi thư mục
```

↓

Mở lại Google Picker

↓

Chọn thư mục mới

↓

Cập nhật folderId.

Không cần OAuth lại.

---

# Ngắt kết nối

Người dùng nhấn:

Disconnect

Backend:

* xóa Access Token
* xóa Refresh Token
* xóa Folder ID
* trạng thái disconnected

---

# Xử lý Token

Access Token hết hạn

↓

Backend tự động

```text
Refresh Token

↓

Google OAuth

↓

New Access Token
```

Frontend không biết Refresh Token.

---

# API Backend

```text
GET    /api/google/connect
GET    /api/google/callback
GET    /api/google/picker-token
POST   /api/google/folder
POST   /api/google/upload
DELETE /api/google/disconnect
```

---

# Database

GoogleIntegration

```text
id

userId

googleUserId

email

displayName

picture

accessToken

refreshToken (encrypted)

expiresAt

folderId

folderName

connected

connectedAt

updatedAt
```

---

# Trải nghiệm người dùng

Người dùng chỉ cần thực hiện một lần:

1. Nhấn **Connect Google Drive**.
2. Đăng nhập Google và cấp quyền.
3. Nhấn **Chọn thư mục**.
4. Chọn thư mục mong muốn trong Google Picker.
5. Hoàn tất.

Sau đó, mọi file do website tạo sẽ tự động được lưu vào đúng thư mục đã chọn. Người dùng không cần kết nối lại hay chọn lại thư mục ở mỗi lần tải lên, nhưng vẫn có thể thay đổi thư mục bất cứ lúc nào bằng cách mở lại Google Picker.
