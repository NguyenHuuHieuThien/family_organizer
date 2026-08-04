# Ke Hoach Thiet Ke Lai Database

## Implementation Status

Da ap dung giai doan dau trong `server/mongoose.ts`:

- Mac dinh `DB_STORAGE=collections` se luu du lieu vao nhieu collection theo domain.
- Neu MongoDB collections dang trong, server tu import tu document legacy `family_state` hoac seed ban dau.
- Document legacy `family_state` duoc giu lai de rollback; dat `DB_STORAGE=legacy` de chay lai che do cu.
- `getFullSnapshot()` van tra shape `FamilyOrganizerDB`, nen backup/restore va API hien tai tiep tuc hoat dong.
- Da tao index co ban cho cac collection moi.
- Da toi uu runtime write: `mongooseSave()` so sanh snapshot da persist gan nhat voi snapshot moi va chi ghi lai collection thay doi, vi du sua task chi persist `tasks` thay vi ghi lai tat ca collection.

Luu y: giai doan nay van giu API dong bo cua `FamilyDB`, nen storage van nhan snapshot hien tai tu service layer. Buoc toi uu tiep theo la chuyen tung method nong sang atomic update truc tiep tren tung collection.

## 1. Hien Trang

Hien tai he thong dang dung MongoDB qua `server/mongoose.ts`, nhung gan nhu toan bo du lieu nghiep vu duoc gom vao 1 document duy nhat:

- Collection `family_state`
- Document `_id = "family-state"`
- Field `data` chua toan bo `FamilyOrganizerDB`: users, tasks, plans, notes, finance, health, documents, photos, chat, notifications, backups...

Ngoai ra chi co `server_metrics` la collection rieng.

Van de cua cach nay:

- Moi lan sua mot task/transaction/note deu phai doc/ghi snapshot lon.
- Khong index duoc tot theo tung domain, vi du `tasks.assigneeIds`, `transactions.date`, `documents.expiryDate`.
- De xay ra race condition: 2 request cap nhat 2 mang khac nhau van cung ghi lai ca state.
- Backup/restore de lam, nhung migration va quan sat du lieu kho hon khi app lon dan.
- Chat, notifications, activity logs, market history la du lieu tang nhanh nhung dang nam chung voi cau hinh/nghiep vu chinh.

Muc tieu thiet ke moi: tach collection theo domain, giu API hien tai hoat dong, co migration tung buoc va co rollback an toan.

## 2. Nguyen Tac Thiet Ke

1. Tach theo aggregate/domain, khong tach qua nho ngay tu dau.
2. Collection nao can query/filter/sort rieng thi tach rieng.
3. Subdocument chi dung cho du lieu nho va luon di kem parent, vi du `task.comments` co the tach sau neu lon.
4. File media tiep tuc luu o `data/uploads/**`; database chi luu metadata va URL.
5. Khong luu secret vao DB backup nghiep vu. `app_settings.json` hoac collection settings rieng can co co che exclude secret khi backup.
6. Moi document co `createdAt`, `updatedAt`, va khi can audit thi co `createdById`, `updatedById`, `deletedAt`/`isDeleted`.
7. ID hien tai nen giu nguyen de frontend, backup va deep link khong vo.

## 3. Collection De Xuat

### Core / Identity

#### `users`

Luu thanh vien va thong tin dang nhap.

Fields chinh:

- `_id` / `id`
- `username`
- `passwordHash`
- `fullName`
- `role`
- `familyRelation`
- `avatarColor`, `avatarImage`
- `dateOfBirth`, `gender`, `phone`
- `isDeleted`
- `createdAt`, `updatedAt`

Indexes:

- unique `username`
- `role`
- `isDeleted`

#### `push_subscriptions`

Tach khoi users vi 1 user co nhieu device/browser.

Indexes:

- unique `endpoint`
- `userId`

### Tasks / Collaboration

#### `tasks`

Fields chinh tu `Task` hien tai:

