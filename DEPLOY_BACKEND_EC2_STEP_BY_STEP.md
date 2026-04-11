# Orion Chat Backend - Deploy EC2 Nhanh Nhat

Tai lieu nay chi deploy backend, de frontend goi den 1 link API co dinh (khong can ngrok trong production).

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

Luu y bat buoc:
- `DB_HOST=postgres`
- `MONGO_URI=mongodb://root:...@mongodb:27017/orion_chat?authSource=admin`
- `REDIS_HOST=redis`
- `TYPEORM_SYNC=false`
- `ALLOWED_ORIGINS=` danh sach domain frontend, cach nhau bang dau phay
- `SOCKET_ALLOWED_ORIGINS=` tuong tu

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

Chi can push code len `main` hoac `dev`:

```bash
git add .
git commit -m "setup backend ec2 cicd"
git push origin main
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
