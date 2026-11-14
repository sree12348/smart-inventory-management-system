# Smart Inventory & Order Management

Java 21 + Spring Boot + PostgreSQL 17 + React/TypeScript. Nine normalized tables, REST endpoints, order creation with PostgreSQL row locking and transactions, responsive dashboard, and Docker Compose.

## Quick start (recommended)

Install Docker Desktop, then from this directory run:

```bash
docker compose up --build
```

Open http://localhost:5173 . Backend: http://localhost:8080/api/health .

**Note:** Docker uses its own PostgreSQL container and does not use or modify your locally created `smart_inventory` database. The database initializes from `backend/src/main/resources/schema.sql` on backend startup.

## Run with your local PostgreSQL instead

```bash
psql -d smart_inventory -f db/schema.sql
cd backend
mvn spring-boot:run
```

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The backend defaults to the current macOS username for database authentication. Override with `DB_USER`, `DB_PASSWORD`, `DB_URL` as needed.

## APIs

- GET `/api/health`
- GET `/api/dashboard`
- GET `/api/products`
- POST `/api/products` JSON: `{"sku":"ST-001","name":"Desk Stand","categoryId":2,"price":24.99}`
- GET `/api/customers`
- GET `/api/warehouses`
- GET `/api/orders`
- POST `/api/orders` JSON: `{"customerId":1,"productId":1,"warehouseId":1,"quantity":1}`

Demo data: customer 1, warehouse 1, two products. Orders lock the inventory row using `FOR UPDATE` and atomically reduce stock. Concurrent orders cannot oversell the same inventory row.

## Scope

This is a runnable MVP, not a production-ready system. Payments and shipments are modeled in the database but don't yet have APIs/UI. Production improvements include auth, migrations (Flyway), automated integration tests, robust error responses, pagination and additional inventory workflows.
