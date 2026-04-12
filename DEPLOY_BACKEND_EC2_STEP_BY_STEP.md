# Orion Chat Backend - Deploy EC2 Nhanh Nhat

Tai lieu nay chi deploy backend, de frontend goi den 1 link API co dinh (khong can ngrok trong production), theo che do local-db (postgres/mongo/redis chay bang container).

## 1. Ban can chuan bi

- 1 EC2 Ubuntu 22.04
- 1 domain/subdomain (khuyen nghi): `api.your-domain.com`
- Docker Hub account
- GitHub repo backend

## 2. Chuan bi code (da tao san trong repo)

Da co san:

- `Dockerfile`
- `.dockerignore`
- `.github/workflows/cicd-backend-ec2.yml`
- `docker-compose.backend.yml`
- `.env.production.example`
- `deploy/nginx/orion-backend.conf`
- `src/health.controller.ts`

## 3. Tao GitHub Secrets

Vao repo backend -> Settings -> Secrets and variables -> Actions. Tao cac secret:

- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `EC2_HOST`
- `EC2_USER` (thuong la `ubuntu`)
- `EC2_SSH_KEY` (toan bo private key .pem)

## 4. Setup EC2 (1 lan duy nhat)

### 4.1 SSH vao EC2

```bash
ssh -i /path/to/key.pem ubuntu@<EC2_PUBLIC_IP>
```

### 4.2 Cai Docker + Compose plugin

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker ubuntu
newgrp docker
```

### 4.3 Tao thu muc deploy + env

```bash
mkdir -p ~/orion-chat-backend
cd ~/orion-chat-backend
```

Tao `.env.production` (copy tu `.env.production.example` trong repo) va thay gia tri that.

Luu y bat buoc (local-db):

- `DB_HOST=postgres`
- `MONGO_URI=mongodb://root:...@mongodb:27017/orion_chat?authSource=admin`
- `REDIS_HOST=redis`
- `TYPEORM_SYNC=false`
- `ALLOWED_ORIGINS=` danh sach domain frontend, cach nhau bang dau phay
- `SOCKET_ALLOWED_ORIGINS=` tuong tu

Neu ban da tung deploy truoc do va vua doi `DB_USER`/`DB_NAME`/`DB_PASSWORD` hoac `MONGO_INITDB_*`, co the bi loi `unhealthy` do volume cu giu credential cu.

Reset volume (CHI khi chap nhan xoa du lieu cu):

```bash
cd ~/orion-chat-backend
docker compose -f docker-compose.backend.yml --env-file .env.production down
docker volume rm orion-chat-backend_postgres_data orion-chat-backend_mongo_data orion-chat-backend_redis_data
docker compose -f docker-compose.backend.yml --env-file .env.production up -d
```

## 5. Setup Nginx reverse proxy + SSL

### 5.1 Cai Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 5.2 Tao file Nginx

```bash
sudo nano /etc/nginx/sites-available/orion-backend
```

Dan noi dung tu file `deploy/nginx/orion-backend.conf` (doi `server_name`).

### 5.3 Enable site

```bash
sudo ln -s /etc/nginx/sites-available/orion-backend /etc/nginx/sites-enabled/orion-backend
sudo nginx -t
sudo systemctl reload nginx
```

### 5.4 Cap SSL

```bash
sudo certbot --nginx -d api.your-domain.com
```

## 6. Trigger CI/CD

Chi can push code len `develop`:

```bash
git add .
git commit -m "setup backend ec2 cicd"
git push origin develop
```

Workflow se:

- build image backend
- push Docker Hub
- SSH vao EC2
- pull image theo SHA
- `docker compose up -d`

## 7. Kiem tra sau deploy

Tren EC2:

```bash
cd ~/orion-chat-backend
docker compose -f docker-compose.backend.yml --env-file .env.production ps
docker compose -f docker-compose.backend.yml --env-file .env.production logs -f backend
```

Tu may local:

```bash
curl https://api.your-domain.com/health
```

Ky vong tra ve `ok: true`.

## 8. Frontend can doi gi?

Sau khi backend len EC2:

- REST base URL: `https://api.your-domain.com`
- Socket URL: `https://api.your-domain.com/chat`, `https://api.your-domain.com/call`, `https://api.your-domain.com/presence`

Khong can ngrok trong production.

## 9. Security can lam ngay

- Rotate toan bo secret da tung dat trong file `.env` cu
- Khong commit `.env.production`
- Security Group chi mo:
  - 22 tu IP cua ban
  - 80/443 public
  - khong mo 8080 public (Nginx se proxy noi bo)

## 10. Database co mat khi tat Docker khong?

Khong mat neu ban dung named volume (file compose da dung san):

- `postgres_data` cho PostgreSQL
- `mongo_data` cho MongoDB
- `redis_data` cho Redis

Du lieu CHI mat khi ban xoa volume. Vi du nguy hiem:

- `docker compose down -v`
- `docker volume rm ...`
- xoa thu muc `/var/lib/docker/volumes/...`

Lenh an toan (khong mat database):

```bash
docker compose -f docker-compose.backend.yml --env-file .env.production stop
docker compose -f docker-compose.backend.yml --env-file .env.production start
docker compose -f docker-compose.backend.yml --env-file .env.production up -d
```

Khuyen nghi backup dinh ky:

- Postgres: `pg_dump`
- MongoDB: `mongodump`

## 11. Checklist verify trong 5 phut

1. Kiem tra workflow tren GitHub da xanh (build + deploy).

2. Kiem tra container tren EC2:

```bash
cd ~/orion-chat-backend
docker compose -f docker-compose.backend.yml --env-file .env.production ps
```

Trang thai mong doi: `backend`, `postgres`, `mongodb`, `redis` deu `Up` (healthy neu co).

3. Kiem tra health API:

```bash
curl -i https://api.your-domain.com/health
```

Mong doi: HTTP 200, body co `"ok": true`.

4. Kiem tra log backend nhanh:

```bash
docker compose -f docker-compose.backend.yml --env-file .env.production logs --tail=120 backend
```

Mong doi: khong co crash loop, khong co loi ket noi DB.

5. Test tu frontend:

- goi 1 API can auth (login/profile)
- tao 1 ban ghi nho (vi du note/message)
- refresh lai de xac nhan du lieu van con

## 12. Muon sua DB thi co phai SSH vao EC2 khong?

Neu ban dung Mongo/Postgres container tren EC2 nhu file compose hien tai, cau tra loi la: **co**.

Cach an toan nhat:

- SSH vao EC2
- vao shell cua container
- dung psql/mongosh ben trong container

PostgreSQL:

```bash
ssh -i /path/to/key.pem ubuntu@<EC2_PUBLIC_IP>
cd ~/orion-chat-backend
docker compose -f docker-compose.backend.yml --env-file .env.production exec postgres psql -U orion_user -d orion_chat
```

MongoDB:

```bash
ssh -i /path/to/key.pem ubuntu@<EC2_PUBLIC_IP>
cd ~/orion-chat-backend
docker compose -f docker-compose.backend.yml --env-file .env.production exec mongodb mongosh "mongodb://root:<MONGO_INITDB_ROOT_PASSWORD>@localhost:27017/orion_chat?authSource=admin"
```

Khong khuyen nghi mo port DB ra Internet (5432/27017).

Neu can dung local client (DBeaver, Compass) ma van an toan, dung SSH tunnel:

```bash
# PostgreSQL tunnel
ssh -i /path/to/key.pem -L 5432:127.0.0.1:5432 ubuntu@<EC2_PUBLIC_IP>

# MongoDB tunnel
ssh -i /path/to/key.pem -L 27017:127.0.0.1:27017 ubuntu@<EC2_PUBLIC_IP>
```

Sau do local app ket noi `localhost:5432` hoac `localhost:27017`.
