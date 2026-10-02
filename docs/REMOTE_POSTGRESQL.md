# Remote / Networked PostgreSQL Setup

AI-MailNlyzer never assumes PostgreSQL is running on `localhost`. The
database can live on another laptop, another machine on your LAN, or a
cloud-hosted instance — everything is driven by the `DATABASE_URL`
environment variable.

## 1. Install PostgreSQL on the target machine

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
```

## 2. Create the database and a dedicated user

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE mailtrace;
CREATE USER mailtrace_user WITH ENCRYPTED PASSWORD 'choose_a_strong_password';
GRANT ALL PRIVILEGES ON DATABASE mailtrace TO mailtrace_user;
```

## 3. Allow remote connections

Edit `postgresql.conf` (commonly `/etc/postgresql/16/main/postgresql.conf`):

```conf
listen_addresses = '*'
```

Edit `pg_hba.conf` (same directory) to allow your application host(s):

```conf
# TYPE  DATABASE   USER            ADDRESS            METHOD
host    mailtrace  mailtrace_user  0.0.0.0/0          scram-sha-256
```

Restrict `ADDRESS` to your actual network range in production
(e.g. `192.168.1.0/24`) rather than `0.0.0.0/0`.

Restart PostgreSQL:

```bash
sudo systemctl restart postgresql
```

## 4. Open the firewall

```bash
sudo ufw allow 5432/tcp
```

## 5. Test connectivity from the application host

```bash
psql "postgresql://mailtrace_user:choose_a_strong_password@<DB_HOST_IP>:5432/mailtrace"
```

## 6. Set DATABASE_URL

In `backend/.env` and `ai-service/.env`:

```env
DATABASE_URL=postgresql://mailtrace_user:choose_a_strong_password@<DB_HOST_IP>:5432/mailtrace
```

## 7. Run Prisma migrations

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
npm run seed
```

## 8. pgvector

See `docs/PGVECTOR.md` for enabling semantic search on the same instance.
