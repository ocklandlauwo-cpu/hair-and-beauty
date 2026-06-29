# Production Deployment Runbook

## Prerequisites

- DirectAdmin VPS with PHP 8.4, PostgreSQL 17, Node 24
- Domain and SSL certificate configured in DirectAdmin
- SSH access to server

## First-Time Setup

### 1. Clone the repository
```bash
cd /var/www
git clone <your-repo-url> hairbeauty
```

### 2. Set up PostgreSQL roles and database
```bash
psql -U postgres -f /var/www/hairbeauty/backend/database/setup/postgresql-roles.sql
```
Edit the SQL file first: replace `'owner_secret'` and `'app_secret'` with strong passwords.

### 3. Configure backend environment
```bash
cp backend/.env.production.example backend/.env
nano backend/.env   # Fill in DB passwords, app key, mail credentials
php8.4 artisan key:generate   # Paste output into APP_KEY
```

### 4. Configure frontend environment
```bash
cp frontend/.env.example frontend/.env
nano frontend/.env  # Set VITE_API_URL=https://yourdomain.com/api/v1
```

### 5. Run deploy script
```bash
bash ops/deploy.sh
```

### 6. Configure DirectAdmin cron (scheduler)
In DirectAdmin → Cron Jobs, add:
```
* * * * * /usr/bin/php8.4 /var/www/hairbeauty/backend/artisan schedule:run >> /dev/null 2>&1
```

### 7. Configure DirectAdmin web server
Point document root to `/var/www/hairbeauty/frontend/dist` for the SPA.
Add a `.htaccess` or nginx rule to redirect all non-asset requests to `index.html` (SPA routing).
Configure a reverse proxy or separate subdomain for the API at `/var/www/hairbeauty/backend/public`.

### 8. Process queued jobs
Since there is no Supervisor/Redis, queued jobs run via the scheduler:
In `backend/routes/console.php`, add:
```php
Schedule::command('queue:work --stop-when-empty')->everyMinute()->runInBackground();
```

## Ongoing Deployments

```bash
ssh user@yourserver.com
cd /var/www/hairbeauty
bash ops/deploy.sh
```

## Creating the First Admin User

```bash
php8.4 artisan tinker
```
```php
use App\Models\User;
use Illuminate\Support\Facades\Hash;

User::create([
    'name'     => 'Administrator',
    'email'    => 'admin@yourdomain.com',
    'password' => Hash::make('change-me-immediately'),
    'role'     => 'admin',
    'is_active' => true,
]);
```

## UAT Seed Data (for testing before go-live)

```bash
php8.4 artisan db:seed --class=UatSeeder
```
This creates 200 products, 5 test users (admin, store_keeper, 3 sellers), and 3 months of realistic sales history.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login returns 401 | Check APP_KEY is set; check DB has users |
| PDF download fails | Check MAIL_* and APP_URL settings |
| Scheduled reports not sending | Verify cron is running: `crontab -l` |
| Blank page after deploy | Check `frontend/.env` VITE_API_URL matches production API URL |
| 500 errors | Check `backend/storage/logs/laravel.log` |
