# SocialNet — Mạng xã hội

Ứng dụng mạng xã hội với bảng tin cá nhân, khám phá bài viết, tương tác và thông báo real-time.

## Tính năng

### Người dùng
- [x] Đăng ký / Đăng nhập (JWT access + refresh token)
- [x] Tạo bài viết với hashtag (topics)
- [x] Thích và bình luận bài viết
- [x] Follow / Unfollow người dùng
- [x] Bookmark bài viết để lưu lại
- [x] Tìm kiếm bài viết và người dùng
- [x] Trang cá nhân với thống kê (posts, followers, following)
- [x] Chỉnh sửa thông tin cá nhân (username, ngày sinh)
- [x] Đổi mật khẩu / Xóa tài khoản
- [x] Thông báo khi có like, comment, follow mới
- [x] Preferences: chọn topics yêu thích để cá nhân hóa bảng tin

### Giao diện
- [x] Dark mode / Light mode
- [x] Responsive mobile (bottom nav)
- [x] Loading skeletons thay spinner
- [x] Infinite scroll cho tất cả danh sách (Feed, Explore, Notifications, Bookmarks)
- [x] Toast notifications
- [x] Infinite scroll cursor-based

### Backend
- [x] PostgreSQL (Vercel Postgres) — schema tự động khởi tạo
- [x] JWT authentication với access + refresh token
- [x] Input validation: username, email, content, comment length
- [x] XSS sanitization
- [x] Rate limiting (chống spam bài viết/comment)
- [x] CORS, HTTP security headers
- [x] 10 topics mặc định (Thể thao, Công nghệ, Game, ...)

## Kiến trúc

```
/
├── backend/              # Vercel Serverless API (Node.js)
│   ├── index.js          # Tất cả API routes (GET/POST/PUT/DELETE handlers)
│   ├── db.js             # Schema + Vercel Postgres client
│   ├── jwt.js
│   ├── bcrypt.js
│   └── package.json
│
├── frontend/             # React + Vite + TypeScript
│   ├── src/
│   │   ├── features/     # Pages theo domain
│   │   │   ├── auth/          # LoginPage, RegisterPage
│   │   │   ├── feed/          # FeedPage, CreatePostForm, PostCard
│   │   │   ├── explore/       # ExplorePage (topic filter)
│   │   │   ├── posts/         # PostDetailPage, CommentItem
│   │   │   ├── profile/       # ProfilePage (followers/following tabs)
│   │   │   ├── notifications/ # NotificationsPage
│   │   │   ├── bookmarks/     # BookmarksPage
│   │   │   ├── search/       # SearchPage (posts + users)
│   │   │   └── settings/     # SettingsPage
│   │   ├── components/
│   │   │   ├── layout/       # Navbar, Sidebar, BottomNav, MainLayout
│   │   │   └── ui/           # Avatar, TopicBadge, TopicSelector, Skeleton, Toast, NotificationBell
│   │   ├── context/          # AuthContext, ThemeContext, ToastContext
│   │   ├── hooks/            # useInfiniteScroll, useRefreshToken
│   │   └── services/        # API client + typed endpoints
│   └── package.json
│
└── vercel.json           # Vercel routing: /api/* → backend, /* → frontend
```

## Cài đặt

### 1. Clone và cài dependencies

```bash
cd Social-Network-API
cd backend && npm install
cd ../frontend && npm install
```

### 2. Cấu hình biến môi trường

**Root project** (`./.env.example` → `./.env`):

```env
# ── Backend ──
# Lấy từ Vercel Dashboard → Storage → Postgres → Connection string
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Secret key để sign JWT (≥32 ký tự ngẫu nhiên)
SECRET_KEY=your-super-secret-key-at-least-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ── Frontend ──
# Prefix VITE_ bắt buộc — Vite chỉ đọc biến có prefix này
# Local: http://localhost:3000
# Sau deploy Vercel: https://your-project.vercel.app (không có /api)
VITE_API_BASE_URL=http://localhost:3000
```

**Frontend riêng** (`frontend/.env.example` → `frontend/.env`) — tùy chọn, chỉ cần khi muốn override:

```env
VITE_API_BASE_URL=http://localhost:3000
```

### 3. Chạy local

**Backend** (port 3000):
```bash
cd backend
npm install
npm run dev
```

**Frontend** (port 5173, proxy → backend qua `VITE_API_BASE_URL`):
```bash
cd frontend
npm install
npm run dev
```

> Vite proxy tự động chuyển `/api/*` → `http://localhost:3000` khi chạy dev.

### 4. Deploy lên Vercel

#### 4.1 Tạo PostgreSQL database

