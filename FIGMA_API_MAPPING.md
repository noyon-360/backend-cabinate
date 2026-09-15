# SnapNDesign — Figma Screen → API Mapping

> Every screen in the Figma design and the exact API endpoint(s) it calls.

---

## 🔐 AUTH SCREENS (Mobile — Screens 1–6)

| Screen | Screen Name | Method | Endpoint | Request Body / Notes |
|--------|------------|--------|----------|----------------------|
| 1 | **Login** | POST | `/api/v1/auth/login` | `{ email, password }` → returns `accessToken`, `refreshToken` |
| 2 | **Forgot Password** | POST | `/api/v1/auth/forgot-password` | `{ email }` → sends OTP to email |
| 3 | **OTP Verify** (Forgot PW) | POST | `/api/v1/auth/verify-reset-otp` | `{ email, otp }` |
| 3 | **OTP Verify** (Register) | POST | `/api/v1/auth/verify-email` | `{ email, otp }` |
| 3 | **Resend OTP** button | POST | `/api/v1/auth/resend-otp` | `{ email }` |
| 4 | **Create New Password** | POST | `/api/v1/auth/reset-password` | `{ email, otp, password, confirmPassword }` |
| 5 | **Create Account** | POST | `/api/v1/auth/register` | `{ firstName, lastName, email, password, confirmPassword }` → auto-sends OTP |
| 6 | **Profile Setup** | PATCH | `/api/v1/user/profile` | `FormData: { firstName, lastName, phoneNumber, address, profileImage }` |

---

## 🔐 AUTH SCREENS (Web — Screens 28–31)

| Screen | Screen Name | Method | Endpoint | Notes |
|--------|------------|--------|----------|-------|
| 28 | **Web Login** | POST | `/api/v1/auth/login` | Same as mobile |
| 29 | **Web Forgot Password** | POST | `/api/v1/auth/forgot-password` | Same as mobile |
| 30 | **Web Verify Email OTP** | POST | `/api/v1/auth/verify-reset-otp` | Same as mobile |
| 31 | **Web Reset Password** | POST | `/api/v1/auth/reset-password` | Same as mobile |

---

## 🏠 HOME / DASHBOARD (Mobile — Screen 7)

| Action | Method | Endpoint | Response Fields Used |
|--------|--------|----------|----------------------|
| Load home stats | GET | `/api/v1/jobs/dashboard` | `activeJobs`, `proposalSentJobs`, `thisMonthRevenue`, `recentJobs[]` |
| Tap "View all" recent jobs | GET | `/api/v1/jobs?page=1&limit=20` | Full jobs list |

---

## 💼 JOB WORKFLOW (Mobile — Screens 8–16)

### Step 1 — Create Job (Screen 8)

| Action | Method | Endpoint | Request Body |
|--------|--------|----------|--------------|
| Submit "Create Job" button | POST | `/api/v1/jobs` | `{ date, customerName, propertyAddress, phoneNumber, emailAddress, notes }` |

### Step 1 — Job Details View (Screen 9)

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Load job details | GET | `/api/v1/jobs/:id` | Full job object |
| "Continue to Room Captured" | → navigate to Screen 10 | — | No API call, just navigation |

### Step 2 — Room Capture (Screen 10)

| Action | Method | Endpoint | Request Body |
|--------|--------|----------|--------------|
| Tap "Room Scan" + Continue | PATCH | `/api/v1/jobs/:id/room-capture` | `{ method: "Room Scan" }` |

### Step 3 — Measurements (Screen 11)

| Action | Method | Endpoint | Request Body |
|--------|--------|----------|--------------|
| Continue to Product | PATCH | `/api/v1/jobs/:id/measurements` | `{ width, depth, height }` (in meters) |

### Step 4 — Select Product (Screen 12)

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Load product list | GET | `/api/v1/products?category=Base` | Filter by Base/Wall/Tall tabs |
| Submit selected products | PATCH | `/api/v1/jobs/:id/products` | `{ products: [{ productId, quantity }] }` |

### Step 5 — AI Layout (Screen 13)

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Trigger AI layout gen | PATCH | `/api/v1/jobs/:id/ai-layout` | No body required |
| Poll until `status: "completed"` | GET | `/api/v1/jobs/:id` | Check `aiLayout.status` |

### Step 6 — Design (Screen 14)

| Action | Method | Endpoint | Request Body |
|--------|--------|----------|--------------|
| Load and display layout | GET | `/api/v1/jobs/:id` | `design.layoutName`, `design.layoutImage` |
| Save design / upload image | PATCH | `/api/v1/jobs/:id/design` | `FormData: { layoutName, layoutImage? }` |

### Step 7 — Estimate (Screen 15)

| Action | Method | Endpoint | Request Body |
|--------|--------|----------|--------------|
| Load estimate | GET | `/api/v1/jobs/:id` | `estimate` object, `selectedProducts[]` |
| Save estimate charges | PATCH | `/api/v1/jobs/:id/estimate` | `{ installationCharge, deliveryCharge, taxRate }` |

### Step 8 — Proposal (Screen 16)

| Action | Method | Endpoint | Request Body |
|--------|--------|----------|--------------|
| Generate proposal | POST | `/api/v1/jobs/:id/proposal` | `{ terms? }` |
| "Download PDF" button | — | `proposal.pdfUrl` from job object | Open URL in browser |

