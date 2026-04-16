# SocialNet

Mạng xã hội mini với bảng tin cá nhân hóa, khám phá bài viết, bookmark, thông báo real-time, upload ảnh và avatar, cùng quyền riêng tư bài đăng `public / friend / private`.

## Tính năng chính

- Đăng ký, đăng nhập, refresh token bằng JWT.
- Tạo, sửa, xóa bài viết.
- Upload ảnh cho bài viết và ảnh đại diện từ file.
- Chọn quyền bài đăng: `public`, `friend`, `private`.
- Thích, bình luận, follow / unfollow.
- Bookmark bài viết.
- Tìm kiếm bài viết và người dùng.
- Trang cá nhân với thống kê followers, following, posts.
- Thông báo real-time khi có like, comment, follow.
- Dark mode, responsive mobile, infinite scroll, toast, skeleton loading.

## Cấu trúc dự án

```text
/
├── backend/
│   ├── index.js
│   ├── db.js
│   ├── jwt.js
│   ├── bcrypt.js
│   ├── src/
│   │   ├── controllers/
│   │   ├── repositories/
│   │   ├── services/
│   │   └── routes/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── features/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   └── services/
│   └── package.json
└── vercel.json
```

## Chạy local

### 1. Cài dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Tạo file `.env` ở root project

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
SECRET_KEY=your-super-secret-key-at-least-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### 3. Tạo file `frontend/.env` nếu muốn override API

```env
VITE_API_BASE_URL=http://localhost:3001/api/v1
```

Nếu không khai báo, frontend sẽ tự dùng mặc định `http://localhost:3001/api/v1`.

### 4. Chạy backend và frontend

Backend mặc định chạy từ `3001`. Nếu cổng đang bận, server sẽ tự thử cổng kế tiếp.

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

## API chính

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`

### Users

- `GET /api/v1/users/me`
- `PUT /api/v1/users/me`
- `DELETE /api/v1/users/me`
- `GET /api/v1/users/{id}`
- `GET /api/v1/users/{id}/profile`
- `GET /api/v1/users/{id}/posts/`
- `GET /api/v1/users/search?q=`
- `POST /api/v1/users/me/change-password`

### Posts

- `GET /api/v1/posts/feed`
- `GET /api/v1/posts/explore`
- `GET /api/v1/posts/search?q=`
- `GET /api/v1/posts/{id}`
- `POST /api/v1/posts/`
- `PUT /api/v1/posts/{id}`
- `DELETE /api/v1/posts/{id}`

### Interactions

- `GET /api/v1/posts/{id}/comments/`
- `POST /api/v1/posts/{id}/comments/`
- `POST /api/v1/likes/posts/{id}/like/`
- `DELETE /api/v1/likes/posts/{id}/like/`
- `GET /api/v1/likes/posts/{id}/status/`

### Social, bookmarks, notifications

- `POST /api/v1/follows/users/{id}/follow/`
- `DELETE /api/v1/follows/users/{id}/follow/`
- `GET /api/v1/follows/users/{id}/followers/`
- `GET /api/v1/follows/users/{id}/following/`
- `GET /api/v1/bookmarks/`
- `POST /api/v1/bookmarks/posts/{id}/`
- `DELETE /api/v1/bookmarks/posts/{id}/`
- `GET /api/v1/notifications/`
- `GET /api/v1/notifications/unread-count`
- `PUT /api/v1/notifications/{id}/read`
- `PUT /api/v1/notifications/read-all`

## Môi trường triển khai

- Backend đọc `DATABASE_URL`, `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Frontend đọc `VITE_API_BASE_URL`.
- Upload file được phục vụ qua `/uploads` từ backend.

## Công nghệ

- Backend: Node.js, Express, PostgreSQL, JWT, bcryptjs, multer.
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Query, React Router.

## Ghi chú

- Bài viết mới và bài viết chỉnh sửa đều hỗ trợ ảnh, topics và quyền riêng tư.
- Danh sách bookmark, feed, search, profile và post detail đều hiển thị avatar người dùng.
- UI dùng cursor-based infinite scroll cho các danh sách dài.
