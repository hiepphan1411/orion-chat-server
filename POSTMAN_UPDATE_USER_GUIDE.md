# Update User Profile API - Postman Guide

## Endpoint

```
PATCH http://localhost:3000/users/profile
```

## Authentication

Cần JWT token trong request header:

```
Authorization: Bearer <your_jwt_token>
```

## Request Format

### Method 1: Update chỉ thông tin text (không có hình ảnh)

**Body Type:** JSON (raw)

```json
{
  "fullName": "New Full Name",
  "gender": "male",
  "birthDate": "1990-01-15",
  "email": "newemail@example.com"
}
```

### Method 2: Update với hình ảnh avatar

**Body Type:** form-data

| Key       | Type | Value                |
| --------- | ---- | -------------------- |
| fullName  | text | New Full Name        |
| gender    | text | male                 |
| birthDate | text | 1990-01-15           |
| email     | text | newemail@example.com |
| avatar    | file | [chọn file hình ảnh] |

### Method 3: Update với hình ảnh cover

**Body Type:** form-data

| Key        | Type | Value                |
| ---------- | ---- | -------------------- |
| fullName   | text | New Full Name        |
| coverImage | file | [chọn file hình ảnh] |

### Method 4: Update với cả avatar và cover

**Body Type:** form-data

| Key       | Type | Value                |
| --------- | ---- | -------------------- |
| fullName  | text | New Full Name        |
| gender    | text | male                 |
| birthDate | text | 1990-01-15           |
| email     | text | newemail@example.com |
| avatar    | file | [chọn file avatar]   |
| cover     | file | [chọn file cover]    |

## Success Response (200 OK)

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phoneNumber": "0900000001",
    "fullName": "New Full Name",
    "email": "newemail@example.com",
    "gender": "male",
    "birthDate": "1990-01-15T00:00:00.000Z",
    "avatarUrl": "/uploads/avatars/avatar_550e8400-e29b-41d4-a716-446655440000_1712282400000.jpg",
    "coverImage": "/uploads/covers/cover_550e8400-e29b-41d4-a716-446655440000_1712282400000.jpg",
    "isOnline": false,
    "showOnlineStatus": true,
    "isActive": true,
    "createdAt": "2026-01-15T10:30:00.000Z",
    "lastLoginAt": "2026-04-05T09:15:00.000Z"
  },
  "timestamp": "2026-04-05T12:00:00.000Z"
}
```

## Error Responses

### 400 Bad Request - Email đã tồn tại

```json
{
  "statusCode": 400,
  "message": "Email already exists",
  "error": "Bad Request"
}
```

### 400 Bad Request - File không hợp lệ

```json
{
  "statusCode": 400,
  "message": "Only image files are allowed",
  "error": "Bad Request"
}
```

### 401 Unauthorized - Token không hợp lệ

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 404 Not Found - User không tồn tại

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

## Hạn chế File Upload

- **Định dạng cho phép:** JPEG, PNG, GIF, WebP
- **Kích thước tối đa:** 5MB per file
- **Field names:** `avatar` hoặc `cover`

## Ví dụ cURL

### Update chỉ text:

```bash
curl -X PATCH http://localhost:3000/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "New Name",
    "gender": "female",
    "email": "new@example.com"
  }'
```

### Update với avatar:

```bash
curl -X PATCH http://localhost:3000/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "fullName=New Name" \
  -F "avatar=@/path/to/avatar.jpg"
```

## Database Schema - User Entity

```
- userId (UUID, primary key)
- phoneNumber (string, unique)
- passwordHash (string)
- fullName (string) ✏️ có thể update
- gender (string, nullable) ✏️ có thể update
- birthDate (date, nullable) ✏️ có thể update
- email (string, unique, nullable) ✏️ có thể update
- avatarUrl (string, nullable) ✏️ có thể update với file upload
- coverImage (string, nullable) ✏️ có thể update với file upload
- isOnline (boolean, default false)
- showOnlineStatus (boolean, default true)
- isActive (boolean, default true)
- currentSessionToken (string, nullable)
- lastLoginAt (date, nullable)
- lastActivityAt (bigint, nullable)
- createdAt (date, auto)
```

## Notes

- Hình ảnh được lưu vào thư mục `uploads/avatars/` và `uploads/covers/`
- URLs trả về có format `/uploads/avatars/{filename}` và `/uploads/covers/{filename}`
- Để production, nên upload lên S3, CloudFront hoặc CDN khác
- Email phải unique và có định dạng hợp lệ
- BirthDate phải ở format ISO 8601 (YYYY-MM-DD)
