# Flow: Kết nối Google Drive với Website (OAuth 2.0)

## Mục tiêu

Cho phép người dùng kết nối tài khoản Google Drive của họ với website chỉ bằng vài thao tác. Người dùng không cần tạo API Key, OAuth Client, Service Account hoặc cấu hình Google Cloud. Mọi cấu hình Google Cloud đều do nhà phát triển chuẩn bị trước.

---

## Luồng người dùng

### Bước 1: Người dùng mở trang tích hợp

Trong phần **Settings → Integrations → Google Drive**, hiển thị:

* Logo Google Drive
* Trạng thái:

  * Chưa kết nối
  * Đang kết nối
  * Đã kết nối
  * Lỗi kết nối
* Nút **Connect Google Drive**

---

### Bước 2: Người dùng nhấn "Connect Google Drive"

Frontend gọi API backend:

```
GET /api/integrations/google-drive/connect
```

Backend tạo OAuth URL bằng Google OAuth 2.0 với:

* client_id
* redirect_uri
* scope
* state
* access_type=offline
* prompt=consent (chỉ lần đầu nếu cần refresh token)

Backend trả về:

```
{
    "url": "https://accounts.google.com/..."
}
```

Frontend chuyển hướng trình duyệt sang URL này.

---

### Bước 3: Google xác thực

Google thực hiện:

* Nếu chưa đăng nhập → yêu cầu đăng nhập.
* Nếu đã đăng nhập → bỏ qua bước này.
* Hiển thị màn hình xin quyền.

Ví dụ quyền:

* Xem file Google Drive
* Upload file
* Đọc metadata

Người dùng nhấn:

**Allow**

---

### Bước 4: Google Redirect

Google redirect về:

```
GET /api/integrations/google-drive/callback?code=xxxx&state=xxxx
```

---

### Bước 5: Backend đổi Authorization Code

Backend gửi request đến Google:

```
Authorization Code
        ↓
Access Token
Refresh Token
Expiration Time
```

Backend xác thực state để chống CSRF.

---

### Bước 6: Lưu thông tin

Backend lưu vào database:

GoogleIntegration

```
userId
provider = "google_drive"

googleUserId

email

displayName

picture

accessToken

refreshToken

expiresAt

connectedAt

status = connected
```

Refresh Token phải được mã hóa trước khi lưu.

Không trả token về frontend.

---

### Bước 7: Đồng bộ thông tin

Backend có thể gọi:

```
Drive API
```

để lấy:

* Root folder
* Danh sách thư mục
* Dung lượng còn lại
* Email tài khoản

Lưu cache nếu cần.

---

### Bước 8: Hoàn tất

Redirect người dùng về:

```
Settings → Integrations
```

Hiển thị:

✅ Connected

Email Google

Avatar

Ngày kết nối

Nút:

* Disconnect
* Reconnect
* Sync Now

---

# Sau khi kết nối

Mọi request cần Google Drive đều sử dụng token đã lưu.

Nếu Access Token hết hạn:

```
Refresh Token
        ↓
Google OAuth
        ↓
New Access Token
```

Việc refresh diễn ra tự động.

Người dùng không phải đăng nhập lại.

---

# Khi người dùng ngắt kết nối

Frontend:

```
Disconnect
```

↓

Backend:

* Xóa Access Token
* Xóa Refresh Token
* Đánh dấu trạng thái disconnected

Không xóa dữ liệu nội bộ nếu không được yêu cầu.

---

# Xử lý lỗi

Nếu người dùng từ chối cấp quyền:

```
Status = cancelled
```

Hiển thị:

"Google Drive was not connected."

---

Nếu Refresh Token hết hạn:

```
Status = expired
```

Hiển thị nút:

Reconnect

---

Nếu Google API trả lỗi:

Retry theo exponential backoff.

---

# Yêu cầu UI

Trang Integration cần hiển thị:

* Google Drive Card
* Logo Google Drive
* Trạng thái kết nối
* Email tài khoản
* Avatar
* Nút Connect
* Nút Disconnect
* Nút Sync
* Thời gian đồng bộ gần nhất
* Thanh tiến trình khi đang kết nối

---

# Yêu cầu bảo mật

* Không lưu Access Token ở Local Storage.
* Không gửi Refresh Token xuống frontend.
* Mã hóa Refresh Token trong database.
* Kiểm tra OAuth state để chống CSRF.
* Chỉ yêu cầu các scope tối thiểu cần thiết.
* Tự động refresh Access Token khi hết hạn.
* Cho phép người dùng ngắt kết nối bất cứ lúc nào.

---

# Trải nghiệm người dùng

Người dùng chỉ cần:

1. Nhấn **Connect Google Drive**.
2. Đăng nhập Google (nếu cần).
3. Nhấn **Allow**.
4. Quay lại website.

Toàn bộ quá trình cấu hình OAuth, quản lý token và làm mới phiên đều được backend xử lý tự động, giúp trải nghiệm kết nối đơn giản và gần như chỉ cần một lần cấp quyền.