1. Vào [vercel.com](https://vercel.com) → **Storage** → **Create Database**
2. Chọn **PostgreSQL** → đặt tên → **Create**
3. Sau khi tạo xong → copy **Connection string** (dạng `postgresql://...`)

#### 4.2 Deploy qua Vercel CLI

```bash
npm i -g vercel
vercel login
vercel
```

Hoặc kết nối **GitHub repo** → Vercel tự nhận `vercel.json` và deploy.

#### 4.3 Thêm Environment Variables trên Vercel Dashboard

Vào project → **Settings** → **Environment Variables**, thêm từng dòng:

| Name | Value | Environments |
|------|-------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` | Production, Preview, Development |
| `SECRET_KEY` | `chuỗi-bí-mật-của-bạn` | Production, Preview, Development |
| `ALGORITHM` | `HS256` | Production, Preview, Development |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Production, Preview, Development |

> **Lưu ý:** `DATABASE_URL` lấy từ bước 4.1 (Storage → Postgres → Connection string).
> `SECRET_KEY` nên là chuỗi ngẫu nhiên ≥32 ký tự.

#### 4.4 Cấu hình frontend production URL

Sau khi deploy lần đầu, Vercel sẽ cho URL dạng `https://your-project.vercel.app`.
Vào **Settings** → **Environment Variables** thêm:

| Name | Value | Environments |
|------|-------|-------------|
| `VITE_API_BASE_URL` | `https://your-project.vercel.app` | Production |

> **Không** có `/api` ở cuối! Vì routing của `vercel.json` đã tự động redirect `/api/*` sang backend.

## API Reference

### Auth
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/v1/auth/register` | Đăng ký |
| POST | `/api/v1/auth/login` | Đăng nhập → nhận access + refresh token |

### Users
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/v1/users/me` | Lấy thông tin user hiện tại |
| PUT | `/api/v1/users/me` | Cập nhật profile |
| DELETE | `/api/v1/users/me` | Xóa tài khoản |
| GET | `/api/v1/users/{id}` | Lấy user theo ID |
| GET | `/api/v1/users/{id}/profile` | Profile + thống kê |
| GET | `/api/v1/users/{id}/posts/` | Bài viết của user |
| GET | `/api/v1/users/search?q=` | Tìm kiếm users |
| POST | `/api/v1/users/me/change-password` | Đổi mật khẩu |

### Posts
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/v1/posts/feed` | Bảng tin (có score theo follow + preferences) |
| GET | `/api/v1/posts/explore` | Khám phá (lọc theo topic) |
| GET | `/api/v1/posts/search?q=` | Tìm kiếm bài viết |
| GET | `/api/v1/posts/{id}` | Chi tiết bài viết |
| POST | `/api/v1/posts/` | Tạo bài viết |
| PUT | `/api/v1/posts/{id}` | Chỉnh sửa bài viết |
| DELETE | `/api/v1/posts/{id}` | Xóa bài viết |

### Topics
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/v1/topics/` | Danh sách topics |

### Interactions
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/v1/posts/{id}/comments/` | Bình luận |
| POST | `/api/v1/posts/{id}/comments/` | Bình luận |
| POST | `/api/v1/likes/posts/{id}/like/` | Thích |
| DELETE | `/api/v1/likes/posts/{id}/like/` | Bỏ thích |
| GET | `/api/v1/likes/posts/{id}/status/` | Trạng thái thích |

### Social
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/v1/follows/users/{id}/follow/` | Follow |
| DELETE | `/api/v1/follows/users/{id}/follow/` | Unfollow |
| GET | `/api/v1/follows/users/{id}/followers/` | Danh sách followers |
| GET | `/api/v1/follows/users/{id}/following/` | Danh sách following |

### Notifications
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/v1/notifications/` | Danh sách thông báo |
| GET | `/api/v1/notifications/unread-count` | Số thông báo chưa đọc |
| PUT | `/api/v1/notifications/{id}/read` | Đánh dấu đã đọc |
| PUT | `/api/v1/notifications/read-all` | Đánh dấu tất cả đã đọc |

### Bookmarks
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/v1/bookmarks/` | Danh sách bookmark |
| POST | `/api/v1/bookmarks/posts/{id}/` | Bookmark bài viết |
| DELETE | `/api/v1/bookmarks/posts/{id}/` | Bỏ bookmark |

### Preferences
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/v1/preferences/users/me/preferences` | Lấy topics yêu thích |
| PUT | `/api/v1/preferences/users/me/preferences` | Cập nhật topics yêu thích |

## Công nghệ sử dụng

### Backend
- **Runtime**: Node.js (Vercel Serverless)
- **Database**: PostgreSQL via `@vercel/postgres`
- **Auth**: JWT (access token 30p + refresh token 7 days)
- **Hash**: bcryptjs

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **State/Routing**: React Router v6 + React Query v5
- **Icons**: Emoji (không cần thư viện icon)

## Các bước tiếp theo có thể thêm

- [ ] Upload ảnh bài viết + avatar (AWS S3 presigned URL)
- [ ] Real-time notifications qua WebSocket / SSE
- [ ] Swagger API documentation
- [ ] Phân trang followers/following với tab view
- [ ] Infinite scroll cho trang profile posts
- [ ] Tính năng trending topics