- `_id` / `id`
- `title`, `description`
- `status`, `priority`
- `dueDate`
- `creatorId`
- `assigneeId`, `assigneeIds`
- `isShared`, `tags`
- `rewardPoints`
- `completedById`, `completedAt`
- `pendingApproval`, `submittedById`, `submittedAt`, `proofImage`, `proofNote`, `rejectionReason`
- recurrence fields: `recurrenceType`, `recurrenceInterval`, `recurrenceEndDate`, `rotationMemberIds`, `sourceRecurringTaskId`
- `comments` va `history` co the giu embedded giai doan 1
- `createdAt`, `updatedAt`

Indexes:

- `status`, `priority`
- `dueDate`
- `creatorId`
- `assigneeIds`
- `isShared`
- text index cho `title`, `description`, `tags`

Giai doan sau neu comments/history lon:

- Tach `task_comments`
- Tach `task_history`

#### `plans`

Luu lich/su kien gia dinh.

Indexes:

- `startDate`, `endDate`
- `creatorId`
- `isShared`
- `recurrenceType`

#### `notes`

Luu ghi chu markdown.

Indexes:

- `creatorId`
- `isShared`
- `isPinned`
- `tags`
- text index cho `title`, `content`, `tags`

### Finance

#### `transactions`

Luu thu/chi.

Indexes:

- `date`
- compound `{ type, date }`
- compound `{ category, date }`
- `creatorId`
- `account`

#### `budgets`

Luu han muc theo thang/category.

Indexes:

- unique compound `{ month, category }`

#### `recurring_bills`

Luu hoa don dinh ky.

Indexes:

- `nextDueDate`
- `isActive`
- `category`

#### `savings_goals`

Luu muc tieu tiet kiem. Giai doan 1 co the giu `contributions` embedded vi luon hien trong goal.

Indexes:

- `creatorId`
- `isShared`
- `deadline`

Neu so dong dong gop tang lon, tach thanh `savings_contributions` voi index `goalId`, `date`, `byId`.

#### `debts`

Luu vay/cho muon. Giai doan 1 giu `payments` embedded.

Indexes:

- `direction`
- `counterparty`
- `dueDate`
- `isSettled`
- `creatorId`

Neu lich su thanh toan lon, tach `debt_payments` voi index `debtId`, `date`, `byId`.

#### `assets`

Luu tai san gia dinh.

Indexes:

- `type`
- `ownerId`
- `isPinned`
- `createdById`
- text index cho `name`, `notes`, `symbol`, `certificateNo`, `serialNo`

### Rewards

#### `reward_ledger`

Luu bien dong diem thuong.

Indexes:

- `userId`
- `taskId`
- `createdAt`
- `createdById`

#### `reward_items`

Luu cua hang doi thuong.

Indexes:

- `isActive`
- `cost`

### Health

#### `medications`

Luu lich nhac uong thuoc.

Indexes:

- `patientId`
- `isActive`
- `startDate`, `endDate`

#### `medication_logs`

Luu nhat ky tung lieu thuoc.

Indexes:

- unique compound `{ medicationId, date, time }`
- `patientId`
- `loggedById`
- `date`

#### `vaccinations`

Luu tiem chung tre em.

Indexes:

- `childId`
- `scheduledDate`
- `doneDate`
- `status`

#### `growth_records`

Luu tang truong tre em.

Indexes:

- compound `{ childId, date }`

#### `health_profiles`

Moi user toi da 1 ho so khan cap.

Indexes:

- unique `userId`

### Documents / Media

#### `documents`

Luu giay to gia dinh va metadata file scan.

Indexes:

- `type`
- `ownerId`
- `expiryDate`
- `creatorId`
- `isShared`
- text index cho `title`, `documentNumber`, `issuer`, `notes`

#### `photos`

Luu album anh gia dinh.

Indexes:

- `ownerId`
- `album`
- `takenAt`
- `tags`
- `isShared`
- `creatorId`

### Shopping / Meal Planning

#### `shopping_items`

Indexes:

- `isPurchased`
- `creatorId`
- `purchasedById`
- `createdAt`

#### `dish_library`

Indexes:

- `slot`
- `source`
- text index cho `name`, `ingredients.name`

#### `meal_plans`

Hien app chi co mot weekly meal plan chung. Nen luu dang collection rieng voi document hien hanh:

- `_id = "current"`
- `days`, `groceries`, `source`, `adults`, `children`, `updatedAt`, `updatedById`

Neu sau nay can lich su, them `weekStart` va index unique `weekStart`.

### Communication / System Data

