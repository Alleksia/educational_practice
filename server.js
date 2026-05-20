const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(session({
    secret: 'sea-cleaning-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24 // 24 часа
    }
}));


const db = new sqlite3.Database(path.join(__dirname, 'cleaning.db'));


db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            fio TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_fio TEXT NOT NULL,
            address TEXT NOT NULL,
            contact TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            service TEXT NOT NULL,
            payment TEXT NOT NULL,
            status TEXT DEFAULT 'new',
            cancel_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);


    db.get('SELECT id FROM users WHERE login = ?', ['adminka'], (err, row) => {
        if (!row) {
            db.run(
                'INSERT INTO users (login, password, fio, phone, email, role) VALUES (?, ?, ?, ?, ?, ?)',
                ['adminka', 'password', 'Администратор', '0', 'admin@myne-sam.ru', 'admin'],
                (err) => {
                    if (err) console.error('Ошибка создания админа:', err);
                    else console.log('✅ Администратор создан');
                }
            );
        }
    });

    console.log('✅ База данных готова');
});


function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
}

app.post('/api/register', (req, res) => {
    const { login, password, fio, phone, email } = req.body;

    if (!login || !password || !fio || !phone || !email) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }

    db.get('SELECT id FROM users WHERE login = ?', [login], (err, row) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        if (row) return res.status(409).json({ error: 'Логин уже занят' });

        db.run(
            'INSERT INTO users (login, password, fio, phone, email, role) VALUES (?, ?, ?, ?, ?, ?)',
            [login, password, fio, phone, email, 'user'],
            function(err) {
                if (err) return res.status(500).json({ error: 'Ошибка регистрации' });
                
                req.session.user = {
                    id: this.lastID,
                    login, fio, phone, email, role: 'user'
                };
                
                res.status(201).json(req.session.user);
            }
        );
    });
});

app.post('/api/login', (req, res) => {
    const { login, password } = req.body;

    if (!login || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    db.get(
        'SELECT * FROM users WHERE login = ? AND password = ?',
        [login, password],
        (err, user) => {
            if (err) return res.status(500).json({ error: 'Ошибка сервера' });
            if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

            req.session.user = {
                id: user.id,
                login: user.login,
                fio: user.fio,
                phone: user.phone,
                email: user.email,
                role: user.role
            };

            res.json(req.session.user);
        }
    );
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    res.json(req.session.user);
});

app.get('/api/orders/my', requireAuth, (req, res) => {
    db.all(
        'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
        [req.session.user.id],
        (err, orders) => {
            if (err) return res.status(500).json({ error: 'Ошибка сервера' });
            res.json(orders);
        }
    );
});

app.post('/api/orders', requireAuth, (req, res) => {
    const { address, contact, date, time, service, payment } = req.body;
    const user = req.session.user;

    if (!address || !contact || !date || !time || !service || !payment) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }

    db.run(
        'INSERT INTO orders (user_id, user_fio, address, contact, date, time, service, payment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, user.fio, address, contact, date, time, service, payment],
        function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка создания заявки' });

            db.get('SELECT * FROM orders WHERE id = ?', [this.lastID], (err, order) => {
                if (err) return res.status(500).json({ error: 'Ошибка сервера' });
                res.status(201).json(order);
            });
        }
    );
});

app.get('/api/admin/orders', requireAuth, requireAdmin, (req, res) => {
    db.all(
        'SELECT * FROM orders ORDER BY created_at DESC',
        (err, orders) => {
            if (err) return res.status(500).json({ error: 'Ошибка сервера' });
            res.json(orders);
        }
    );
});

app.patch('/api/admin/orders/:id', requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status, cancelReason } = req.body;

    if (!status || !['done', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Недопустимый статус' });
    }

    const reason = status === 'cancelled' ? (cancelReason || null) : null;

    db.run(
        'UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?',
        [status, reason, id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка обновления' });
            if (this.changes === 0) return res.status(404).json({ error: 'Заявка не найдена' });

            db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
                if (err) return res.status(500).json({ error: 'Ошибка сервера' });
                res.json(order);
            });
        }
    );
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/orders', (req, res) => res.sendFile(path.join(__dirname, 'create-order.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));


app.listen(PORT, () => {
    console.log(`🌊 Сервер запущен: http://localhost:${PORT}`);
    console.log(`📋 Логин админа: adminka / password`);
});