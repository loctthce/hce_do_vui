# Du an 19 - Kahoot-style quiz MVP

MVP quiz realtime cho Dự án 19, dùng Next.js, Supabase và deploy trên Vercel.

## Tính năng chính
- Quản trị tạo quiz với câu hỏi Đúng/Sai hoặc lựa chọn nhiều đáp án
- Tạo phòng chơi, cho người dùng join bằng mã phòng
- Chấm điểm theo tốc độ và đáp án đúng
- Hiển thị người thắng sau từng câu và bảng xếp hạng cuối

## Chạy local
1. Cài dependencies: `npm install`
2. Tạo file `.env.local` với các biến Supabase
3. Chạy: `npm run dev`

## Biến môi trường
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

## Supabase
Chạy schema ở `supabase/schema.sql` để tạo bảng và policy cơ bản.
Nếu muốn realtime hoạt động tốt trên màn phòng chơi, hãy bật Realtime cho các bảng `rooms`, `room_players` và `player_answers` trong Supabase.

Nếu database đã được tạo từ schema cũ, cần thêm cột owner phòng:

```sql
alter table rooms add column if not exists host_user_id uuid;
```

## Quyền quản trị
- Tạo user quản trị trong Supabase Auth (email/password).
- Thêm bản ghi vào bảng `profiles` với `user_id` là auth user id và `role = 'admin'`.
- Đăng nhập ở trang `/admin/login`. Server lưu phiên bằng cookie HttpOnly và kiểm tra role admin ở mỗi request quản trị.
- Mỗi phòng lưu `host_user_id`, chỉ chủ phòng mới có quyền bấm start/reveal/next/finish cho phòng đó.
- Phiên admin tự refresh trên server bằng refresh token; khi phiên hết hạn, hệ thống tự xóa cookie và yêu cầu đăng nhập lại.
- Các API ghi dữ liệu quản trị (`/api/admin/quizzes`, `/api/rooms`, `/api/rooms/[roomCode]/state`) yêu cầu CSRF header khớp với CSRF cookie.
- Middleware bảo vệ route `/admin/*` (trừ `/admin/login`) và redirect sớm về trang đăng nhập nếu thiếu session cookie.

## Deploy Vercel
- Import repo lên Vercel
- Set Environment Variables trên Vercel cho cả Preview + Production:
	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
	- `SUPABASE_SERVICE_ROLE_KEY`
	- `NEXT_PUBLIC_APP_URL` (URL domain deploy, ví dụ `https://your-app.vercel.app`)
- Dùng schema Supabase đã cung cấp
- Sau khi deploy, đăng nhập admin lại để tạo cookie phiên trên đúng domain Vercel.