#### `chat_messages`

Du lieu tang nhanh nen phai tach rieng.

Indexes:

- `createdAt`
- `senderId`

Can co retention tuy chon neu muon gioi han dung luong.

#### `notifications`

Indexes:

- compound `{ userId, isRead, createdAt }`
- `type`

Can TTL index tuy chon cho thong bao cu, vi du xoa sau 180 ngay neu da read.

#### `activity_logs`

Indexes:

- `createdAt`
- `userId`
- `action`

Giu retention hien tai 300 ban ghi hoac chuyen sang TTL/time window.

#### `backups`

Chi luu metadata file backup.

Indexes:

- `createdAt`
- `type`

#### `market_history`

Du lieu time-series.

Indexes:

- unique `at`

Co the dung MongoDB time-series collection neu muon toi uu:

- `timeField: "at"`
- retention 30-90 ngay tuy nhu cau bieu do.

#### `server_metrics`

Da tach rieng. Nen giu collection nay, co TTL 7 ngay nhu logic hien tai.

## 4. Cau Truc Collection Tong Hop

Danh sach collection muc tieu:

```text
users
push_subscriptions

tasks
plans
notes

transactions
budgets
recurring_bills
savings_goals
debts
assets

reward_ledger
reward_items

medications
medication_logs
vaccinations
growth_records
health_profiles

documents
photos

shopping_items
dish_library
meal_plans

chat_messages
notifications
activity_logs
backups
market_history
server_metrics

app_meta
```

`app_meta` dung cho:

- `schemaVersion`
- migration history
- storage mode
- latest successful migration checkpoint

Khong nen luu secret o `app_meta` neu backup se export collection nay.

## 5. Lop Truy Cap Du Lieu De Xuat

Hien tai `FamilyDB` co API dang doc/ghi snapshot:

```ts
const db = this.readRaw();
db.tasks.push(task);
this.writeRaw(db);
```

Nen chuyen theo 2 giai doan.

### Giai doan 1: Repository adapter giu API cu

Tao interface storage:

```ts
interface FamilyStorage {
  getUsers(): Promise<UserWithPassword[]>;
  upsertUser(user: UserWithPassword): Promise<void>;
  getTasks(filter?: TaskFilter): Promise<Task[]>;
  upsertTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  getFullSnapshot(): Promise<FamilyOrganizerDB>;
  replaceFullSnapshot(snapshot: FamilyOrganizerDB): Promise<void>;
}
```

Sau do co 2 implementation:

- `LegacyStateStorage`: dung `family_state.data` hien tai.
- `MongoCollectionsStorage`: dung collection moi.

`FamilyDB` tam thoi goi qua adapter de API route trong `server.ts` it phai doi ngay.

### Giai doan 2: Chuyen tung method sang query truc tiep

Sau khi storage moi on dinh, thay cac method hay dung nhieu nhu:

- `getTasks()` -> query `tasks.find(...)`
- `saveTransaction()` -> `transactions.updateOne(...)`
- `getNotifications()` -> query theo user/read status
- `getChatMessages(limit)` -> sort/limit tren collection rieng

Luc nay khong can tao snapshot lon cho request thong thuong nua.

## 6. Chien Luoc Migration

### Buoc 0: Dong bang schema hien tai

- Xac nhan `FamilyOrganizerDB` hien tai trong `src/types.ts` la source of truth cho migration.
- Tao backup JSON tu `FamilyDB.getFullSnapshot()` truoc khi chay migration.
- Them `schemaVersion` vao `app_meta`.

### Buoc 1: Tao collection va index

- Tao Mongoose schema rieng cho tung collection.
- Tao index bang migration script, khong chi dua vao auto-index runtime.
- Tat auto-index trong production neu can on dinh performance.

### Buoc 2: Import tu `family_state.data`

Doc document cu:

```js
const state = db.family_state.findOne({ _id: "family-state" }).data;
```

Ghi sang collection moi:

- `state.users` -> `users`
- `state.tasks` -> `tasks`
- `state.transactions` -> `transactions`
- ... mapping tuong ung theo danh sach tren.

Quy tac import:

- Giu nguyen `id` cu, va set `_id = id` neu phu hop.
- Neu document thieu `updatedAt`, dat bang `createdAt` hoac thoi diem migration.
- Chuan hoa mang optional thanh `[]`, field optional thanh `null` neu schema can.
- Khong copy `app_settings.json` vao collection nghiep vu.

### Buoc 3: Dual-read validation

Truoc khi switch production:

- `LegacyStateStorage.getFullSnapshot()` va `MongoCollectionsStorage.getFullSnapshot()` phai tao snapshot tuong duong.
- So sanh count tung domain.
- So sanh checksum JSON da sort key cho cac collection quan trong.

### Buoc 4: Switch read/write sang collection moi

- Dat env `DB_STORAGE=collections` hoac `MONGO_STORAGE_MODE=collections`.
- App ghi vao collection moi.
- Giu document `family_state` cu o che do read-only trong 1-2 phien ban de rollback.

### Buoc 5: Backup/restore moi

Backup moi nen export theo format:

```json
{
  "schemaVersion": 2,
  "exportedAt": "...",
  "collections": {
    "users": [],
    "tasks": [],
    "plans": [],
    "notes": [],
    "transactions": []
  }
}
```

Van nen ho tro restore backup cu dang `FamilyOrganizerDB` trong it nhat 1-2 phien ban.

## 7. Thu Tu Uu Tien Tach Collection

Nen lam theo thu tu duoi day de giam rui ro:

1. Tach collection tang nhanh/doc nhieu: `chat_messages`, `notifications`, `activity_logs`, `market_history`.
2. Tach domain doc/ghi thuong xuyen: `tasks`, `plans`, `notes`, `shopping_items`.
3. Tach finance: `transactions`, `budgets`, `recurring_bills`, `savings_goals`, `debts`, `assets`.
4. Tach health/documents/media metadata: `medications`, `medication_logs`, `vaccinations`, `growth_records`, `health_profiles`, `documents`, `photos`.
5. Tach identity/reward/backups/settings metadata: `users`, `reward_ledger`, `reward_items`, `backups`, `app_meta`.

Ly do khong tach `users` dau tien: day la phan lien quan auth/session/password. Nen tach sau khi adapter va migration validation da on dinh.

## 8. RUI RO Va Cach Giam

### Race condition trong giai doan hien tai

Rui ro: request A va B cung doc state cu, moi request sua 1 mang khac nhau, request ghi sau co the ghi de thay doi request truoc.

Giam rui ro: tach collection va dung atomic update theo document.

### Restore backup cu

Rui ro: backup JSON cu la object `FamilyOrganizerDB`, backup moi la multi-collection export.

Giam rui ro: restore detect format theo `schemaVersion` / `collections`.

### Embedded array lon

Rui ro: `task.comments`, `task.history`, `savingsGoal.contributions`, `debt.payments` co the lon dan.

Giam rui ro: giai doan 1 giu embedded de migration don gian; dat nguong tach sau neu can.

### Secret/config

Rui ro: dua Gemini/Telegram/Google tokens vao backup neu gom het vao DB.

Giam rui ro: tiep tuc de secret ngoai business backup, hoac danh dau collection/field sensitive va exclude khi export.

## 9. Acceptance Criteria Cho Ban Migration Dau Tien

Ban dau tien duoc coi la xong khi:

- Co migration script tao collection va index.
- Chay import tu `family_state.data` sang collection moi ma khong mat ID.
- Count tung domain khop voi snapshot cu.
- `getFullSnapshot()` tu collection moi tra ve duoc shape `FamilyOrganizerDB` de backup/API cu van dung.
- App co flag chon storage mode: legacy vs collections.
- Co backup an toan truoc migration va huong dan rollback.

## 10. De Xuat Trien Khai Gan Nhat

Sprint 1 nen lam cac viec sau:

1. Tao `server/storage/` gom interface va 2 adapter: legacy + collections.
2. Tao Mongoose model rieng cho cac collection uu tien: `chat_messages`, `notifications`, `activity_logs`, `market_history`, `tasks`, `plans`, `notes`.
3. Viet migration script `scripts/migrate-family-state-to-collections.ts`.
4. Viet verifier script so sanh legacy snapshot voi collections snapshot.
5. Chay dry-run tren ban copy database truoc khi switch production.

Sau khi sprint 1 on dinh moi tach tiep finance/health/documents.