---

## 📋 ALL JOBS LIST (Mobile — Screen 17)

| Action | Method | Endpoint | Query Params |
|--------|--------|----------|--------------|
| Load all jobs | GET | `/api/v1/jobs` | `status`, `search`, `page`, `limit` |
| Filter by status tab | GET | `/api/v1/jobs?status=In Progress` | `status=New\|In Progress\|Completed\|Proposal Sent` |
| Search bar | GET | `/api/v1/jobs?search=Sarah` | `search=<text>` |
| Tap "+" FAB | → Screen 8 | POST `/api/v1/jobs` | Create new job |

---

## 🗂️ CATALOG (Mobile — Screens 18–20)

| Screen | Action | Method | Endpoint | Notes |
|--------|--------|--------|----------|-------|
| 18 | Load catalog grid | GET | `/api/v1/products?category=All&page=1` | Filter tabs: `All\|Base\|Wall\|Tall\|Island` |
| 18 | Search products | GET | `/api/v1/products?search=Cabinet` | Live search |
| 19 | Tap product → detail sheet | GET | `/api/v1/products/:id` | Shows name, dimensions, price, images |
| 20 | "Add to Project" → select job | GET | `/api/v1/jobs?status=In Progress` | Load active jobs for picker |
| 20 | Confirm add to job | POST | `/api/v1/jobs/add-product` | `{ jobId, productId, quantity }` |

---

## ⚙️ SETTINGS (Mobile — Screens 21–27)

| Screen | Action | Method | Endpoint | Notes |
|--------|--------|--------|----------|-------|
| 21 | Load settings (user info) | GET | `/api/v1/user/profile` | Display name + email |
| 21 | Logout button | POST | `/api/v1/auth/logout` | Clears token |
| 22 | Edit Profile (save) | PATCH | `/api/v1/user/profile` | `FormData: { firstName, lastName, phoneNumber, address, profileImage }` |
| 23 | General Settings screen | — | — | Navigate only |
| 24 | Change Password (save) | PATCH | `/api/v1/user/change-password` | `{ currentPassword, newPassword, confirmPassword }` |
| 25 | Notification toggles (save) | PATCH | `/api/v1/user/notifications` | `{ push, loan, transaction, fund, support }` |
| 26 | Contact Us (submit) | POST | `/api/v1/support` | `{ fullName, email, contactNumber, note }` |
| 27 | Delete Account (confirm) | DELETE | `/api/v1/user/delete-account` | `{ reason }` |

---

## 🖥️ WEB ADMIN — DASHBOARD (Screen 32)

| Widget | Method | Endpoint | Response Field |
|--------|--------|----------|---------------|
| Total Catalog card | GET | `/api/v1/jobs/dashboard` | `totalCatalog` |
| Active Jobs card | GET | `/api/v1/jobs/dashboard` | `activeJobs` |
| Total Staff card | GET | `/api/v1/jobs/dashboard` | `totalStaff` |
| Total Jobs card | GET | `/api/v1/jobs/dashboard` | `totalJobs` |
| Recent Jobs table | GET | `/api/v1/jobs/dashboard` | `recentJobs[]` |

---

## 🖥️ WEB ADMIN — JOBS (Screen 33–34)

| Screen | Action | Method | Endpoint | Notes |
|--------|--------|--------|----------|-------|
| 33 | Load jobs table | GET | `/api/v1/jobs?page=1&limit=10` | `status` filter: `In Progress\|Completed` tabs |
| 33 | Search jobs | GET | `/api/v1/jobs?search=Sarah` | |
| 34 | Open job detail modal | GET | `/api/v1/jobs/:id` | Shows proposal data |
| 34 | Download proposal PDF | — | `job.proposal.pdfUrl` | |

---

## 🖥️ WEB ADMIN — MY STAFF (Screens 35–39)

| Screen | Action | Method | Endpoint | Notes |
|--------|--------|--------|----------|-------|
| 35 | Load staff table | GET | `/api/v1/staff` | `search`, `status` query params |
| 36 | Add Staff modal (submit) | POST | `/api/v1/staff` | `FormData: { firstName, lastName, email, phoneNumber, password, profileImage }` |
| 38 | View staff detail → suspend | PATCH | `/api/v1/staff/:id/toggle-status` | Suspends active staff |
| 39 | View staff detail → activate | PATCH | `/api/v1/staff/:id/toggle-status` | Activates suspended staff |
| 35 | Delete staff (trash icon) | DELETE | `/api/v1/staff/:id` | |

---

## 🖥️ WEB ADMIN — PRODUCT CATALOG (Screen 40)

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Load catalog table | GET | `/api/v1/products/admin-catalog?page=1&limit=10` | Paginated table view |
| Search catalog | GET | `/api/v1/products/admin-catalog?search=Cabinet` | |
| Edit product (pencil icon) | PATCH | `/api/v1/products/:id` | `FormData: { name, price, ... }` |
| Delete product (trash icon) | DELETE | `/api/v1/products/:id` | |
| Add Product button | POST | `/api/v1/products` | `FormData: { sku, name, category, finish, width, height, depth, price, images }` |

---

## 📦 API Base URL

```
Development:  http://localhost:5000/api/v1
Production:   https://your-domain.com/api/v1
```

## 🔑 Auth Header (all protected routes)

```
Authorization: Bearer <accessToken>
```
