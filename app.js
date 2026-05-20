const API = {
    async request(url, options = {}) {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
        return data;
    },

    getMe() { return this.request('/api/me'); },
    login(login, password) {
        return this.request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ login, password })
        });
    },
    register(user) {
        return this.request('/api/register', {
            method: 'POST',
            body: JSON.stringify(user)
        });
    },
    logout() {
        return this.request('/api/logout', { method: 'POST' });
    },
    getMyOrders() { return this.request('/api/orders/my'); },
    createOrder(order) {
        return this.request('/api/orders', {
            method: 'POST',
            body: JSON.stringify(order)
        });
    },
    getAllOrders() { return this.request('/api/admin/orders'); },
    updateOrderStatus(id, status, cancelReason) {
        return this.request(`/api/admin/orders/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status, cancelReason })
        });
    }
};